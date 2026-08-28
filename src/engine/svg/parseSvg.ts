import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { LineCurve, Path, Shape, Vector2, type Curve, type ShapePath } from 'three'
import type { ParsedSvg, SvgRegion } from '../../models/ParsedSvg'
import { unionPolygons } from '../clipping/polyBoolean'
import { resolveFill } from './colors'

const COLLINEAR_EPSILON = 1e-6
const MAX_SUBDIVISION_DEPTH = 6

interface SampledOutline {
  contour: Vector2[]
  holes: Vector2[][]
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function parseSvgToRegions(svgText: string): ParsedSvg {
  const loader = new SVGLoader()
  const result = loader.parse(svgText)

  const warnings: string[] = []
  const regionOrder: string[] = []
  const outlinesByColor = new Map<string, SampledOutline[]>()

  let unsupportedFills = 0
  let strokeOnlyPaths = 0

  const flatness = estimateFlatness(result.paths)

  for (const svgPath of result.paths) {
    const style = (svgPath.userData?.style ?? {}) as { fill?: unknown; stroke?: unknown }
    const fill = resolveFill(style.fill)
    const hasStroke =
      typeof style.stroke === 'string' && style.stroke !== '' && style.stroke !== 'none'

    if (fill.kind === 'unsupported') {
      unsupportedFills++
      continue
    }
    if (fill.kind === 'none') {
      if (hasStroke) strokeOnlyPaths++
      continue
    }

    let rawShapes: Shape[]
    try {
      rawShapes = resolveShapes(svgPath)
    } catch {
      warnings.push('No se pudieron interpretar uno o más trazos del SVG.')
      continue
    }

    for (const rawShape of rawShapes) {
      const outline = sampleOutline(rawShape, flatness)
      if (outline) {
        addOutline(outlinesByColor, regionOrder, fill.hex, outline)
      }
    }
  }

  if (unsupportedFills > 0) {
    warnings.push(
      `${unsupportedFills} elemento(s) usan gradientes o patrones; solo los colores sólidos se convierten en geometría.`,
    )
  }
  if (strokeOnlyPaths > 0) {
    warnings.push(
      `${strokeOnlyPaths} trazo(s) usan solo contorno (stroke); el contorno no se genera en esta versión.`,
    )
  }

  const allOutlines = [...outlinesByColor.values()].flat()
  centerAndFlip(allOutlines)

  const bounds = measureOutlines(allOutlines)
  const regions: SvgRegion[] = regionOrder.map((color) => {
    const shapes = (outlinesByColor.get(color) ?? []).map(toShape)
    return { originalColor: color, shapes, polys: sanitizeRegionPolys(shapes) }
  })

  return {
    regions,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    warnings,
  }
}

/**
 * Resuelve auto-intersecciones y solapes de los contornos de una región
 * (paridad par-impar) una sola vez, produciendo polígonos simples CON SUS
 * HUECOS preservados ([exterior, ...huecos]) para que la geometría sea fiel
 * al original y cualquier motor booleano reciba entrada ya saneada.
 */
function sanitizeRegionPolys(shapes: Shape[]): Vector2[][][] {
  const polygons: [number, number][][][] = []
  for (const shape of shapes) {
    const polygon = polygonFromShape(shape)
    if (polygon) polygons.push(polygon)
  }

  try {
    const merged = unionPolygons(polygons)
    const polys: Vector2[][][] = []
    for (const polygon of merged) {
      const converted: Vector2[][] = []
      for (const ring of polygon) {
        converted.push(ring.slice(0, -1).map(([x, y]) => new Vector2(x, y)))
      }
      if (converted.length > 0) polys.push(converted)
    }
    return polys.length > 0 ? polys : fallbackPolys(shapes)
  } catch {
    return fallbackPolys(shapes)
  }
}

function polygonFromShape(shape: Shape): [number, number][][] | null {
  const outer = dedupeRing(shape.getPoints(12))
  if (!outer || outer.length < 3) return null

  const polygon: [number, number][][] = [outer]
  for (const hole of shape.holes) {
    const holeRing = dedupeRing(hole.getPoints(12))
    if (holeRing && holeRing.length >= 3) {
      polygon.push(holeRing)
    }
  }
  return polygon
}

function dedupeRing(points: Vector2[]): [number, number][] {
  const ring: [number, number][] = []
  for (const point of points) {
    const last = ring[ring.length - 1]
    if (
      last &&
      Math.abs(last[0] - point.x) < COLLINEAR_EPSILON &&
      Math.abs(last[1] - point.y) < COLLINEAR_EPSILON
    ) {
      continue
    }
    ring.push([point.x, point.y])
  }
  if (ring.length > 1) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (
      Math.abs(first[0] - last[0]) < COLLINEAR_EPSILON &&
      Math.abs(first[1] - last[1]) < COLLINEAR_EPSILON
    ) {
      ring.pop()
    }
  }
  return ring
}

function fallbackPolys(shapes: Shape[]): Vector2[][][] {
  const polys: Vector2[][][] = []
  for (const shape of shapes) {
    const polygon = polygonFromShape(shape)
    if (!polygon) continue
    polys.push(polygon.map((ring) => ring.map(([x, y]) => new Vector2(x, y))))
  }
  return polys
}

/**
 * Garantiza que la regla de relleno (nonzero/evenodd) se respete siempre:
 * algunos entornos DOM no exponen `fill-rule` en userData.style, así que se
 * lee del nodo original y se normaliza antes de clasificar subtrazados.
 */
function resolveShapes(svgPath: ShapePath): Shape[] {
  if (!svgPath.userData || typeof svgPath.userData !== 'object') {
    svgPath.userData = {}
  }
  const userData = svgPath.userData as { style?: Record<string, unknown>; node?: Element }
  if (!userData.style || typeof userData.style !== 'object') {
    userData.style = {}
  }
  const style = userData.style
  const node = userData.node
  const attr =
    node && typeof node.getAttribute === 'function' ? node.getAttribute('fill-rule') : null
  if (typeof attr === 'string' && attr.trim() !== '') {
    style.fillRule = attr.trim()
  } else if (typeof style.fillRule !== 'string' || style.fillRule === '') {
    style.fillRule = 'nonzero'
  }
  return svgPath.toShapes()
}

function addOutline(
  map: Map<string, SampledOutline[]>,
  order: string[],
  color: string,
  outline: SampledOutline,
) {
  const existing = map.get(color)
  if (existing) {
    existing.push(outline)
  } else {
    map.set(color, [outline])
    order.push(color)
  }
}

function sampleOutline(source: Shape, flatness: number): SampledOutline | null {
  const contour = resampleCurves(source.curves, flatness)
  if (!contour || contour.length < 3) return null

  const holes: Vector2[][] = []
  for (const hole of source.holes) {
    const points = resampleCurves(hole.curves, flatness)
    if (points && points.length >= 3) {
      holes.push(points)
    }
  }

  return { contour, holes }
}

/**
 * Tolerancia de aplanado proporcional al tamaño del dibujo (~1/20000 del lado
 * mayor), con suelo absoluto para archivos degenerados. En SVGs de unidades
 * grandes equivale al criterio fijo anterior; en SVGs de unidades pequeñas
 * evita facetas visibles al escalarlos hacia arriba.
 */
function estimateFlatness(paths: readonly ShapePath[]): number {
  let maxCoord = 0
  for (const path of paths) {
    for (const subPath of path.subPaths) {
      for (const curve of subPath.curves) {
        for (const t of [0, 0.5, 1]) {
          const point = curve.getPoint(t)
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
          maxCoord = Math.max(maxCoord, Math.abs(point.x), Math.abs(point.y))
        }
      }
    }
  }
  return Math.max(0.02, maxCoord * 5e-5)
}

function signedArea(points: Vector2[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    area += p.x * q.y - q.x * p.y
  }
  return area / 2
}

function resampleCurves(curves: Curve<Vector2>[], flatness: number): Vector2[] | null {
  if (curves.length === 0) return null

  const points: Vector2[] = []

  const append = (point: Vector2) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    const last = points[points.length - 1]
    if (last && last.distanceToSquared(point) < 1e-10) return
    points.push(point)
  }

  for (const curve of curves) {
    if (curve instanceof LineCurve) {
      append(curve.v1.clone())
      append(curve.v2.clone())
      continue
    }
    append(curve.getPoint(0))
    const samples: Vector2[] = []
    collectAdaptiveSamples(curve, 0, 1, 1, flatness, samples)
    for (const sample of samples) append(sample)
    append(curve.getPoint(1))
  }

  if (points.length < 3) return null

  const first = points[0]
  const last = points[points.length - 1]
  if (first.distanceToSquared(last) < 1e-10 && points.length > 3) {
    points.pop()
  }

  return simplifyCollinear(points)
}

function simplifyCollinear(points: Vector2[]): Vector2[] {
  if (points.length < 3) return points

  const result: Vector2[] = []
  const count = points.length

  for (let i = 0; i < count; i++) {
    const prev = result.length > 0 ? result[result.length - 1] : points[count - 1]
    const curr = points[i]
    const next = points[(i + 1) % count]

    const abx = curr.x - prev.x
    const aby = curr.y - prev.y
    const bcx = next.x - curr.x
    const bcy = next.y - curr.y
    const scale = Math.hypot(abx, aby) * Math.hypot(bcx, bcy)

    if (scale > 0) {
      const cross = Math.abs(abx * bcy - aby * bcx)
      if (cross / scale < COLLINEAR_EPSILON) continue
    }

    result.push(curr)
  }

  return result.length >= 3 ? result : points
}

function collectAdaptiveSamples(
  curve: Curve<Vector2>,
  t0: number,
  t1: number,
  depth: number,
  flatness: number,
  out: Vector2[],
) {
  if (depth > MAX_SUBDIVISION_DEPTH) return

  const start = curve.getPoint(t0)
  const end = curve.getPoint(t1)
  const mid = curve.getPoint((t0 + t1) / 2)

  if (distanceToSegment(mid, start, end) <= flatness) return

  collectAdaptiveSamples(curve, t0, (t0 + t1) / 2, depth + 1, flatness, out)
  out.push(mid)
  collectAdaptiveSamples(curve, (t0 + t1) / 2, t1, depth + 1, flatness, out)
}

function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq < 1e-12) return point.distanceTo(a)

  const proj = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq
  const clamped = Math.min(Math.max(proj, 0), 1)
  const cx = a.x + abx * clamped
  const cy = a.y + aby * clamped
  return Math.hypot(point.x - cx, point.y - cy)
}

function centerAndFlip(outlines: SampledOutline[]) {
  const bounds = measureOutlines(outlines)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2

  const apply = (points: Vector2[]) => {
    for (const point of points) {
      point.set(point.x - cx, -(point.y - cy))
    }
  }

  for (const outline of outlines) {
    apply(outline.contour)
    for (const hole of outline.holes) {
      apply(hole)
    }
  }
}
void centerAndFlip

function toShape(outline: SampledOutline): Shape {
  const contour = outline.contour.slice()
  if (signedArea(contour) < 0) contour.reverse()

  const shape = new Shape(contour.map(clonePoint))
  for (const hole of outline.holes) {
    const holePoints = hole.slice()
    if (signedArea(holePoints) > 0) holePoints.reverse()
    shape.holes.push(new Path(holePoints.map(clonePoint)))
  }
  return shape
}

function clonePoint(point: Vector2) {
  return point.clone()
}

function measureOutlines(outlines: SampledOutline[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const visit = (points: Vector2[]) => {
    for (const point of points) {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    }
  }

  for (const outline of outlines) {
    visit(outline.contour)
    for (const hole of outline.holes) {
      visit(hole)
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }

  return { minX, maxX, minY, maxY }
}
