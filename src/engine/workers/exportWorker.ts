/**
 * Worker de exportación 3MF/ STL
 * Corre el pipeline pesado fuera del hilo principal para que la UI no se congele
 * ("Página no responde") incluso con 2 SVGs complejos. Recibe base, diseños y
 * regiones ya parseadas como datos planos, y devuelve el 3MF como Uint8Array
 * o progreso.
 */
import { createFootprintShape } from '../geometry/baseGeometry'
import { holeCenterY } from '../../models/BaseObject'
import { designWorldMatrix } from '../geometry/designGeometry'
import {
  clipMultiPolygonToPolygon,
  computeSilhouette,
  decimateShortSegments,
  extrudeMultiPolygon,
  scaleMultiAboutCentroid,
  subtractMulti,
  unionPolygons,
  unionPolygonsAsync,
} from '../clipping/polyBoolean'
import { mergePartsByColor } from '../export/solids'
import { validateSolidsAsync } from '../export/validate'
import { build3mfArchiveAsync } from '../export/threeMF'
import type { BaseObject } from '../../models/BaseObject'
import type { SvgDesign } from '../../models/SvgDesign'
import type { Polygon } from '../clipping/polyBoolean'
import type { SolidPart } from '../export/validate'
import { Vector2, Vector3, Matrix4 } from 'three'
import { computeBorderRing, borderRingToPolygon } from '../geometry/borderGeometry'

type ParsedForWorker = {
  id: string
  width: number
  height: number
  regions: { originalColor: string; polys: [number, number][][][] }[] // ya serializado
  warnings: string[]
}

type WorkerRequest = {
  base: BaseObject
  designs: SvgDesign[]
  parsedList: ParsedForWorker[]
  baseParsed: ParsedForWorker | null
  kind: '3mf' | 'stl'
}

type WorkerProgress = { type: 'progress'; stage: string }
type WorkerDone = { type: 'done'; buffer: Uint8Array; warnings: string[]; solidsCount: number }
type WorkerError = { type: 'error'; message: string }

function nextTick() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

const DESIGN_LIFT_MM = 0.02
const DESIGN_EMBED_MM = 0.02
const POCKET_CLEARANCE_RATIO = 1.002
const COLOR_STAGGER_STEP_MM = 0.004

function colorStaggerMM(colorHex: string): number {
  let hash = 0
  for (let i = 0; i < colorHex.length; i++) hash = (hash * 31 + colorHex.charCodeAt(i)) >>> 0
  return (hash % 5) * COLOR_STAGGER_STEP_MM
}

function footprintPolygon(base: BaseObject, baseParsed: ParsedForWorker | null): Polygon {
  if (base.kind === 'svg' && baseParsed) {
    const scale = Math.min(base.width / baseParsed.width, base.height / baseParsed.height)
    const allPolys: [number, number][][][] = []
    for (const region of baseParsed.regions) {
      for (const poly of region.polys) {
        allPolys.push(poly.map((ring) => ring.map(([x, y]) => [x * scale, y * scale] as [number, number])))
      }
    }
    if (allPolys.length > 0) {
      let outer: [number, number][] | null = null
      const holes: [number, number][][] = []
      
      if (base.silhouette) {
        // Modo silueta: unir todos y tomar solo contorno exterior (sin holes)
        const silhouette = computeSilhouette(allPolys)
        if (silhouette) {
          outer = silhouette[0]
        }
      } else {
        // Modo normal: tomar el polígono más grande como outer, resto como holes
        let maxArea = -1
        for (const poly of allPolys) {
          const outerRing = poly[0]
          let area = 0
          for (let i = 0; i < outerRing.length - 1; i++) area += outerRing[i][0] * outerRing[i + 1][1] - outerRing[i + 1][0] * outerRing[i][1]
          area = Math.abs(area) / 2
          if (area > maxArea) {
            if (outer) holes.push(outer)
            outer = outerRing
            maxArea = area
            for (let i = 1; i < poly.length; i++) holes.push(poly[i])
          } else {
            holes.push(outerRing)
            for (let i = 1; i < poly.length; i++) holes.push(poly[i])
          }
        }
      }
      
      if (outer) {
        const first = outer[0]
        outer.push([first[0], first[1]])
        const paramHoles = footprintHoleRings(base).map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
        return [outer, ...holes, ...paramHoles]
      }
    }
  }
  const outer: [number, number][] = createFootprintShape(base)
    .getPoints(48)
    .map((p) => [p.x, p.y])
  const first = outer[0]
  outer.push([first[0], first[1]])
  const holes = footprintHoleRings(base).map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
  return [outer, ...holes]
}

function footprintHoleRings(base: BaseObject): Vector2[][] {
  if (!base.hole.enabled || base.hole.diameter <= 0) return []
  const rings: Vector2[][] = []
  const radius = base.hole.diameter / 2
  const cy = holeCenterY(base)
  const segments = 64
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    rings.push([new Vector2(base.hole.x + radius * Math.cos(angle), cy + radius * Math.sin(angle))])
  }
  return [rings.flat()]
}

function regionWorldPolysFromPlain(
  polys: [number, number][][][],
  world: Matrix4,
): [number, number][][][] {
  return polys.map((poly) =>
    poly.map((ring) =>
      ring.map(([x, y]) => {
        const w = new Vector3(x, y, 0).applyMatrix4(world)
        return [w.x, w.y] as [number, number]
      }),
    ),
  )
}

function assignedColorOf(design: SvgDesign, originalColor: string): string {
  return design.colors.find((m) => m.originalColor === originalColor)?.assignedColor ?? originalColor
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { base, designs, parsedList, baseParsed, kind } = e.data
  const post = (msg: WorkerProgress | WorkerDone | WorkerError) => (self as any).postMessage(msg)

  try {
    const getParsed = (id: string) => parsedList.find((p) => p.id === id)
    const warnings: string[] = []
    const parts: SolidPart[] = []
    const footprint = footprintPolygon(base, baseParsed)
    const polygonsByColor = new Map<string, { depth: number; protrusion: number; polygons: Polygon[]; designName: string }>()

    // Fase 1: preparar polígonos por color (world)
    for (const design of designs) {
      if (!design.visible) continue
      const parsed = getParsed(design.id)
      if (!parsed || parsed.regions.length === 0) continue
      const world = designWorldMatrix(design, base.thickness)
      let shapeIndex = 0
      const totalShapes = parsed.regions.reduce((n, r) => n + r.polys.length, 0)
      for (const region of parsed.regions) {
        const assigned = assignedColorOf(design, region.originalColor)
        const worldPolys = regionWorldPolysFromPlain(region.polys, world)
        for (const poly of worldPolys) {
          shapeIndex++
          if (shapeIndex % 40 === 0) {
            post({ type: 'progress', stage: `Preparando «${design.name}»: contorno ${shapeIndex}/${totalShapes}…` })
            await nextTick()
          }
          const key = `${design.id}|${assigned}`
          let bucket = polygonsByColor.get(key)
          if (!bucket) bucket = { depth: design.depth, protrusion: design.protrusion, polygons: [], designName: design.name }
          bucket.polygons.push(poly as any)
          // keep map updated
          polygonsByColor.set(key, bucket)
        }
      }
    }

    // Agregar borde si esta habilitado y tiene volumen (depth > 0 o protrusion > 0)
    if (base.border.enabled && (base.border.depth > 0.01 || base.border.protrusion > 0.01)) {
      const borderRing = computeBorderRing(base)
      if (borderRing) {
        const borderPoly = borderRingToPolygon(borderRing)
        const borderKey = `__border__|${base.border.color}`
        polygonsByColor.set(borderKey, {
          depth: base.border.depth,
          protrusion: base.border.protrusion,
          polygons: [borderPoly],
          designName: 'Borde',
        })
      }
    }

    post({ type: 'progress', stage: 'Uniendo formas por color…' })
    await nextTick()

    // Nombres genéricos
    const designIdToIndex = new Map<string, number>()
    let nextIdx = 1
    for (const d of designs) {
      if (!d.visible) continue
      const parsed = getParsed(d.id)
      if (!parsed || parsed.regions.length === 0) continue
      if (!designIdToIndex.has(d.id)) designIdToIndex.set(d.id, nextIdx++)
    }
    const designBucketCounts = new Map<string, number>()
    for (const key of polygonsByColor.keys()) {
      const did = key.split('|')[0] ?? ''
      designBucketCounts.set(did, (designBucketCounts.get(did) ?? 0) + 1)
    }
    const designBucketSeq = new Map<string, number>()
    const clippedForPocket = new Map<string, { depth: number; protrusion: number; polygons: Polygon[] }>()
    let bucketIdx = 0
    const totalBuckets = polygonsByColor.size
    const lift = DESIGN_LIFT_MM

    for (const [key, bucket] of polygonsByColor) {
      bucketIdx++
      const rawAssigned = key.split('|')[1] ?? ''
      const assigned = rawAssigned.startsWith('#') ? rawAssigned : `#${rawAssigned}`
      post({ type: 'progress', stage: `Uniendo «${bucket.designName}» (${assigned}) [${bucketIdx}/${totalBuckets}]…` })
      await nextTick()
      const merged = bucket.polygons.length > 100 ? await unionPolygonsAsync(bucket.polygons, 20) : unionPolygons(bucket.polygons)
      await nextTick()
      if (merged.length === 0) continue
      const designId = key.split('|')[0] ?? ''
      // El borde no se recorta contra el footprint porque ya está calculado para estar dentro
      const finalClipped = designId === '__border__' ? merged : clipMultiPolygonToPolygon(merged, footprint)
      await nextTick()
      if (finalClipped.length === 0) continue
      clippedForPocket.set(key, { depth: bucket.depth, protrusion: bucket.protrusion, polygons: finalClipped })
      const zOffset = Math.max(0, base.thickness - bucket.depth - DESIGN_EMBED_MM)
      const geom = extrudeMultiPolygon(finalClipped, bucket.depth + bucket.protrusion + DESIGN_EMBED_MM + lift + colorStaggerMM(assigned), zOffset)
      if (!geom) continue
      let partName: string
      if (designId === '__border__') {
        partName = 'Borde'
      } else {
        const designIdx = designIdToIndex.get(designId) ?? 1
        const totalForDesign = designBucketCounts.get(designId) ?? 1
        if (totalForDesign === 1) partName = `Diseño_${designIdx}`
        else {
          const seq = (designBucketSeq.get(designId) ?? 0) + 1
          designBucketSeq.set(designId, seq)
          partName = `Diseño_${designIdx}_${seq}`
        }
      }
      parts.push({ name: partName, colorHex: assigned, geometry: geom as any })
    }

    post({ type: 'progress', stage: 'Excavando bolsillos por capas…' })
    await nextTick()

    let outerRing: Vector2[]
    if (base.kind === 'svg' && baseParsed) {
      const scale = Math.min(base.width / baseParsed.width, base.height / baseParsed.height)
      const allPolys: [number, number][][][] = []
      for (const region of baseParsed.regions) {
        for (const poly of region.polys) {
          allPolys.push(poly.map((ring) => ring.map(([x, y]) => [x * scale, y * scale] as [number, number])))
        }
      }
      if (base.silhouette) {
        const silhouette = computeSilhouette(allPolys)
        outerRing = silhouette ? silhouette[0].map(([x, y]) => new Vector2(x, y)) : createFootprintShape(base).getPoints(48)
      } else {
        outerRing = allPolys[0]?.[0].map(([x, y]) => new Vector2(x, y)) ?? createFootprintShape(base).getPoints(48)
      }
    } else {
      outerRing = createFootprintShape(base).getPoints(48)
    }
    const holes = footprintHoleRings(base)
    const thickness = base.thickness
    // Filtrar buckets con depth > 0.01 para evitar geometrías degeneradas
    // cuando depth=0 (diseño superficial sin hundimiento).
    const pocketBuckets = clippedForPocket.size > 0 ? [...clippedForPocket.values()].filter((b) => b.depth > 0.01) : [...polygonsByColor.values()].filter((b) => b.depth > 0.01).map((b) => ({ depth: b.depth, protrusion: b.protrusion, polygons: b.polygons }))
    const depths = [...new Set(pocketBuckets.map((b) => Math.min(b.depth, thickness)))].sort((a, b) => a - b)

    if (depths.length === 0) {
      const g = extrudeMultiPolygon(subtractMulti(outerRing, holes, []), thickness, 0)
      if (g) parts.unshift({ name: 'Base', colorHex: base.color, geometry: g as any })
    } else {
      const layers: SolidPart[] = []
      for (let j = 0; j < depths.length; j++) {
        post({ type: 'progress', stage: `Excavando bolsillos por capas… capa ${j + 1}/${depths.length}…` })
        await nextTick()
        const depth = depths[j]
        const bandBottom = thickness - depth
        const bandTop = j === 0 ? thickness : thickness - depths[j - 1]
        const relevant = pocketBuckets.filter((b) => Math.min(b.depth, thickness) >= depth).flatMap((b) => b.polygons)
        const cuttersRaw = relevant.length > 10 ? await unionPolygonsAsync(relevant as any, 20) : unionPolygons(relevant as any)
        await nextTick()
        const cutters = scaleMultiAboutCentroid(decimateShortSegments(cuttersRaw as any), POCKET_CLEARANCE_RATIO)
        await nextTick()
        const geom = extrudeMultiPolygon(subtractMulti(outerRing, holes, cutters as any), bandTop - bandBottom, bandBottom)
        await nextTick()
        if (geom) layers.push({ name: j === 0 ? 'Base' : `Base_capa${j + 1}`, colorHex: base.color, geometry: geom as any })
      }
      const deepest = depths[depths.length - 1]
      if (deepest < thickness) {
        const slab = extrudeMultiPolygon(subtractMulti(outerRing, holes, []), thickness - deepest, 0)
        if (slab) layers.push({ name: 'Base_fondo', colorHex: base.color, geometry: slab as any })
      }
      parts.unshift(...layers)
    }

    // Merge y validación también en worker para no bloquear UI
    post({ type: 'progress', stage: 'Agrupando por color…' })
    await nextTick()
    const solids = mergePartsByColor(parts as any)
    post({ type: 'progress', stage: 'Validando mallas…' })
    const report = await validateSolidsAsync(solids as any, () => {})
    if (report.errors.length > 0) {
      post({ type: 'error', message: report.errors.join(' ') })
      return
    }

    if (kind === 'stl') {
      // Para STL no generamos zip aquí; devolvemos error no implementado en worker
      post({ type: 'error', message: 'STL vía worker no implementado' })
      return
    }

    post({ type: 'progress', stage: 'Generando 3MF…' })
    const buffer = await build3mfArchiveAsync(solids as any, (stage) => post({ type: 'progress', stage } as any))
    // Transferir buffer
    post({ type: 'done', buffer: buffer as any, warnings, solidsCount: solids.length } as any)
    // Los geometries se pueden liberar en worker
    for (const p of [...parts, ...solids]) (p.geometry as any)?.dispose?.()
  } catch (err: any) {
    post({ type: 'error', message: err?.message ?? String(err) })
  }
}
