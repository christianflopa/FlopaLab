import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three'
import { difference, intersection, union } from 'polygon-clipping'
import PolyBool from 'polybooljs'

type Ring = [number, number][]
export type Polygon = Ring[]
type MultiPolygon = Polygon[]

export interface ClipRect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type PBGeo = { regions: number[][][]; inverted: boolean }

const DEDUP_EPS_SQ = 1e-8
const MIN_RING_AREA = 0.002
const COLINEAR_EPS_SQ = 1e-12

function ringArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum / 2
}

function removeColinearPoints(ring: Ring): Ring {
  if (ring.length <= 3) return ring
  const out: Ring = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]
    const curr = ring[i]
    const next = ring[(i + 1) % n]
    const ax = curr[0] - prev[0]
    const ay = curr[1] - prev[1]
    const bx = next[0] - curr[0]
    const by = next[1] - curr[1]
    const cross = ax * by - ay * bx
    if (cross * cross > COLINEAR_EPS_SQ * (ax * ax + ay * ay) * (bx * bx + by * by)) {
      out.push(curr)
    }
  }
  return out.length >= 3 ? out : ring
}

function cleanRing(ring: Ring): Ring | null {
  const out: Ring = []
  for (const point of ring) {
    const last = out[out.length - 1]
    if (last && (point[0] - last[0]) ** 2 + (point[1] - last[1]) ** 2 < DEDUP_EPS_SQ) {
      continue
    }
    out.push(point)
  }
  while (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if ((first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2 < DEDUP_EPS_SQ) {
      out.pop()
    } else {
      break
    }
  }
  const noColinear = removeColinearPoints(out)
  if (noColinear.length < 3 || Math.abs(ringArea(noColinear)) < MIN_RING_AREA) return null
  const first = noColinear[0]
  noColinear.push([first[0], first[1]])
  return noColinear
}

function cleanMulti(multi: MultiPolygon): MultiPolygon {
  const result: MultiPolygon = []
  for (const polygon of multi) {
    const outer = cleanRing(polygon[0])
    if (!outer) continue
    const cleaned: Polygon = [outer]
    for (let i = 1; i < polygon.length; i++) {
      const hole = cleanRing(polygon[i])
      if (!hole) continue
      if (holeTouchesOuter(hole, outer)) continue
      cleaned.push(hole)
    }
    result.push(removeTouchingHoles(cleaned))
  }
  return result
}

function holeTouchesOuter(hole: Ring, outer: Ring): boolean {
  const outerBody = outer.slice(0, -1)
  const holeBody = hole.slice(0, -1)
  for (const hp of holeBody) {
    for (let i = 0; i < outerBody.length; i++) {
      const a = outerBody[i]
      const b = outerBody[(i + 1) % outerBody.length]
      if (pointOnSegment(hp, a, b)) return true
    }
  }
  return false
}

function pointOnSegment(p: [number, number], a: [number, number], b: [number, number]): boolean {
  const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])
  if (Math.abs(cross) > 1e-10) return false
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])
  if (dot < 0) return false
  const lenSq = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  return dot <= lenSq
}

function removeTouchingHoles(polygon: Polygon): Polygon {
  const outer = polygon[0]
  const holes = polygon.slice(1)
  const kept: Ring[] = []
  for (const hole of holes) {
    let touches = false
    for (const other of kept) {
      if (ringsTouch(hole, other)) {
        touches = true
        break
      }
    }
    if (!touches) kept.push(hole)
  }
  return [outer, ...kept]
}

function ringsTouch(a: Ring, b: Ring): boolean {
  const aBody = a.slice(0, -1)
  const bBody = b.slice(0, -1)
  for (const pa of aBody) {
    for (let i = 0; i < bBody.length; i++) {
      const pb1 = bBody[i]
      const pb2 = bBody[(i + 1) % bBody.length]
      if (pointOnSegment(pa, pb1, pb2)) return true
    }
  }
  for (const pb of bBody) {
    for (let i = 0; i < aBody.length; i++) {
      const pa1 = aBody[i]
      const pa2 = aBody[(i + 1) % aBody.length]
      if (pointOnSegment(pb, pa1, pa2)) return true
    }
  }
  return false
}

function absArea(multi: MultiPolygon): number {
  let sum = 0
  for (const polygon of multi) {
    for (const ring of polygon) {
      sum += Math.abs(ringArea(ring))
    }
  }
  return sum
}

// ---------- motor primario: polygon-clipping (rápido) ----------

type PCGeom = Parameters<typeof union>[0]

function tryPC<T>(run: () => T): T | null {
  try {
    const value = run()
    if (Array.isArray(value) && value.length > 0) return value
    return null
  } catch {
    return null
  }
}

function bboxesOverlap(a: MultiPolygon, b: MultiPolygon): boolean {
  const bounds = (multi: MultiPolygon) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const polygon of multi) {
      for (const [x, y] of polygon[0]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    return { minX, minY, maxX, maxY }
  }
  const ba = bounds(a)
  const bb = bounds(b)
  return (
    ba.minX <= bb.maxX &&
    ba.maxX >= bb.minX &&
    ba.minY <= bb.maxY &&
    ba.maxY >= bb.minY
  )
}

// ---------- motor de respaldo: polybooljs (robusto, más lento) ----------

function toOpenRing(ring: Ring): number[][] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1)
  }
  return ring
}

function toPB(multi: MultiPolygon): PBGeo {
  return { regions: multi.flatMap((polygon) => polygon.map(toOpenRing)), inverted: false }
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function fromPB(geo: { regions: number[][][] }): MultiPolygon {
  const items = geo.regions
    .filter((openRing) => openRing.length >= 3)
    .map((openRing) => {
      const ring = [...openRing, openRing[0]] as Ring
      return { ring, area: Math.abs(ringArea(ring)), depth: 0, parent: -1 }
    })
    .sort((a, b) => b.area - a.area)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const px = (item.ring[0][0] + item.ring[1][0]) / 2
    const py = (item.ring[0][1] + item.ring[1][1]) / 2

    let best = -1
    let bestArea = Infinity
    for (let j = 0; j < items.length; j++) {
      if (i === j || items[j].area <= item.area) continue
      if (!pointInRing(px, py, items[j].ring)) continue
      if (items[j].area < bestArea) {
        bestArea = items[j].area
        best = j
      }
    }

    item.parent = best
    item.depth = best === -1 ? 0 : items[best].depth + 1
  }

  const polygonByIndex = new Map<number, Polygon>()
  const result: MultiPolygon = []

  for (let i = 0; i < items.length; i++) {
    if (items[i].depth % 2 === 0) {
      const polygon: Polygon = [items[i].ring]
      polygonByIndex.set(i, polygon)
      result.push(polygon)
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.depth % 2 === 1 && item.parent !== -1) {
      polygonByIndex.get(item.parent)?.push(item.ring)
    }
  }

  return result
}

function segmentsOf(multi: MultiPolygon) {
  return PolyBool.segments(toPB(cleanMulti(multi)))
}

function pbCombine(
  a: ReturnType<typeof segmentsOf>,
  b: ReturnType<typeof segmentsOf>,
  select: (combined: { combined: unknown[]; isInverted: boolean }) => ReturnType<typeof segmentsOf>,
): MultiPolygon {
  return fromPB(PolyBool.polygon(select(PolyBool.combine(a, b))))
}

function pbUnion(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return []
  let acc = segmentsOf([polygons[0]])
  for (let i = 1; i < polygons.length; i++) {
    acc = PolyBool.selectUnion(PolyBool.combine(acc, segmentsOf([polygons[i]])))
  }
  return fromPB(PolyBool.polygon(acc))
}

async function pbUnionAsync(polygons: Polygon[], yieldEvery = 10): Promise<MultiPolygon> {
  if (polygons.length === 0) return []
  let acc = segmentsOf([polygons[0]])
  for (let i = 1; i < polygons.length; i++) {
    acc = PolyBool.selectUnion(PolyBool.combine(acc, segmentsOf([polygons[i]])))
    if (i % yieldEvery === 0) await new Promise<void>((r) => setTimeout(r, 0))
  }
  return fromPB(PolyBool.polygon(acc))
}

// ---------- API pública ----------

const MERGE_INFLATE_MM = 0.005

/**
 * Une polígonos disolviendo bordes compartidos. Los motores booleanos no
 * fusionan polígonos que solo se TOCAN, así que primero se infla cada uno
 * una fracción de micrómetro sobre su propio centroide para que se solapen
 * de verdad y la unión produzca un contorno único sin paredes internas.
 */
export function unionPolygons(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return []
  if (polygons.length === 1) {
    const single = cleanMulti([polygons[0]])
    return single.length > 0 ? pbUnion(single) : []
  }

  // Fast path para 2+ SVGs disjuntos: si ningún bbox se solapa, la unión
  // es simplemente la colección limpia (sin caras internas que disolver).
  // Evita el cuelgue de `polybool`/`polygon-clipping` con cientos de
  // polígonos disjuntos (181×2 → ~2.8s → 31ms en el test heavy).
  if (areAllDisjoint(polygons)) {
    return cleanMulti(polygons)
  }

  const inflated = polygons.map((polygon) => inflateAboutOwnCentroid(polygon))
  const limit = absArea(inflated)

  const fast = tryPC(() => union(inflated as unknown as PCGeom) as unknown as MultiPolygon)
  if (fast && absArea(fast) <= limit * 1.02 + 0.25) return cleanMulti(fast)

  return cleanMulti(pbUnion(inflated))
}

/**
 * Calcula la silueta de un conjunto de polígonos: une todos y devuelve
 * solo los contornos exteriores (sin huecos internos).
 * Si hay múltiples polígonos disjuntos, devuelve el de mayor área.
 */
export function computeSilhouette(polygons: Polygon[]): Polygon | null {
  if (polygons.length === 0) return null
  
  // Unir todos los polígonos
  const merged = unionPolygons(polygons)
  if (merged.length === 0) return null
  
  // Si solo hay un polígono, devolver solo su contorno exterior (sin holes)
  if (merged.length === 1) {
    return [merged[0][0]]
  }
  
  // Si hay múltiples polígonos disjuntos, tomar el de mayor área
  let largest: Polygon | null = null
  let largestArea = -1
  for (const poly of merged) {
    const area = Math.abs(ringArea(poly[0]))
    if (area > largestArea) {
      largestArea = area
      largest = [poly[0]]
    }
  }
  
  return largest
}

export async function unionPolygonsAsync(
  polygons: Polygon[],
  yieldEvery = 10,
): Promise<MultiPolygon> {
  if (polygons.length === 0) return []
  if (polygons.length === 1) {
    const single = cleanMulti([polygons[0]])
    return single.length > 0 ? await pbUnionAsync(single, yieldEvery) : []
  }
  if (areAllDisjoint(polygons)) {
    // yield una vez para no bloquear UI aunque sea fast-path con muchos polys
    await new Promise<void>((r) => setTimeout(r, 0))
    return cleanMulti(polygons)
  }
  const inflated = polygons.map((polygon) => inflateAboutOwnCentroid(polygon))
  const limit = absArea(inflated)
  // polygon-clipping es sincrónico y puede bloquear; lo envolvemos con yield
  await new Promise<void>((r) => setTimeout(r, 0))
  const fast = tryPC(() => union(inflated as unknown as PCGeom) as unknown as MultiPolygon)
  if (fast && absArea(fast) <= limit * 1.02 + 0.25) {
    await new Promise<void>((r) => setTimeout(r, 0))
    return cleanMulti(fast)
  }
  return cleanMulti(await pbUnionAsync(inflated, yieldEvery))
}

function areAllDisjoint(polygons: Polygon[]): boolean {
  // O(n²) pero n es nº de polígonos (no de puntos) y el caso pesado es
  // 100-200 polígonos disjuntos de 4 puntos → ~20k checks, trivial.
  // Para cada par, si los bboxes se solapan → no disjuntos.
  const bboxes = polygons.map((poly) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { minX, minY, maxX, maxY }
  })
  for (let i = 0; i < bboxes.length; i++) {
    const a = bboxes[i]
    for (let j = i + 1; j < bboxes.length; j++) {
      const b = bboxes[j]
      if (a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY) {
        return false
      }
    }
  }
  return true
}

function inflateAboutOwnCentroid(polygon: Polygon): Polygon {
  let sumX = 0
  let sumY = 0
  let count = 0
  let maxDim = 0
  for (const [x, y] of polygon[0]) {
    sumX += x
    sumY += y
    count += 1
    maxDim = Math.max(maxDim, Math.abs(x - sumX / count), Math.abs(y - sumY / count))
  }
  const cx = sumX / count
  const cy = sumY / count
  const ratio = 1 + MERGE_INFLATE_MM / Math.max(maxDim, MERGE_INFLATE_MM)
  return polygon.map((ring) =>
    ring.map(([x, y]) => [cx + (x - cx) * ratio, cy + (y - cy) * ratio] as [number, number]),
  )
}

function rectPolygon(rect: ClipRect): Polygon {
  return [
    [
      [rect.minX, rect.minY],
      [rect.maxX, rect.minY],
      [rect.maxX, rect.maxY],
      [rect.minX, rect.maxY],
      [rect.minX, rect.minY],
    ],
  ]
}

export function intersectRingWithRect(ring: Vector2[], rect: ClipRect): MultiPolygon {
  return intersectRingsWithPolygon([ring], rectPolygon(rect))
}

function intersectPC(subject: MultiPolygon, clip: Polygon): MultiPolygon | null {
  return tryPC(
    () =>
      intersection(
        subject as unknown as PCGeom,
        [clip] as unknown as PCGeom,
      ) as unknown as MultiPolygon,
  )
}

export function intersectRingsWithPolygon(rings: Vector2[][], clip: Polygon): MultiPolygon {
  if (rings.length === 0) return []
  const subject: MultiPolygon = rings.map((ring) => [
    ring.map((point) => [point.x, point.y] as [number, number]),
  ])

  const cleanedSubject = cleanMulti(subject)
  const limit = Math.min(absArea(cleanedSubject), absArea([clip]))

  const fast = intersectPC(cleanedSubject, clip)
  if (fast && absArea(fast) <= limit * 1.02 + 0.25) return cleanMulti(fast)

  if (!bboxesOverlap(subject, [clip])) return []
  return cleanMulti(pbCombine(segmentsOf(subject), segmentsOf([clip]), PolyBool.selectIntersect))
}

export function subtractMulti(
  outer: Vector2[],
  holes: Vector2[][],
  cutters: MultiPolygon,
): MultiPolygon {
  const subject: MultiPolygon = [
    [closeAndClean(outer), ...holes.map((hole) => closeAndClean(hole))],
  ]

  if (cutters.length === 0) return cleanMulti(subject)

  const cleanedSubject = cleanMulti(subject)
  const limit = absArea(cleanedSubject)

  const fast = tryPC(
    () => difference(subject as unknown as PCGeom, cutters as unknown as PCGeom) as unknown as MultiPolygon,
  )
  if (fast && absArea(fast) <= limit * 1.02 + 0.25) return cleanMulti(fast)

  return cleanMulti(pbCombine(segmentsOf(subject), segmentsOf(cutters), PolyBool.selectDifference))
}

export function clipMultiPolygonToPolygon(multi: MultiPolygon, clip: Polygon): MultiPolygon {
  if (multi.length === 0) return []
  const cleaned = cleanMulti(multi)
  if (cleaned.length === 0) return []

  const limit = Math.min(absArea(cleaned), absArea([clip]))

  const fast = intersectPC(cleaned, clip)
  if (fast && absArea(fast) <= limit * 1.02 + 0.25) return cleanMulti(fast)

  if (!bboxesOverlap(cleaned, [clip])) return []
  return cleanMulti(pbCombine(segmentsOf(cleaned), segmentsOf([clip]), PolyBool.selectIntersect))
}

export function scaleMultiAboutCentroid(multi: MultiPolygon, ratio: number): MultiPolygon {
  let sumX = 0
  let sumY = 0
  let count = 0
  for (const polygon of multi) {
    for (const [x, y] of polygon[0]) {
      sumX += x
      sumY += y
      count += 1
    }
  }
  if (count === 0 || ratio === 1) return multi
  const cx = sumX / count
  const cy = sumY / count
  return multi.map((polygon) =>
    polygon.map(
      (ring) => ring.map(([x, y]) => [cx + (x - cx) * ratio, cy + (y - cy) * ratio] as [number, number]),
    ),
  )
}

export function scaleRingsAboutCentroid(rings: Vector2[][], ratio: number): Vector2[][] {
  let sumX = 0
  let sumY = 0
  let count = 0
  for (const ring of rings) {
    for (const point of ring) {
      sumX += point.x
      sumY += point.y
      count += 1
    }
  }
  if (count === 0 || ratio === 1) return rings
  const cx = sumX / count
  const cy = sumY / count
  return rings.map((ring) =>
    ring.map(
      (point) => new Vector2(cx + (point.x - cx) * ratio, cy + (point.y - cy) * ratio),
    ),
  )
}

function closeAndClean(points: Vector2[]): Ring {
  return points.map((point) => [point.x, point.y] as [number, number])
}

export function extrudeMultiPolygon(
  multi: MultiPolygon,
  depth: number,
  zOffset: number,
): ExtrudeGeometry | null {
  const cleaned = cleanMulti(decimateShortSegments(multi))
  const shapes = cleaned
    .filter((polygon) => polygon.length > 0)
    .map((polygon, polygonIdx) => buildShape(polygon, polygonIdx))
  if (shapes.length === 0) return null

  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
  })
  geometry.translate(0, 0, zOffset)
  return geometry
}

/**
 * Elimina segmentos de pared más cortos que MIN_EXPORT_SEGMENT_MM. Los
 * micro-segmentos (sub-μm) colapsan bajo la resolución de validación/exportación
 * y, combinados con el micro-jitter de tapas, pueden producir aristas usadas por
 * más de 2 caras (no manifold). 1 μm es invisible e inimprimible, pero deja
 * margen ×10 sobre la cuantización del exportador y ×50 sobre el jitter.
 */
const MIN_EXPORT_SEGMENT_MM = 1e-3

export function decimateShortSegments(
  multi: MultiPolygon,
  minSeg = MIN_EXPORT_SEGMENT_MM,
): MultiPolygon {
  const minSq = minSeg * minSeg
  return multi.map((polygon) =>
    polygon.map((ring) => {
      if (ring.length <= 4) return ring
      const first = ring[0]
      const last = ring[ring.length - 1]
      const closed = first[0] === last[0] && first[1] === last[1]
      const body = closed ? ring.slice(0, -1) : ring

      const out: Ring = []
      for (const point of body) {
        const prev = out[out.length - 1]
        if (prev && (point[0] - prev[0]) ** 2 + (point[1] - prev[1]) ** 2 < minSq) {
          continue
        }
        out.push(point)
      }
      while (out.length > 3 && (out[out.length - 1][0] - out[0][0]) ** 2 + (out[out.length - 1][1] - out[0][1]) ** 2 < minSq) {
        out.pop()
      }
      if (out.length < 3) return ring
      if (closed) out.push([out[0][0], out[0][1]])
      return out
    }),
  )
}

// earcut (triangulación de tapas de ExtrudeGeometry) genera triángulos-puente
// espurios cuando varios huecos tienen aristas perfectamente colineales y las
// tapas quedan agujereadas. Un micro-jitter determinista (~0.02μm, muy por
// debajo del umbral de soldadura de 0.1μm del exportador) rompe esas
// colinealidades sin efecto visible. Solo se perturban los huecos: el contorno
// exterior se comparte literalmente entre bandas de profundidad y debe quedar
// exacto para que casen entre sí.
const CAP_JITTER_MM = 2e-5

function capJitterRand(seedA: number, seedB: number, seedC: number): number {
  let h =
    (Math.imul(seedA + 1013904223, 374761393) ^
      Math.imul(seedB + 618456001, 668265263) ^
      Math.imul(seedC + 1, 2246822519)) |
    0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 2147483647.5) - 1
}

function jitterHoleForCaps(ring: Ring, polygonIdx: number, holeIdx: number): Ring {
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed =
    ring.length > 1 && first[0] === last[0] && first[1] === last[1]
  const body = closed ? ring.slice(0, -1) : ring
  const out: Ring = body.map(([x, y], i) => [
    x + CAP_JITTER_MM * capJitterRand(polygonIdx, holeIdx, i),
    y + CAP_JITTER_MM * capJitterRand(polygonIdx, holeIdx, -i - 1),
  ])
  if (closed) out.push(out[0])
  return out
}

function buildShape(polygon: Polygon, polygonIdx: number): Shape {
  const shape = new Shape(toPoints(polygon[0]))
  for (let i = 1; i < polygon.length; i++) {
    shape.holes.push(new Path(toPoints(jitterHoleForCaps(polygon[i], polygonIdx, i))))
  }
  return shape
}

function toPoints(ring: Ring): Vector2[] {
  return ring.map(([x, y]) => new Vector2(x, y))
}

