import type { BaseObject } from '../../models/BaseObject'
import type { Polygon } from '../clipping/polyBoolean'
import { createFootprintPolysForBase, createFootprintShape } from './baseGeometry'
import { computeSilhouette, unionPolygons } from '../clipping/polyBoolean'

export interface BorderRing {
  outer: [number, number][]
  inner: [number, number][]
}

export function computeBorderRing(base: BaseObject): BorderRing | null {
  if (!base.border.enabled || base.border.width <= 0) return null

  if (base.kind === 'svg' && base.svgBaseId) {
    return computeSvgBorderRing(base)
  }
  return computeRectBorderRing(base)
}

function computeRectBorderRing(base: BaseObject): BorderRing | null {
  const outerShape = createFootprintShape(base)
  const outerPts = outerShape.getPoints(48)
  const outer: [number, number][] = outerPts.map((p) => [p.x, p.y])
  const first = outer[0]
  outer.push([first[0], first[1]])

  const innerRadius = Math.max(0, base.cornerRadius - base.border.width)
  const innerW = base.width - 2 * base.border.width
  const innerH = base.height - 2 * base.border.width

  if (innerW <= 0 || innerH <= 0) return null

  const inner: [number, number][] = computeRoundedRectPoints(innerW, innerH, innerRadius)
  return { outer, inner }
}

function computeRoundedRectPoints(width: number, height: number, radius: number): [number, number][] {
  const hw = width / 2
  const hh = height / 2
  const pts: [number, number][] = []

  if (radius <= 0) {
    pts.push([-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh])
    return pts
  }

  const segs = 12
  pts.push([-hw + radius, -hh])
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / segs)
    pts.push([hw - radius + radius * Math.cos(a), -hh + radius + radius * Math.sin(a)])
  }
  pts.push([hw, hh - radius])
  for (let i = 0; i <= segs; i++) {
    const a = (Math.PI / 2) * (i / segs)
    pts.push([hw - radius + radius * Math.cos(a), hh - radius + radius * Math.sin(a)])
  }
  pts.push([-hw + radius, hh])
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / segs)
    pts.push([-hw + radius + radius * Math.cos(a), hh - radius + radius * Math.sin(a)])
  }
  pts.push([-hw, -hh + radius])
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / segs)
    pts.push([-hw + radius + radius * Math.cos(a), -hh + radius + radius * Math.sin(a)])
  }
  pts.push([-hw + radius, -hh])
  return pts
}

function computeSvgBorderRing(base: BaseObject): BorderRing | null {
  const polys = createFootprintPolysForBase(base)
  if (polys.length === 0) return null

  const asNumbers: [number, number][][][] = polys.map((poly) =>
    poly.map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
  )

  let outerRing: [number, number][]
  if (base.silhouette && asNumbers.length > 0) {
    const silhouette = computeSilhouette(asNumbers)
    if (!silhouette) return null
    outerRing = silhouette[0]
  } else {
    const merged = unionPolygons(asNumbers)
    if (merged.length === 0) return null
    outerRing = merged[0][0]
  }

  const inner = offsetPolygon(outerRing, -base.border.width)
  if (!inner || inner.length < 3) return null

  const outer: [number, number][] = [...outerRing]
  return { outer, inner }
}

function offsetPolygon(ring: [number, number][], offset: number): [number, number][] | null {
  const n = ring.length
  if (n < 4) return null

  const body = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
    ? ring.slice(0, -1)
    : ring

  if (body.length < 3) return null

  const edges: { nx: number; ny: number; dx: number; dy: number }[] = []
  for (let i = 0; i < body.length; i++) {
    const a = body[i]
    const b = body[(i + 1) % body.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-10) continue
    edges.push({ nx: -dy / len, ny: dx / len, dx: dx / len, dy: dy / len })
  }

  if (edges.length < 3) return null

  const offsetEdges = edges.map((e) => ({
    px: e.nx * offset,
    py: e.ny * offset,
    dx: e.dx,
    dy: e.dy,
  }))

  const result: [number, number][] = []
  const m = offsetEdges.length
  for (let i = 0; i < m; i++) {
    const a = offsetEdges[i]
    const b = offsetEdges[(i + 1) % m]
    const inter = intersectLines(
      a.px, a.py, a.dx, a.dy,
      b.px, b.py, b.dx, b.dy,
    )
    if (inter) {
      result.push(inter)
    }
  }

  if (result.length < 3) return null

  const first = result[0]
  result.push([first[0], first[1]])
  return result
}

function intersectLines(
  ax: number, ay: number, adx: number, ady: number,
  bx: number, by: number, bdx: number, bdy: number,
): [number, number] | null {
  const det = adx * bdy - ady * bdx
  if (Math.abs(det) < 1e-10) return null
  const t = ((bx - ax) * bdy - (by - ay) * bdx) / det
  return [ax + t * adx, ay + t * ady]
}

export function borderRingToPolygon(ring: BorderRing): Polygon {
  return [ring.outer, ring.inner]
}
