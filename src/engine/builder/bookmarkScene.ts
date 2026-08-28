import {
  Matrix4,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
  type Scene,
  type Shape,
} from 'three'
import type { BaseObject } from '../../models/BaseObject'
import type { SvgDesign } from '../../models/SvgDesign'
import type { ParsedSvg, SvgRegion } from '../../models/ParsedSvg'
import { createBaseGeometry, createFootprintShape, createFootprintPolysForBase } from '../geometry/baseGeometry'
import { holeCenterY } from '../../models/BaseObject'
import { designWorldMatrix } from '../geometry/designGeometry'
import type { Polygon } from '../clipping/polyBoolean'
import {
  clipMultiPolygonToPolygon,
  decimateShortSegments,
  extrudeMultiPolygon,
  scaleMultiAboutCentroid,
  subtractMulti,
  unionPolygons,
  unionPolygonsAsync,
} from '../clipping/polyBoolean'
import { getBaseMaterial, getDesignMaterial } from '../materials/materialRegistry'
import type { SolidPart } from '../export/validate'

export interface UpdateResult {
  emptyDesignIds: string[]
}

export interface ExportProgress {
  step: string
}

export interface ExportResult {
  parts: SolidPart[]
  warnings: string[]
}

function nextTick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

const DESIGN_LIFT_MM = 0.02
const DESIGN_EMBED_MM = 0.08
// Holgura de impresión: SOLO el cortador del bolsillo se agranda este ratio
// para que el diseño entre sin fricción. El arte visible/exportado queda a
// tamaño real, fiel al SVG original.
const POCKET_CLEARANCE_RATIO = 1.002
const COLOR_STAGGER_STEP_MM = 0.004

function colorStaggerMM(colorHex: string): number {
  let hash = 0
  for (let i = 0; i < colorHex.length; i++) {
    hash = (hash * 31 + colorHex.charCodeAt(i)) >>> 0
  }
  return (hash % 5) * COLOR_STAGGER_STEP_MM
}

export class BookmarkScene {
  readonly root = new Group()
  readonly baseGroup = new Group()
  readonly designsGroup = new Group()

  private baseMesh: Mesh | null = null
  private outline: LineSegments | null = null
  private wrappers = new Map<string, Group>()
  private currentBaseGeometry: BufferGeometry | null = null
  private holeHandleGroup: Group | null = null
  private holeHandleMesh: Mesh | null = null

  constructor(scene: Scene) {
    this.root.rotation.x = -Math.PI / 2
    this.root.add(this.baseGroup, this.designsGroup)
    scene.add(this.root)
  }

  async updateAsync(
    base: BaseObject,
    designs: SvgDesign[],
    getParsed: (id: string) => ParsedSvg | undefined,
  ): Promise<UpdateResult> {
    const emptyDesignIds: string[] = []
    for (const design of designs) {
      const wrapper = this.ensureWrapper(design.id)
      wrapper.visible = design.visible

      if (!design.visible) continue

      const parsed = getParsed(design.id)
      if (!parsed || parsed.regions.length === 0) continue

      applyDesignTransformToWrapper(wrapper, base.thickness, design)
      this.clearWrapperChildren(wrapper)

      const footprintLocal = footprintInDesignSpace(base, design)
      let hasVisibleContent = false

      for (const region of parsed.regions) {
        const localPolys = localRegionPolygons(region)
        if (localPolys.length === 0) continue

        // Ceder cada región para no bloquear UI con SVGs de muchas regiones + marco
        if (parsed.regions.length > 5) await nextTick()
        const merged = localPolys.length > 10 ? await unionPolygonsAsync(localPolys as any, 20) : unionPolygons(localPolys as any)
        if (merged.length === 0) continue

        const clipped = clipMultiPolygonToPolygon(merged as any, footprintLocal as any)
        if (clipped.length === 0) continue
        hasVisibleContent = true

        const geometry = extrudeMultiPolygon(clipped as any, design.depth + DESIGN_EMBED_MM, -DESIGN_EMBED_MM)
        if (geometry) {
          const mesh = createRegionMesh(geometry, design, region.originalColor)
          mesh.position.z = colorStaggerMM(region.originalColor)
          wrapper.add(mesh)
        }
        // Ceder cada región pesada
        if (parsed.regions.length > 3) await nextTick()
      }

      if (!hasVisibleContent) {
        emptyDesignIds.push(design.id)
      }
      // Ceder por diseño
      if (designs.length > 1) await nextTick()
    }

    this.removeStaleWrappers(designs)
    this.rebuildBaseMesh(base)

    return { emptyDesignIds }
  }

  update(
    base: BaseObject,
    designs: SvgDesign[],
    getParsed: (id: string) => ParsedSvg | undefined,
  ): UpdateResult {
    // Sincrónico para compatibilidad con tests y llamadas existentes;
    // para UI con SVGs grandes usar updateAsync
    const emptyDesignIds: string[] = []
    for (const design of designs) {
      const wrapper = this.ensureWrapper(design.id)
      wrapper.visible = design.visible

      if (!design.visible) continue

      const parsed = getParsed(design.id)
      if (!parsed || parsed.regions.length === 0) continue

      applyDesignTransformToWrapper(wrapper, base.thickness, design)
      this.clearWrapperChildren(wrapper)

      const footprintLocal = footprintInDesignSpace(base, design)
      let hasVisibleContent = false

      for (const region of parsed.regions) {
        const localPolys = localRegionPolygons(region)
        if (localPolys.length === 0) continue

        const merged = unionPolygons(localPolys as any)
        if (merged.length === 0) continue

        const clipped = clipMultiPolygonToPolygon(merged as any, footprintLocal as any)
        if (clipped.length === 0) continue
        hasVisibleContent = true

        const geometry = extrudeMultiPolygon(clipped as any, design.depth + DESIGN_EMBED_MM, -DESIGN_EMBED_MM)
        if (geometry) {
          const mesh = createRegionMesh(geometry, design, region.originalColor)
          mesh.position.z = colorStaggerMM(region.originalColor)
          wrapper.add(mesh)
        }
      }

      if (!hasVisibleContent) {
        emptyDesignIds.push(design.id)
      }
    }

    this.removeStaleWrappers(designs)
    this.rebuildBaseMesh(base)

    return { emptyDesignIds }
  }

  async buildExportModel(
    base: BaseObject,
    designs: SvgDesign[],
    getParsed: (id: string) => ParsedSvg | undefined,
    onProgress?: (step: string) => void,
  ): Promise<ExportResult> {
    const warnings: string[] = []
    const parts: SolidPart[] = []
    const footprint = footprintPolygon(base)
    const polygonsByColor = new Map<
      string,
      { depth: number; polygons: [number, number][][][]; designName: string }
    >()


    for (const design of designs) {
      if (!design.visible) continue
      const parsed = getParsed(design.id)
      if (!parsed || parsed.regions.length === 0) continue

      const world = designWorldMatrix(design, base.thickness)

      const totalShapes = parsed.regions.reduce((n, region) => n + region.shapes.length, 0)
      let shapeIndex = 0

      for (const region of parsed.regions) {
        const assigned = assignedColorOf(design, region.originalColor)
        const worldPolys = regionWorldPolygons(region, world)

        for (const poly of worldPolys) {
          shapeIndex += 1
          if (shapeIndex % 40 === 0) {
            onProgress?.(`Preparando «${design.name}»: contorno ${shapeIndex}/${totalShapes}…`)
            await nextTick()
          }

          const key = `${design.id}|${assigned}`
          let bucket = polygonsByColor.get(key)
          if (!bucket) {
            bucket = { depth: design.depth, polygons: [], designName: design.name }
            polygonsByColor.set(key, bucket)
          }
          bucket.polygons.push(poly)
        }
      }
    }

    onProgress?.('Uniendo formas por color…')
    await nextTick()

    /**
     * Nomenclatura 3MF (visible en Bambu Studio / slicers):
     * - Pieza base: siempre `Base` (y capas auxiliares `Base_capa2`, `Base_fondo`).
     *   En el 3MF se exportan como objetos separados del mismo material; el
     *   slicer las muestra agrupadas bajo el compuesto `FlopaLab`.
     * - Diseños SVG: nombres genéricos `Diseño_1`, `Diseño_2`, ... según el
     *   orden de carga en la pieza. Si un mismo SVG tiene varios colores
     *   (varios `assignedColor` distintos), se generan `Diseño_N_1`,
     *   `Diseño_N_2`, ... para mantener nombres únicos y estables en el
     *   slicer. Esto evita `FlopaLab`, `FlopaLab_1` genéricos del slicer y
     *   duplicados por `sanitizeName`.
     */
    // Mapa diseño -> índice genérico (1-based) en orden de aparición
    const designIdToIndex = new Map<string, number>()
    let nextDesignIdx = 1
    for (const d of designs) {
      if (!d.visible) continue
      const parsed = getParsed(d.id)
      if (!parsed || parsed.regions.length === 0) continue
      if (!designIdToIndex.has(d.id)) {
        designIdToIndex.set(d.id, nextDesignIdx++)
      }
    }
    // Cuántos buckets (colores) tiene cada diseño
    const designBucketCounts = new Map<string, number>()
    for (const key of polygonsByColor.keys()) {
      const did = key.split('|')[0] ?? ''
      designBucketCounts.set(did, (designBucketCounts.get(did) ?? 0) + 1)
    }
    const designBucketSeq = new Map<string, number>()

    const lift = DESIGN_LIFT_MM
    // Cache de polígonos ya recortados para reutilizar en la excavación de
    // bolsillos: evita re-unir los polígonos crudos (raw) que con 2 SVGs
    // complejos pueden ser 300+ polígonos y causar el cuelgue en
    // "Excavando bolsillos por capas…" (visto con 2× frieren 181 shapes →
    // ~2.8s sólo en el union del pocket). Reusar finalClipped reduce el
    // trabajo a 1 polígono por bucket (ya unionado y clippeado).
    const clippedForPocket = new Map<string, { depth: number; polygons: Polygon[] }>()
    let bucketIdx = 0
    const totalBuckets = polygonsByColor.size
    for (const [key, bucket] of polygonsByColor) {
      bucketIdx++
      const rawAssigned = key.split('|')[1] ?? ''
      // `rawAssigned` ya incluye '#', no prefijar de nuevo (evita '##RRGGBB')
      const assigned = rawAssigned.startsWith('#') ? rawAssigned : `#${rawAssigned}`
      onProgress?.(`Uniendo «${bucket.designName}» (${assigned}) [${bucketIdx}/${totalBuckets}]…`)
      await nextTick()

      // Para buckets con muchos polígonos (>100) usar versión async con yields
      // para no bloquear la UI (evita "página no responde" con 2 SVGs complejos).
      // Umbral alto para que el caso común (1 SVG, ~100 polys) siga sincrónico y rápido.
      const merged =
        bucket.polygons.length > 100
          ? await unionPolygonsAsync(bucket.polygons, 20)
          : unionPolygons(bucket.polygons)
      await nextTick()
      if (merged.length === 0) continue
      const finalClipped = clipMultiPolygonToPolygon(merged, footprint)
      await nextTick()
      if (finalClipped.length === 0) continue
      // Guardar para pocket (bolsillo) – ya está dentro de la huella
      clippedForPocket.set(key, { depth: bucket.depth, polygons: finalClipped })
      const zOffset = Math.max(0, base.thickness - bucket.depth - DESIGN_EMBED_MM)
      const geometry = extrudeMultiPolygon(
        finalClipped,
        bucket.depth + DESIGN_EMBED_MM + lift + colorStaggerMM(assigned),
        zOffset,
      )
      if (!geometry) continue
      const designId = key.split('|')[0] ?? ''
      const designIdx = designIdToIndex.get(designId) ?? 1
      const totalForDesign = designBucketCounts.get(designId) ?? 1
      let partName: string
      if (totalForDesign === 1) {
        partName = `Diseño_${designIdx}`
      } else {
        const seq = (designBucketSeq.get(designId) ?? 0) + 1
        designBucketSeq.set(designId, seq)
        partName = `Diseño_${designIdx}_${seq}`
      }
      parts.push({
        name: partName,
        colorHex: assigned,
        geometry,
      })
    }

    onProgress?.('Excavando bolsillos por capas…')
    await nextTick()

    const { outerRing, holes } = getBaseRingsForPocket(base)
    const thickness = base.thickness
    // Para bolsillos usar los polígonos ya clippeados (mucho más liviano que
    // re-unir los crudos). Si por algún motivo no hay clipped (p.ej. todos los
    // diseños fuera de huella), fallback a los polígonos crudos.
    const pocketBuckets = clippedForPocket.size > 0
      ? [...clippedForPocket.values()]
      : [...polygonsByColor.values()].map((b) => ({ depth: b.depth, polygons: b.polygons }))

    const depths = [
      ...new Set(pocketBuckets.map((bucket) => Math.min(bucket.depth, thickness))),
    ].sort((a, b) => a - b)

    let baseGeometry: BufferGeometry | null

    if (depths.length === 0) {
      baseGeometry = extrudeMultiPolygon(subtractMulti(outerRing, holes, []), thickness, 0)
    } else {
      const layers: SolidPart[] = []

      for (let j = 0; j < depths.length; j++) {
        onProgress?.(`Excavando bolsillos por capas… capa ${j + 1}/${depths.length}…`)
        await nextTick()
        const depth = depths[j]
        const bandBottom = thickness - depth
        const bandTop = j === 0 ? thickness : thickness - depths[j - 1]
        // `pocketBuckets` ya están clippeados y cada bucket es 1 poly (ya
        // unionado), por lo que `relevant` son pocos polígonos (1 por bucket,
        // no cientos de shapes). La unión es barata y se mantiene para que
        // bolsillos que se tocan/solapan no dejen paredes internas.
        // Para casos extremos (muchos buckets / muchos polys por bucket) usar
        // versión async que cede al event loop y evita "página no responde".
        const relevant = pocketBuckets
          .filter((bucket) => Math.min(bucket.depth, thickness) >= depth)
          .flatMap((bucket) => bucket.polygons)
        const cuttersRaw =
          relevant.length > 10
            ? await unionPolygonsAsync(relevant, 20)
            : unionPolygons(relevant)
        await nextTick()
        const cutters = scaleMultiAboutCentroid(
          decimateShortSegments(cuttersRaw),
          POCKET_CLEARANCE_RATIO,
        )
        await nextTick()
        const geometry = extrudeMultiPolygon(
          subtractMulti(outerRing, holes, cutters),
          bandTop - bandBottom,
          bandBottom,
        )
        await nextTick()
        if (geometry) {
          layers.push({
            name: j === 0 ? 'Base' : `Base_capa${j + 1}`,
            colorHex: base.color,
            geometry,
          })
        }
      }

      const deepest = depths[depths.length - 1]
      if (deepest < thickness) {
        const slab = extrudeMultiPolygon(
          subtractMulti(outerRing, holes, []),
          thickness - deepest,
          0,
        )
        if (slab) {
          layers.push({ name: 'Base_fondo', colorHex: base.color, geometry: slab })
        }
      }

      baseGeometry = null
      parts.unshift(...layers)
      if (layers.length === 0) {
        warnings.push('La base quedó vacía tras excavar los bolsillos; se omitió.')
      }
    }

    if (baseGeometry) {
      parts.unshift({ name: 'Base', colorHex: base.color, geometry: baseGeometry })
    }

    return { parts, warnings }
  }

  rematerialize(base: BaseObject, designs: SvgDesign[]) {
    if (this.baseMesh) {
      this.baseMesh.material = getBaseMaterial(base.color)
    }
    for (const design of designs) {
      const wrapper = this.wrappers.get(design.id)
      if (!wrapper) continue
      for (const child of wrapper.children) {
        if (child instanceof Mesh && typeof child.userData.originalColor === 'string') {
          child.material = getDesignMaterial(assignedColorOf(design, child.userData.originalColor))
        }
      }
    }
  }

  syncVisibility(designs: SvgDesign[]) {
    for (const design of designs) {
      const wrapper = this.wrappers.get(design.id)
      if (wrapper) {
        wrapper.visible = design.visible
      }
    }
  }

  getWrapper(id: string): Group | null {
    return this.wrappers.get(id) ?? null
  }

  setPreviewMode(preview: boolean) {
    if (this.outline) {
      this.outline.visible = !preview
    }
  }

  dispose() {
    for (const wrapper of this.wrappers.values()) {
      this.disposeWrapperChildren(wrapper)
    }
    this.wrappers.clear()
    this.currentBaseGeometry?.dispose()
    this.outline?.geometry.dispose()
    ;(this.outline?.material as Material | undefined)?.dispose()
      this.root.clear()
  }

  private ensureWrapper(id: string): Group {
    let wrapper = this.wrappers.get(id)
    if (!wrapper) {
      wrapper = new Group()
      wrapper.name = id
      this.designsGroup.add(wrapper)
      this.wrappers.set(id, wrapper)
    }
    return wrapper
  }

  private removeStaleWrappers(designs: SvgDesign[]) {
    for (const [id, wrapper] of [...this.wrappers]) {
      if (!designs.some((design) => design.id === id)) {
        this.disposeWrapperChildren(wrapper)
        this.designsGroup.remove(wrapper)
        this.wrappers.delete(id)
      }
    }
  }

  private clearWrapperChildren(wrapper: Group) {
    for (const child of [...wrapper.children]) {
      wrapper.remove(child)
    }
  }

  private disposeWrapperChildren(wrapper: Group) {
    for (const child of [...wrapper.children]) {
      wrapper.remove(child)
      if (child instanceof Mesh) {
        child.geometry.dispose()
      }
    }
  }

  updateBaseMesh(base: BaseObject) {
    this.rebuildBaseMesh(base)
  }

  private rebuildBaseMesh(base: BaseObject) {
    const slab = createBaseGeometry(base)
    this.refreshOutline(slab)

    const previous = this.currentBaseGeometry
    this.currentBaseGeometry = slab

    if (this.baseMesh) {
      this.baseMesh.geometry = slab
    } else {
      this.baseMesh = new Mesh(slab, getBaseMaterial(base.color))
      this.baseMesh.name = 'base'
      this.baseGroup.add(this.baseMesh)
    }

    this.updateHoleHandle(base)

    previous?.dispose()
  }

  private refreshOutline(slab: BufferGeometry) {
    const edges = new EdgesGeometry(slab, 20)

    if (this.outline) {
      this.outline.geometry.dispose()
      this.outline.geometry = edges
      return
    }

    this.outline = new LineSegments(
      edges,
      new LineBasicMaterial({ color: 0x7aa2f7, transparent: true, opacity: 0.35 }),
    )
    this.outline.name = 'outline'
    this.baseGroup.add(this.outline)
  }

  updateHoleHandle(base: BaseObject) {
    if (!base.hole.enabled) {
      if (this.holeHandleGroup) this.holeHandleGroup.visible = false
      return
    }
    const cy = holeCenterY(base)
    const radius = base.hole.diameter / 2
    if (!this.holeHandleGroup) {
      const group = new Group()
      group.name = 'holeHandleGroup'
      const torus = new Mesh(
        new TorusGeometry(radius, 0.35, 12, 32),
        new MeshStandardMaterial({ color: 0x7aa2f7, transparent: true, opacity: 0.9, emissive: 0x223355 } as any),
      )
      torus.rotation.x = Math.PI / 2
      torus.name = 'holeHandle'
      const hit = new Mesh(
        new CylinderGeometry(radius + 3, radius + 3, 1, 32),
        new MeshBasicMaterial({ visible: false } as any),
      )
      hit.rotation.x = Math.PI / 2
      hit.name = 'holeHitArea'
      group.add(torus)
      group.add(hit)
      this.holeHandleGroup = group
      this.holeHandleMesh = torus as any
      this.baseGroup.add(group)
    }
    if (this.holeHandleGroup) {
      this.holeHandleGroup.visible = true
      this.holeHandleGroup.position.set(base.hole.x, cy, base.thickness + 0.3)
      const scale = radius / ((this.holeHandleMesh as any)?.geometry?.parameters?.radius ?? radius)
      if (this.holeHandleMesh && Math.abs(scale - 1) > 0.01) {
        this.holeHandleMesh.scale.set(scale, scale, 1)
        const hit = this.holeHandleGroup.children[1] as any
        if (hit) hit.scale.set(scale, 1, scale)
      }
    }
  }

  getHoleHandleGroup(): Group | null {
    return this.holeHandleGroup
  }
}




function footprintPolygon(base: BaseObject): Polygon {
  // Si es base SVG, usar huella del SVG escalado (con sus huecos) + agujero paramétrico
  if (base.kind === 'svg' && base.svgBaseId) {
    const polys = createFootprintPolysForBase(base)
    if (polys.length > 0) {
      // Convertir Vector2[][][] a Polygon (el primero es outer, resto son holes si es un solo polígono)
      // Si hay múltiples polys disjuntos, tomar el más grande como outer y el resto como islas (se manejan como MultiPolygon después)
      // Para footprint usamos el polígono más grande como referencia
      const allRings: Polygon = []
      for (const poly of polys) {
        for (const ring of poly) {
          allRings.push(ring.map((p) => [p.x, p.y] as [number, number]))
        }
      }
      // Si hay múltiples polys, el primero es outer, el resto son holes o islas
      // Simplificar: si hay más de 1 poly, usar el primero como outer y los demás como holes/islas adicionales
      // Para footprintPolygon (usado para clip), necesitamos un Polygon con outer + holes
      // Tomar el poly más grande como outer
      let outer: [number, number][] | null = null
      let maxArea = -1
      const holes: [number, number][][] = []
      for (const poly of polys) {
        const outerRing = poly[0].map((p) => [p.x, p.y] as [number, number])
        // Calcular área aproximada para elegir el más grande
        let area = 0
        for (let i = 0; i < outerRing.length - 1; i++) area += outerRing[i][0] * outerRing[i + 1][1] - outerRing[i + 1][0] * outerRing[i][1]
        area = Math.abs(area) / 2
        if (area > maxArea) {
          if (outer) holes.push(outer)
          // Si había outer previo, moverlo a holes, y si tenía holes, añadirlos también
          outer = outerRing
          maxArea = area
          // Añadir huecos del poly más grande
          for (let i = 1; i < poly.length; i++) holes.push(poly[i].map((p) => [p.x, p.y] as [number, number]))
        } else {
          // Polys más pequeños se tratan como islas adicionales: añadir su outer como "hole" invertido no es correcto
          // Para footprint usamos solo el outer más grande; las islas disjuntas se manejan como parte del MultiPolygon en pocket
          // Pero para clip, necesitamos un solo Polygon, así que los añadimos como holes adicionales (no perfecto pero funciona para preview)
          holes.push(outerRing)
          for (let i = 1; i < poly.length; i++) holes.push(poly[i].map((p) => [p.x, p.y] as [number, number]))
        }
      }
      if (outer) {
        // Cerrar outer
        const first = outer[0]
        outer.push([first[0], first[1]])
        // Añadir agujero paramétrico si está habilitado
        const paramHoles = footprintHoleRings(base).map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
        return [outer, ...holes, ...paramHoles]
      }
    }
  }
  const outer: [number, number][] = createFootprintShape(base)
    .getPoints(48)
    .map((point) => [point.x, point.y])
  const first = outer[0]
  outer.push([first[0], first[1]])

  const holes = footprintHoleRings(base).map((ring) =>
    ring.map((point) => [point.x, point.y] as [number, number]),
  )
  return [outer, ...holes]
}

function getBaseRingsForPocket(base: BaseObject): { outerRing: Vector2[]; holes: Vector2[][] } {
  if (base.kind === 'svg' && base.svgBaseId) {
    const polys = createFootprintPolysForBase(base)
    if (polys.length > 0) {
      // Convertir el primer poly a outerRing y el resto a holes
      // Para pocket necesitamos outerRing como Vector2[] y holes como Vector2[][]
      const outerPoly = polys[0]
      const outerRing = outerPoly[0].map((p) => new Vector2(p.x, p.y))
      const holes: Vector2[][] = []
      // Añadir huecos del primer poly
      for (let i = 1; i < outerPoly.length; i++) holes.push(outerPoly[i].map((p) => new Vector2(p.x, p.y)))
      // Añadir polys adicionales disjuntos como si fueran parte del outer (para pocket, se manejan como múltiples cutters)
      // Pero outerRing solo puede ser uno, así que los polys adicionales los añadimos como holes adicionales no es correcto
      // Para pocket, outerRing debe ser el contorno exterior más grande, y los demás polys disjuntos se ignoran para outer
      // Sin embargo, footprintHoleRings ya añade el agujero paramétrico
      const paramHoles = footprintHoleRings(base)
      holes.push(...paramHoles)
      // Si hay múltiples polys disjuntos (ej. espada con islas), el pocket outerRing no los cubrirá todos
      // Para esos casos, usar el bbox del SVG como outerRing rectangular sería más seguro
      // Pero por ahora, usar el outer del primer poly y los demás como holes adicionales (aproximación)
      return { outerRing, holes }
    }
  }
  return { outerRing: createFootprintShape(base).getPoints(48), holes: footprintHoleRings(base) }
}

function regionWorldPolygons(region: SvgRegion, world: Matrix4): [number, number][][][] {
  const local = region.polys ?? fallbackPolysFromShapes(region.shapes)
  return local.map((polygon) =>
    polygon.map((ring) =>
      ring.map((point) => {
        const w = new Vector3(point.x, point.y, 0).applyMatrix4(world)
        return [w.x, w.y] as [number, number]
      }),
    ),
  )
}

function localRegionPolygons(region: SvgRegion): [number, number][][][] {
  const local = region.polys ?? fallbackPolysFromShapes(region.shapes)
  return local.map((polygon) =>
    polygon.map((ring) => ring.map((point) => [point.x, point.y] as [number, number])),
  )
}

/**
 * Huella de la base expresada en el espacio local del diseño (inversa de la
 * transformación del diseño aplicada a la huella mundial). Así el recorte de
 * pantalla produce exactamente la misma silueta que antes, pero la geometría
 * resultante no lleva horneada la transformación: vive en el wrapper.
 */
function footprintInDesignSpace(base: BaseObject, design: SvgDesign): Polygon {
  const world = designWorldMatrix(design, base.thickness)
  const inverse = world.clone().invert()
  return footprintPolygon(base).map((ring) =>
    ring.map(([x, y]) => {
      const p = new Vector3(x, y, 0).applyMatrix4(inverse)
      return [p.x, p.y] as [number, number]
    }),
  )
}

function fallbackPolysFromShapes(shapes: Shape[]): Vector2[][][] {
  const polys: Vector2[][][] = []
  for (const shape of shapes) {
    const outer = shape.getPoints(12)
    if (outer.length < 3) continue
    const polygon: Vector2[][] = [outer]
    for (const hole of shape.holes) {
      const ring = hole.getPoints(12)
      if (ring.length >= 3) polygon.push(ring)
    }
    polys.push(polygon)
  }
  return polys
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

function createRegionMesh(geometry: BufferGeometry, design: SvgDesign, originalColor: string): Mesh {
  const mesh = new Mesh(geometry, getDesignMaterial(assignedColorOf(design, originalColor)))
  mesh.userData.originalColor = originalColor
  return mesh
}

function assignedColorOf(design: SvgDesign, originalColor: string): string {
  return (
    design.colors.find((mapping) => mapping.originalColor === originalColor)?.assignedColor ??
    originalColor
  )
}

function applyDesignTransformToWrapper(wrapper: Group, thickness: number, design: SvgDesign) {
  wrapper.position.set(
    design.position.x,
    design.position.y,
    Math.max(0, thickness - design.depth) + DESIGN_LIFT_MM,
  )
  wrapper.quaternion.setFromAxisAngle(
    new Vector3(0, 0, 1),
    (design.rotationDeg * Math.PI) / 180,
  )
  wrapper.scale.set(design.scaleX, design.scaleY, 1)
}

// sanitizeName quedó en desuso tras migrar a nombres genéricos `Diseño_1`
// (se conserva comentado para referencia histórica):
// function sanitizeName(value: string) {
//   return value.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'diseno'
// }

