<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { TransformControls } from 'three/addons/controls/TransformControls.js'
import { useProjectStore } from '../stores/project'
import { useThemeStore } from '../stores/theme'
import { createScene } from '../three/scene'
import { createCamera } from '../three/camera'
import { createRenderer } from '../three/renderer'
import { addLights } from '../three/lights'
import { createOrbitControls, createTransformControls } from '../three/controls'
import { BookmarkScene } from '../engine/builder/bookmarkScene'
import { getParsedSvg } from '../engine/svg/svgCache'
import { mergePartsByColor } from '../engine/export/solids'
import { validateSolidsAsync } from '../engine/export/validate'
import { exportStlParts } from '../engine/export/stl'
import { export3mfAsync } from '../engine/export/threeMF'
import { disposeAllDesignGeometries } from '../engine/geometry/designGeometry'
import { disposeAllMaterials } from '../engine/materials/materialRegistry'
import { downloadBlob } from '../utils/download'

const COMMIT_DELAY_MS = 120
const VIEW_DISTANCE = 280

const store = useProjectStore()
const themeStore = useThemeStore()

const container = ref<HTMLDivElement | null>(null)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let orbitControls: OrbitControls
let transformControls: TransformControls
let bookmarkScene: BookmarkScene
let resizeObserver: ResizeObserver
let rafId = 0
let commitTimer = 0
let exportWarnings: string[] = []

function getParsed(id: string) {
  return getParsedSvg(id)
}

function reportEmptyDesigns(emptyDesignIds: string[]) {
  if (emptyDesignIds.length === 0) return
  const names = emptyDesignIds
    .map((id) => store.designs.find((design) => design.id === id)?.name ?? id)
    .join(', ')
  store.setStatus(`El diseño «${names}» queda completamente fuera del separador.`, 'error')
}

async function runCommittedUpdate() {
  if (!bookmarkScene) return
  // Para SVGs grandes con marco, usar versión async que cede al event loop
  // y evita "Página no responde" al mandar al diseñador
  const hasLargeSvg = store.designs.some((d) => {
    const p = getParsed(d.id)
    return p ? p.regions.reduce((n, r) => n + (r.polys?.length ?? r.shapes.length), 0) > 20 : false
  })
  const result = hasLargeSvg
    ? await bookmarkScene.updateAsync(store.base, store.designs, getParsed)
    : bookmarkScene.update(store.base, store.designs, getParsed)
  reportEmptyDesigns(result.emptyDesignIds)
}

function scheduleCommit() {
  window.clearTimeout(commitTimer)
  commitTimer = window.setTimeout(() => void runCommittedUpdate(), COMMIT_DELAY_MS)
}

function baseSignature() {
  const hole = store.base.hole
  return [
    store.base.kind,
    store.base.width,
    store.base.height,
    store.base.thickness,
    store.base.cornerRadius,
    store.base.silhouette,
    hole.enabled,
    hole.diameter,
    hole.topOffset,
    hole.x,
  ].join('|')
}

function transformSignature() {
  return store.designs
    .map((design) =>
      [
        design.id,
        design.position.x,
        design.position.y,
        design.scaleX,
        design.scaleY,
        design.rotationDeg,
        design.depth,
      ].join(','),
    )
    .join(';')
}

function colorsSignature() {
  const parts = [store.base.color]
  for (const design of store.designs) {
    parts.push(
      design.id,
      String(design.visible),
      ...design.colors.map((mapping) => `${mapping.originalColor}>${mapping.assignedColor}`),
    )
  }
  return parts.join('|')
}

function idsSignature() {
  return store.designs.map((design) => design.id).join('|')
}

watch(baseSignature, () => {
  window.clearTimeout(commitTimer)
  // Durante arrastre del agujero, reconstruir solo el mesh de base en vivo
  // (barato) y diferrir el re-clip de diseños al soltar (evita lag por mousemove).
  if (store.holeDragMode) {
    bookmarkScene?.updateBaseMesh(store.base)
    scheduleCommit()
    return
  }
  runCommittedUpdate()
})

watch(transformSignature, () => {
  scheduleCommit()
})

watch(colorsSignature, () => {
  if (!bookmarkScene) return
  bookmarkScene.rematerialize(store.base, store.designs)
  bookmarkScene.syncVisibility(store.designs)
})

watch(idsSignature, () => {
  if (!bookmarkScene) return
  window.clearTimeout(commitTimer)
  runCommittedUpdate()
  attachGizmo()
})

watch(
  () => store.selectedDesignId,
  () => attachGizmo(),
)

watch(
  () => store.transformMode,
  (mode) => {
    if (mode === 'hole') return
    transformControls?.setMode(mode as any)
  },
)

watch(
  () => store.holeDragMode,
  (enabled) => {
    if (enabled) {
      detachGizmo()
      const holeGroup = bookmarkScene.getHoleHandleGroup()
      if (holeGroup) {
        transformControls.setMode('translate')
        transformControls.attach(holeGroup)
      }
    } else {
      transformControls.detach()
      attachGizmo()
    }
  },
)

watch(
  () => store.previewMode,
  (preview) => {
    bookmarkScene?.setPreviewMode(preview)
    if (preview) {
      detachGizmo()
    } else {
      attachGizmo()
    }
  },
)

watch(
  () => store.viewRequest.nonce,
  () => applyView(store.viewRequest.view),
)

watch(
  () => themeStore.theme,
  (theme) => {
    if (scene) {
      scene.background = new THREE.Color(theme === 'dark' ? 0x1a1b26 : 0xe8f0ff)
    }
  },
)

function attachGizmo() {
  if (!transformControls || !bookmarkScene) return
  if (!store.selectedDesignId || store.previewMode) {
    detachGizmo()
    return
  }
  const wrapper = bookmarkScene.getWrapper(store.selectedDesignId)
  if (wrapper) {
    transformControls.attach(wrapper)
  } else {
    detachGizmo()
  }
}

function detachGizmo() {
  transformControls?.detach()
}

function applyView(view: 'face' | 'profile' | 'reset') {
  if (!camera || !orbitControls) return
  const z = store.base.thickness / 2

  const positions: Record<string, [number, number, number]> = {
    face: [0, VIEW_DISTANCE, z + 0.01],
    profile: [0, z + 40, VIEW_DISTANCE * 0.8],
    reset: [150, 170, 150],
  }

  const position = positions[view] ?? positions.reset
  camera.position.set(...position)
  orbitControls.target.set(0, z, 0)
  orbitControls.update()
}

function syncFromGizmo() {
  const design = store.selectedDesign
  if (!design || !transformControls) return
  const wrapper = transformControls.object
  if (!(wrapper instanceof THREE.Group)) return

  // El wrapper ESPEJA la transformación del diseño (la aplica también la
  // escena al reconstruir), así que sus valores absolutos son la verdad.
  // Con escalado uniforme, el arrastre de un eje se replica en vivo al otro.
  // Fix: usar el eje activo de TransformControls para permitir tanto aumentar
  // como disminuir. Antes usaba Math.max que impedía disminuir (ej. X=0.5,Y=1 -> max=1).
  if (design.uniformScale && transformControls.mode === 'scale') {
    const axis: string | null = (transformControls as any).axis ?? null
    let uniform: number
    if (axis === 'X') uniform = Math.abs(wrapper.scale.x)
    else if (axis === 'Y') uniform = Math.abs(wrapper.scale.y)
    else if (axis === 'Z') uniform = Math.abs(wrapper.scale.z)
    else {
      // Para handles de esquina/centro (XY, XYZ) o axis null, usar el que más cambió respecto a 1
      // y clamp a límites para evitar 0
      const sx = Math.abs(wrapper.scale.x)
      const sy = Math.abs(wrapper.scale.y)
      // Elegir el que está más lejos de 1 (permite tanto crecer como encoger)
      const dx = Math.abs(sx - 1)
      const dy = Math.abs(sy - 1)
      uniform = dx > dy ? sx : sy
      // Fallback si ambos son 1 (sin cambio) usar max para compatibilidad
      if (uniform === 1 && sx !== 1) uniform = sx
      if (uniform === 1 && sy !== 1) uniform = sy
    }
    // Clampear al mínimo permitido (1%) para evitar escala 0 por arrastre excesivo
    const clamped = Math.min(Math.max(uniform, 0.01), 20)
    wrapper.scale.set(clamped, clamped, 1)
  }

  store.setPosition(wrapper.position.x, wrapper.position.y)
  store.setRotation(THREE.MathUtils.radToDeg(wrapper.rotation.z))
  store.syncScaleFromTransform(Math.abs(wrapper.scale.x), Math.abs(wrapper.scale.y))
}

function onDraggingChanged(event: { value: unknown }) {
  orbitControls.enabled = !Boolean(event.value)
}

function syncHoleFromGizmo() {
  if (!store.holeDragMode || !transformControls) return
  const obj = transformControls.object
  if (!(obj instanceof THREE.Group) || obj.name !== 'holeHandleGroup') return
  const radius = store.base.hole.diameter / 2
  const rawX = obj.position.x
  const rawTopOffset = store.base.height / 2 - obj.position.y - radius
  // clampHole en el store validará límites automáticamente
  store.updateBase({
    hole: { ...store.base.hole, x: rawX, topOffset: rawTopOffset },
  })
}

function onObjectChange() {
  if (store.holeDragMode) {
    syncHoleFromGizmo()
  } else {
    syncFromGizmo()
  }
}

onMounted(() => {
  const canvas = container.value!.querySelector('canvas') as HTMLCanvasElement

  scene = createScene(themeStore.theme).scene

  camera = createCamera({ position: [150, 170, 150], target: [0, 0.75, 0] })
  renderer = createRenderer(canvas)
  addLights(scene)

  bookmarkScene = new BookmarkScene(scene)
  bookmarkScene.update(store.base, store.designs, getParsed)

  orbitControls = createOrbitControls(camera, canvas)
  orbitControls.target.set(0, store.base.thickness / 2, 0)
  orbitControls.update()

  transformControls = createTransformControls(camera, canvas)
  transformControls.setMode(store.transformMode === 'hole' ? 'translate' : (store.transformMode as any))
  transformControls.setSpace('local')
  scene.add(transformControls.getHelper())

  transformControls.addEventListener('dragging-changed', onDraggingChanged)
  transformControls.addEventListener('objectChange', onObjectChange)

  resizeObserver = new ResizeObserver(() => {
    const width = container.value!.clientWidth
    const height = container.value!.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  })
  resizeObserver.observe(container.value!)

  attachGizmo()

  const animate = () => {
    rafId = requestAnimationFrame(animate)
    orbitControls.update()
    renderer.render(scene, camera)
  }
  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.clearTimeout(commitTimer)
  resizeObserver.disconnect()
  transformControls.removeEventListener('dragging-changed', onDraggingChanged)
  transformControls.removeEventListener('objectChange', syncFromGizmo)
  transformControls.dispose()
  orbitControls.dispose()
  bookmarkScene.dispose()
  disposeAllDesignGeometries()
  disposeAllMaterials()
  renderer.dispose()
})

function serializeParsedForWorker(parsed: any) {
  if (!parsed) return null
  return {
    width: parsed.width,
    height: parsed.height,
    warnings: parsed.warnings ?? [],
    regions: parsed.regions.map((r: any) => ({
      originalColor: r.originalColor,
      // polys ya es Vector2[][][] → serializar a [x,y][][][]
      polys: (r.polys ?? []).map((poly: any) =>
        poly.map((ring: any) => ring.map((p: any) => [p.x ?? p[0], p.y ?? p[1]] as [number, number])),
      ),
    })),
  }
}

async function tryWorkerExport(kind: '3mf' | 'stl'): Promise<boolean> {
  // Usar Worker solo en navegador y solo para 3MF (el caso pesado).
  // En tests (happy-dom/node) Worker puede no existir → fallback.
  if (kind !== '3mf' || typeof Worker === 'undefined') return false
  // No usar worker si hay pocos diseños y pocos contornos (rápido en main thread)
  // Pero para 2 SVGs distintos el worker evita "página no responde" aunque tarde 1-2s.
  const useWorker = store.designs.filter((d) => d.visible).length >= 1
  if (!useWorker) return false

  try {
    const parsedList = store.designs
      .map((d) => {
        const p = getParsed(d.id)
        if (!p) return null
        const ser = serializeParsedForWorker(p)
        if (!ser) return null
        return { id: d.id, ...ser }
      })
      .filter(Boolean) as any[]

    let baseParsed: any = null
    if (store.base.kind === 'svg' && store.base.svgBaseId) {
      const p = getParsed(store.base.svgBaseId)
      if (p) {
        const ser = serializeParsedForWorker(p)
        if (ser) baseParsed = ser
      }
    }

    const worker = new Worker(new URL('../engine/workers/exportWorker.ts', import.meta.url), {
      type: 'module',
    })

    const result = await new Promise<{ buffer: Uint8Array; warnings: string[]; solidsCount: number }>(
      (resolve, reject) => {
        const timeout = window.setTimeout(() => {
          worker.terminate()
          reject(new Error('timeout worker'))
        }, 120000)
        worker.onmessage = (e: MessageEvent<any>) => {
          const msg = e.data
          if (msg.type === 'progress') {
            store.setStatus(msg.stage, 'info')
          } else if (msg.type === 'done') {
            window.clearTimeout(timeout)
            worker.terminate()
            resolve(msg)
          } else if (msg.type === 'error') {
            window.clearTimeout(timeout)
            worker.terminate()
            reject(new Error(msg.message))
          }
        }
        worker.onerror = (err) => {
          window.clearTimeout(timeout)
          worker.terminate()
          reject(err)
        }
        worker.postMessage({
          base: JSON.parse(JSON.stringify(store.base)),
          designs: JSON.parse(JSON.stringify(store.designs)),
          parsedList,
          baseParsed,
          kind,
        })
      },
    )

    // Descarga en hilo principal (no se puede hacer desde worker)
    downloadBlob(new Blob([result.buffer as unknown as BlobPart], { type: 'model/3mf' }), 'flopalab.3mf')
    const warningNote = result.warnings.length > 0 ? ` Aviso: ${result.warnings.join(' ')}` : ''
    store.setStatus(`3MF exportado con ${result.solidsCount} pieza(s).${warningNote}`, 'success')
    return true
  } catch (e) {
    console.warn('Worker export falló, fallback a main thread', e)
    return false
  }
}

async function doExport(kind: '3mf' | 'stl') {
  if (!bookmarkScene) return

  window.clearTimeout(commitTimer)
  runCommittedUpdate()

  // Intentar vía Worker para no bloquear UI (evita "página no responde" con 2 SVGs)
  if (kind === '3mf') {
    store.setStatus('Preparando geometría para exportar…', 'info')
    const workerOk = await tryWorkerExport(kind)
    if (workerOk) return
    // fallback continúa abajo por main thread
  }

  store.setStatus('Preparando geometría para exportar…', 'info')

  let solids
  try {
    const { parts, warnings } = await bookmarkScene.buildExportModel(
      store.base,
      store.designs,
      getParsed,
      (step) => store.setStatus(step, 'info'),
    )
    // ceder para que la UI repinte el último paso de `buildExportModel`
    await new Promise<void>((r) => setTimeout(r, 0))
    store.setStatus('Agrupando por color…', 'info')
    await new Promise<void>((r) => setTimeout(r, 0))
    solids = mergePartsByColor(parts)
    exportWarnings = warnings
  } catch (error) {
    console.error(error)
    store.setStatus('No se pudo preparar la geometría para exportar.', 'error')
    return
  }

  store.setStatus('Validando mallas…', 'info')
  await new Promise<void>((r) => setTimeout(r, 0))
  const report = await validateSolidsAsync(solids, (done, total) =>
    store.setStatus(`Validando… ${done + 1}/${total}…`, 'info'),
  )
  if (report.errors.length > 0) {
    store.setStatus(report.errors.join(' '), 'error')
    return
  }

  try {
    if (kind === '3mf') {
      await export3mfAsync(solids, 'flopalab', (stage) => store.setStatus(stage, 'info'))
    } else {
      // STL por ahora sincrónico (pocas piezas); ceder antes para repintar
      await new Promise<void>((r) => setTimeout(r, 0))
      exportStlParts(solids, 'flopalab')
    }
    const warningNote =
      report.warnings.length > 0 || exportWarnings.length > 0
        ? ` Aviso: ${[...exportWarnings, ...report.warnings].join(' ')}`
        : ''
    store.setStatus(
      kind === '3mf'
        ? `3MF exportado con ${solids.length} pieza(s).${warningNote}`
        : `${solids.length} archivo(s) STL exportado(s).${warningNote}`,
      'success',
    )
  } catch (error) {
    console.error(error)
    store.setStatus('Falló la exportación.', 'error')
  }
}

defineExpose({
  export3mf: () => doExport('3mf'),
  exportStl: () => doExport('stl'),
})
</script>

<template>
  <div ref="container" class="canvas-3d">
    <canvas></canvas>
  </div>
</template>

<style scoped>
.canvas-3d {
  position: relative;
  width: 100%;
  height: 100%;
}

.canvas-3d canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
