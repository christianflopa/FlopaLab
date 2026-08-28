<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useProjectStore } from '../../stores/project'
import { parseSvgToRegions } from '../../engine/svg/parseSvg'
import { setParsedSvg } from '../../engine/svg/svgCache'
import { downloadBlob } from '../../utils/download'
import DropZone from './components/DropZone.vue'
import SvgPreviewPane from './components/SvgPreviewPane.vue'
import FilterBar from './components/FilterBar.vue'
import ParamPanel from './components/ParamPanel.vue'
import CleanToolbar from './components/CleanToolbar.vue'
import ImageCropper from './components/ImageCropper.vue'
import BrushCanvas from './components/BrushCanvas.vue'
import { PRESETS, DEFAULT_PARAMS } from './engine/presets'
import { traceImageToSvg, loadImageData } from './engine/tracerPipeline'
import { SvgCleanEngine } from './engine/svgCleanEngine'
import type { FilterPreset, FilterMode, TracerParams, CleanTool } from './types'

const emit = defineEmits<{ close: [] }>()
const store = useProjectStore()

const imageDataUrl = ref<string | null>(null)
const imageDataRef = ref<ImageData | null>(null)
const svgString = ref<string | null>(null)
const preset = ref<FilterPreset>('contorno1')
const mode = ref<FilterMode>('preset')
const mono = ref(true)
const removeBackground = ref(false)
const params = ref<TracerParams>({ ...DEFAULT_PARAMS })
const isProcessing = ref(false)
const status = ref('')

// clean
const cleanEngine = new SvgCleanEngine()
const cleanSvg = ref<string | null>(null)
const tool = ref<CleanTool>('delete')
const selectedColor = ref('#ff0000')
const brushSize = ref(3)
const canUndo = ref(false)
const canRedo = ref(false)
const showClean = ref(false)
const cleanZoom = ref(1)
const previewView = ref<'single' | 'split'>('split')
const singleZoom = ref(1)
const showCropper = ref(false)
const hasCrop = ref(false)
const imageAspect = ref<number | null>(null)

const singlePreviewBoxStyle = computed(() => {
  if (!imageAspect.value) return {}
  const isVertical = imageAspect.value < 0.9
  return isVertical
    ? { height: 'clamp(420px, 62vh, 680px)', minHeight: '420px', maxHeight: '680px' }
    : { height: 'clamp(320px, 42vh, 520px)', minHeight: '320px', maxHeight: '520px' }
})
const cleanPreviewBoxStyle = computed(() => {
  if (!imageAspect.value) return {}
  const isVertical = imageAspect.value < 0.9
  return isVertical
    ? { height: 'clamp(460px, 68vh, 720px)', minHeight: '460px', maxHeight: '720px' }
    : { height: 'clamp(380px, 58vh, 620px)', minHeight: '380px', maxHeight: '620px' }
})

function onCleanCanvasClick(e: MouseEvent) {
  const target = e.target as Element
  const closest = target.closest('[id^="seg-"]') as Element | null
  if (closest?.id) onSvgClick(closest.id)
}

function updateCanUndoRedo() {
  canUndo.value = cleanEngine.canUndo()
  canRedo.value = cleanEngine.canRedo()
}

let paramDebounce: number | undefined
let traceVersion = 0

watch(preset, (v) => {
  if (v === 'custom') {
    mode.value = 'custom'
    if (imageDataRef.value) doTrace()
    return
  }
  params.value = { ...PRESETS[v as keyof typeof PRESETS].params }
  mono.value = PRESETS[v as keyof typeof PRESETS].mono
  if (imageDataRef.value) doTrace()
})

watch(mono, () => {
  if (imageDataRef.value) doTrace()
})

watch(removeBackground, () => {
  if (imageDataRef.value && svgString.value) {
    // Re-aplicar limpieza de fondo sin re-trazar si ya hay SVG
    if (removeBackground.value) {
      const cleaned = removeBackgroundFromSvg(svgString.value)
      const withIds = SvgCleanEngine.ensureIds(cleaned)
      svgString.value = withIds
      cleanSvg.value = withIds
      cleanEngine.load(withIds)
      updateCanUndoRedo()
    } else if (imageDataRef.value) {
      doTrace()
    }
  } else if (imageDataRef.value) doTrace()
})

watch(mode, (v) => {
  if (v === 'preset' && preset.value !== 'custom' && imageDataRef.value) doTrace()
  else if (v === 'custom' && imageDataRef.value) doTrace()
})

function removeBackgroundFromSvg(svg: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const svgEl = doc.documentElement
    const isMonoAndClean = mono.value && removeBackground.value
    // Si mono+eliminar fondo, borrar TODO lo blanco (como PNG sin fondo)
    if (isMonoAndClean) {
      const all = Array.from(doc.querySelectorAll('path, rect, polygon, circle, ellipse'))
      for (const el of all) {
        const fill = (el.getAttribute('fill') || '').toLowerCase().trim()
        const isWhite = fill === '#ffffff' || fill === '#fff' || fill === 'white' || fill === 'rgb(255,255,255)' || fill === '#fffffe' || fill === ''
        // Si no tiene fill explícito, puede ser blanco por defecto en imagetracer mono
        // Considerar también elementos sin fill pero con stroke blanco
        if (isWhite || (!el.getAttribute('fill') && !el.getAttribute('stroke'))) {
          // No borrar el marco si es negro (frameColor puede ser negro, pero su fill es negro, no blanco)
          if (el.id && el.id.startsWith('seg-frame-')) continue
          el.remove()
        }
      }
      // También limpiar rect de fondo 100%
      const bgRects = doc.querySelectorAll('rect')
      bgRects.forEach((r) => {
        const w = r.getAttribute('width')
        const h = r.getAttribute('height')
        if ((w === '100%' && h === '100%') || (w === '100' && h === '100')) {
          const f = (r.getAttribute('fill') || '').toLowerCase()
          if (f.includes('fff') || f === 'white' || !f) r.remove()
        }
      })
      return new XMLSerializer().serializeToString(svgEl)
    }
    // Caso normal (no mono+clean): solo fondo grande
    const candidates = Array.from(doc.querySelectorAll('path, rect, polygon'))
    for (const el of candidates) {
      const fill = (el.getAttribute('fill') || '').toLowerCase()
      const isWhite = fill === '#ffffff' || fill === '#fff' || fill === 'white' || fill === 'rgb(255,255,255)'
      if (isWhite) {
        const parent = el.parentElement
        if (parent && (parent === svgEl || parent.tagName.toLowerCase() === 'g')) {
          if (el.tagName.toLowerCase() === 'rect') {
            const w = parseFloat(el.getAttribute('width') || '0')
            const h = parseFloat(el.getAttribute('height') || '0')
            if (w > 50 && h > 50) {
              el.remove()
              break
            }
          } else {
            const allPaths = doc.querySelectorAll('path')
            if (allPaths.length > 3 && el === allPaths[0]) {
              const d = el.getAttribute('d') || ''
              if (d.length > 100) {
                el.remove()
                break
              }
            } else if (allPaths.length <= 3) {
              el.remove()
              break
            }
          }
        }
      }
    }
    const bgRect = doc.querySelector('rect[width="100%"][height="100%"]')
    if (bgRect && (bgRect.getAttribute('fill') || '').toLowerCase().includes('fff')) {
      bgRect.remove()
    }
    return new XMLSerializer().serializeToString(svgEl)
  } catch {
    return svg
  }
}

async function onFileSelected(file: File) {
  if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
    const text = await file.text()
    const withIds = SvgCleanEngine.ensureIds(text)
    svgString.value = withIds
    cleanSvg.value = withIds
    cleanEngine.load(withIds)
    updateCanUndoRedo()
    showClean.value = true
    status.value = 'SVG cargado para limpieza'
    // Para SVG existente, intentar inferir aspecto del viewBox
    try {
      const p = new DOMParser().parseFromString(text, 'image/svg+xml')
      const vb = p.documentElement.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
      if (vb && vb.length === 4) imageAspect.value = vb[2] / vb[3]
    } catch {}
    return
  }
  // imagen raster
  isProcessing.value = true
  status.value = 'Cargando imagen…'
  try {
    const { dataUrl, imageData } = await loadImageData(file)
    imageDataUrl.value = dataUrl
    imageDataRef.value = imageData
    imageAspect.value = imageData.width / imageData.height
    await doTrace()
  } catch (e: any) {
    status.value = `Error cargando imagen: ${e?.message ?? e}`
  } finally {
    isProcessing.value = false
  }
}

let traceWorker: Worker | null = null
function getTraceWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    if (!traceWorker) {
      traceWorker = new Worker(new URL('./engine/rasterWorker.ts', import.meta.url), { type: 'module' })
    }
    return traceWorker
  } catch {
    return null
  }
}

async function doTrace() {
  if (!imageDataRef.value) return
  const myVersion = ++traceVersion
  isProcessing.value = true
  status.value = 'Trazando…'
  try {
    const effectiveParams = mode.value === 'preset' && preset.value !== 'custom' ? PRESETS[preset.value as keyof typeof PRESETS].params : params.value
    const maxSide = highQuality.value ? 1024 : 640
    const worker = getTraceWorker()
    let result: string
    if (worker) {
      try {
        result = await new Promise<string>((resolve, reject) => {
          const handler = (e: MessageEvent<any>) => {
            const msg = e.data
            if (msg.type === 'progress') {
              if (traceVersion === myVersion) status.value = msg.stage
            } else if (msg.type === 'done') {
              worker.removeEventListener('message', handler as any)
              if (traceVersion !== myVersion) return // stale, ignorar
              resolve(msg.svgString)
            } else if (msg.type === 'error') {
              worker.removeEventListener('message', handler as any)
              if (traceVersion !== myVersion) return
              reject(new Error(msg.message))
            }
          }
          worker.addEventListener('message', handler as any)
          const img = imageDataRef.value!
          const dataCopy = new Uint8ClampedArray(img.data)
          try {
            worker.postMessage(
              {
                imageData: { width: img.width, height: img.height, data: dataCopy },
                params: JSON.parse(JSON.stringify(effectiveParams)),
                mono: mono.value,
                maxSide,
                removeBackground: removeBackground.value,
              },
            )
          } catch (postErr) {
            worker.removeEventListener('message', handler as any)
            throw postErr
          }
        })
      } catch (e) {
        console.warn('Worker postMessage falló, fallback a main thread', e)
        result = await traceImageToSvg(
          imageDataRef.value!,
          effectiveParams,
          mono.value,
          (s) => {
            if (traceVersion === myVersion) status.value = s
          },
          { maxSide, removeBackground: removeBackground.value },
        )
      }
    } else {
      result = await traceImageToSvg(
        imageDataRef.value,
        effectiveParams,
        mono.value,
        (s) => {
          if (traceVersion === myVersion) status.value = s
        },
        { maxSide, removeBackground: removeBackground.value },
      )
    }
    if (traceVersion !== myVersion) return // otro trace más reciente ganó
    let finalSvg = result
    if (removeBackground.value) {
      finalSvg = removeBackgroundFromSvg(finalSvg)
    }
    if (frameEnabled.value) {
      finalSvg = addFrameToSvg(finalSvg)
    }
    const withIds = SvgCleanEngine.ensureIds(finalSvg)
    svgString.value = withIds
    cleanSvg.value = withIds
    cleanEngine.load(withIds)
    updateCanUndoRedo()
    status.value = ''
  } catch (e: any) {
    if (traceVersion !== myVersion) return
    status.value = `Error trazando: ${e?.message ?? e}`
  } finally {
    if (traceVersion === myVersion) isProcessing.value = false
  }
}

function onParamUpdate(patch: Partial<TracerParams>) {
  params.value = { ...params.value, ...patch }
  preset.value = 'custom'
  mode.value = 'custom'
  if (!imageDataRef.value) return
  window.clearTimeout(paramDebounce)
  paramDebounce = window.setTimeout(() => doTrace(), 350)
}

function onSvgClick(segmentId: string) {
  if (!cleanSvg.value) return
  let next: string | null = null
  if (tool.value === 'delete') next = cleanEngine.deleteSegment(segmentId)
  else if (tool.value === 'paint') next = cleanEngine.recolorSegment(segmentId, selectedColor.value)
  else return
  if (next) {
    cleanSvg.value = next
    svgString.value = next // mantener sincronizado para preview
    updateCanUndoRedo()
  }
}

function onBrushStroke(pathData: string) {
  if (!cleanSvg.value) return
  const next = cleanEngine.addBrushStroke(pathData, selectedColor.value, brushSize.value)
  if (next) {
    cleanSvg.value = next
    svgString.value = next
    updateCanUndoRedo()
  }
}

function onUndo() {
  const next = cleanEngine.undo()
  cleanSvg.value = next
  svgString.value = next
  updateCanUndoRedo()
}
function onRedo() {
  const next = cleanEngine.redo()
  cleanSvg.value = next
  svgString.value = next
  updateCanUndoRedo()
}

function onDownload() {
  const svg = cleanSvg.value ?? svgString.value
  if (!svg) return
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  downloadBlob(blob, 'rasterlab.svg')
  status.value = 'SVG descargado'
}

async function onSendToDesigner() {
  const svg = cleanSvg.value ?? svgString.value
  if (!svg) return
  status.value = 'Preparando diseño 3D…'
  // Ceder para que la UI pinte el estado antes del trabajo pesado
  await new Promise<void>((r) => setTimeout(r, 0))
  try {
    const parsed = parseSvgToRegions(svg)
    if (parsed.regions.length === 0) {
      status.value = 'El SVG no contiene formas válidas'
      return
    }
    // Simular async para no bloquear el hilo entre parse y addDesign
    await new Promise<void>((r) => setTimeout(r, 0))
    const design = store.addDesign('rasterlab.svg', parsed)
    setParsedSvg(design.id, parsed)
    status.value = `Enviado al diseñador como ${design.name}`
    await new Promise<void>((r) => setTimeout(r, 30))
    emit('close')
  } catch (e: any) {
    status.value = `Error enviando al diseñador: ${e?.message ?? e}`
  }
}

function onCropApply(area: { x: number; y: number; width: number; height: number }) {
  if (!imageDataRef.value || !imageDataUrl.value) return
  const src = imageDataRef.value
  const sx = Math.round((area.x / 100) * src.width)
  const sy = Math.round((area.y / 100) * src.height)
  const sw = Math.round((area.width / 100) * src.width)
  const sh = Math.round((area.height / 100) * src.height)
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  const tmp = document.createElement('canvas')
  tmp.width = src.width
  tmp.height = src.height
  tmp.getContext('2d')!.putImageData(src, 0, 0)
  ctx.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh)
  const cropped = ctx.getImageData(0, 0, sw, sh)
  imageDataRef.value = cropped
  imageDataUrl.value = canvas.toDataURL('image/png')
  imageAspect.value = sw / sh
  hasCrop.value = true
  showCropper.value = false
  doTrace()
}

function onCropCancel() {
  showCropper.value = false
}

const frameEnabled = ref(false)
const frameWidth = ref(2)
const frameColor = ref('#000000')
const framePadding = ref(1)
const highQuality = ref(false)

function addFrameToSvg(svg: string): string {
  if (!frameEnabled.value) return svg
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const svgEl = doc.documentElement
    let minX = 0, minY = 0, vbW = 100, vbH = 100
    const vb = svgEl.getAttribute('viewBox')
    if (vb) {
      const p = vb.split(/[\s,]+/).map(Number)
      if (p.length === 4 && p.every(Number.isFinite)) [minX, minY, vbW, vbH] = p
    } else {
      const w = parseFloat(svgEl.getAttribute('width') || '100')
      const h = parseFloat(svgEl.getAttribute('height') || '100')
      if (Number.isFinite(w) && Number.isFinite(h)) { vbW = w; vbH = h }
    }
    const fw = Math.max(0.5, frameWidth.value)
    const pad = Math.max(0, framePadding.value)
    if (fw * 2 >= vbW || fw * 2 >= vbH) return svg
    
    // Marco como anillo entre borde exterior (viewBox) y borde interior
    // El grosor del marco es fw, y el padding crea un gap entre el marco y el contenido SVG
    const outerX = minX
    const outerY = minY
    const outerW = vbW
    const outerH = vbH
    // El borde interior del marco está a fw del borde exterior
    const innerX = minX + fw
    const innerY = minY + fw
    const innerW = vbW - fw * 2
    const innerH = vbH - fw * 2
    
    if (innerW <= 0 || innerH <= 0) return svg
    
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    const d = `M ${outerX} ${outerY} H ${outerX + outerW} V ${outerY + outerH} H ${outerX} Z M ${innerX} ${innerY} H ${innerX + innerW} V ${innerY + innerH} H ${innerX} Z`
    path.setAttribute('d', d)
    path.setAttribute('fill', frameColor.value)
    path.setAttribute('fill-rule', 'evenodd')
    path.setAttribute('stroke', 'none')
    path.setAttribute('id', `seg-frame-${Date.now()}`)
    path.setAttribute('data-frame', 'true')
    svgEl.appendChild(path)
    
    // Aplicar padding ajustando el viewBox para crear gap entre marco y contenido
    if (pad > 0) {
      const newMinX = minX + pad
      const newMinY = minY + pad
      const newW = vbW - pad * 2
      const newH = vbH - pad * 2
      if (newW > 0 && newH > 0) {
        svgEl.setAttribute('viewBox', `${newMinX} ${newMinY} ${newW} ${newH}`)
      }
    }
    
    return new XMLSerializer().serializeToString(svgEl)
  } catch {
    return svg
  }
}

function applyFrameIfNeeded(svg: string): string {
  if (!frameEnabled.value) {
    // remover frame existente si lo hay
    try {
      const p = new DOMParser()
      const d = p.parseFromString(svg, 'image/svg+xml')
      const f = d.querySelector('[id^="seg-frame-"]')
      if (f) {
        f.remove()
        return new XMLSerializer().serializeToString(d.documentElement)
      }
    } catch {}
    return svg
  }
  // remover frame viejo si existe para evitar duplicados, luego añadir nuevo
  let baseSvg = svg
  try {
    const p = new DOMParser()
    const d = p.parseFromString(svg, 'image/svg+xml')
    const old = d.querySelector('[id^="seg-frame-"]')
    if (old) {
      old.remove()
      baseSvg = new XMLSerializer().serializeToString(d.documentElement)
    }
  } catch {}
  return addFrameToSvg(baseSvg)
}

function onClean() {
  if (!svgString.value) return
  const withIds = SvgCleanEngine.ensureIds(svgString.value)
  cleanSvg.value = withIds
  cleanEngine.load(withIds)
  updateCanUndoRedo()
  showClean.value = true
}

function onFrameToggle(enabled: boolean) {
  frameEnabled.value = enabled
  if (!svgString.value) return
  const updated = applyFrameIfNeeded(svgString.value)
  const withIds = SvgCleanEngine.ensureIds(updated)
  svgString.value = withIds
  cleanSvg.value = withIds
  cleanEngine.load(withIds)
  updateCanUndoRedo()
}

function onFrameWidthChange(w: number) {
  frameWidth.value = w
  if (!svgString.value || !frameEnabled.value) return
  const updated = applyFrameIfNeeded(svgString.value)
  const withIds = SvgCleanEngine.ensureIds(updated)
  svgString.value = withIds
  cleanSvg.value = withIds
  cleanEngine.load(withIds)
  updateCanUndoRedo()
}

function onFrameColorChange(c: string) {
  frameColor.value = c
  if (!svgString.value || !frameEnabled.value) return
  const updated = applyFrameIfNeeded(svgString.value)
  const withIds = SvgCleanEngine.ensureIds(updated)
  svgString.value = withIds
  cleanSvg.value = withIds
  cleanEngine.load(withIds)
  updateCanUndoRedo()
}

function onFramePaddingChange(p: number) {
  framePadding.value = p
  if (!svgString.value || !frameEnabled.value) return
  const updated = applyFrameIfNeeded(svgString.value)
  const withIds = SvgCleanEngine.ensureIds(updated)
  svgString.value = withIds
  cleanSvg.value = withIds
  cleanEngine.load(withIds)
  updateCanUndoRedo()
}
</script>

<template>
  <div class="rasterlab" @click.self="emit('close')">
    <div class="rasterlab__panel">
      <header class="rasterlab__header">
        <h2 class="rasterlab__title">{{ showClean ? 'RasterLab - Limpiar SVG' : 'RasterLab - Convertidor' }}</h2>
        <button class="rasterlab__close" @click="emit('close')">×</button>
      </header>

      <div class="rasterlab__body">
        <!-- Vista TRAZADO: imagen + preview + filtros -->
        <template v-if="!showClean">
          <DropZone :disabled="isProcessing" @file-selected="onFileSelected" />

          <div class="rasterlab__viewToggle">
            <span class="rasterlab__viewLabel">Vista:</span>
            <button
              class="rasterlab__viewBtn"
              :class="{ 'rasterlab__viewBtn--active': previewView === 'single' }"
              title="Solo resultado"
              @click="previewView = 'single'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
            <button
              class="rasterlab__viewBtn"
              :class="{ 'rasterlab__viewBtn--active': previewView === 'split' }"
              title="Imagen + resultado"
              @click="previewView = 'split'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <rect x="3" y="4" width="8" height="16" rx="1.5" />
                <rect x="13" y="4" width="8" height="16" rx="1.5" />
              </svg>
            </button>
          </div>

          <ImageCropper
            v-if="showCropper && imageDataUrl"
            :image-data-url="imageDataUrl"
            @crop="onCropApply"
            @cancel="onCropCancel"
          />

          <SvgPreviewPane
            v-if="previewView === 'split' && !showCropper"
            :image-data-url="imageDataUrl"
            :svg-string="svgString"
            :is-processing="isProcessing"
            :image-aspect="imageAspect"
            @svg-click="() => {}"
            @clean="onClean"
            @crop="showCropper = !showCropper"
          />
          <div v-else-if="previewView === 'single' && !showCropper" class="rasterlab__singlePreviewWrap">
            <div class="rasterlab__singlePreview" :style="singlePreviewBoxStyle">
              <div v-if="svgString" v-html="svgString" class="rasterlab__singleSvg" :style="{ transform: `scale(${singleZoom})`, transformOrigin: 'center', opacity: isProcessing ? 0.5 : 1 }"></div>
              <span v-else class="preview__placeholder">Sin SVG — carga una imagen y elige un filtro</span>
            </div>
            <div class="rasterlab__zoombar">
              <button class="preview__zoomBtn" @click="singleZoom = Math.max(0.2, singleZoom - 0.2)">−</button>
              <span class="preview__zoomLabel">{{ Math.round(singleZoom * 100) }}%</span>
              <button class="preview__zoomBtn" @click="singleZoom = Math.min(5, singleZoom + 0.2)">+</button>
              <button class="preview__zoomBtn" @click="singleZoom = 1">Reset</button>
              <div v-if="svgString || imageDataUrl" class="rasterlab__actionBtns">
                <button v-if="imageDataUrl" class="rasterlab__actionBtn" title="Recortar imagen" @click="showCropper = !showCropper" :style="{ borderColor: showCropper ? '#7aa2f7' : undefined, color: showCropper ? '#7aa2f7' : undefined }">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                  </svg>
                </button>
                <button v-if="svgString" class="rasterlab__actionBtn" @click="onClean">Limpiar SVG</button>
              </div>
            </div>
          </div>

          <div class="rasterlab__optionsRow">
            <label class="rasterlab__check">
              <input type="checkbox" :checked="mono" @change="mono = ($event.target as HTMLInputElement).checked" /> Monocromo
            </label>
            <label class="rasterlab__check">
              <input type="checkbox" :checked="removeBackground" @change="removeBackground = ($event.target as HTMLInputElement).checked" /> Eliminar fondo
            </label>
            <label class="rasterlab__check">
              <input type="checkbox" :checked="params.invert" @change="onParamUpdate({ invert: !params.invert })" /> Invertir
            </label>
            <label class="rasterlab__check">
              <input type="checkbox" :checked="frameEnabled" @change="onFrameToggle(($event.target as HTMLInputElement).checked)" /> Añadir Marco
            </label>
            <label class="rasterlab__check" title="Si está activo, imágenes grandes (>800px) se redimensionan a 640px para trazar rápido (<2s). Desactívalo para máxima calidad (1024px, más lento).">
              <input type="checkbox" :checked="highQuality" @change="highQuality = ($event.target as HTMLInputElement).checked" /> Alta calidad (lento)
            </label>
          </div>

          <div v-if="frameEnabled" class="rasterlab__frameControls">
            <label class="params__field">Grosor <input type="range" :value="frameWidth" min="0.5" max="10" step="0.5" @input="onFrameWidthChange(Number(($event.target as HTMLInputElement).value))" /> <span>{{ frameWidth }}</span></label>
            <label class="params__field">Padding <input type="range" :value="framePadding" min="0" max="10" step="0.5" @input="onFramePaddingChange(Number(($event.target as HTMLInputElement).value))" /> <span>{{ framePadding }}</span></label>
            <label class="params__field">Color <input type="color" :value="frameColor" @input="onFrameColorChange(($event.target as HTMLInputElement).value)" style="width: 2rem; height: 1.6rem; border: 1px solid #2a2b3d; border-radius: 4px; background: transparent;" /></label>
          </div>

          <FilterBar
            :preset="preset"
            :mode="mode"
            @update:preset="(v) => (preset = v)"
            @update:mode="(v) => (mode = v)"
          />

          <ParamPanel
            v-if="mode === 'custom'"
            :params="params"
            @update:params="onParamUpdate"
          />

          <div class="rasterlab__actions">
            <button class="button" :disabled="!svgString" @click="onDownload">Descargar SVG</button>
            <button class="button button--primary" :disabled="!svgString" @click="onSendToDesigner">Mandar al Diseñador</button>
          </div>
        </template>

        <!-- Vista LIMPIEZA: solo SVG puro + herramientas -->
        <template v-else>
          <div class="rasterlab__cleanHead">
            <button class="button button--small" @click="showClean = false">← Regresar</button>
          </div>

          <CleanToolbar
            :tool="tool"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :selected-color="selectedColor"
            :brush-size="brushSize"
            @update:tool="(v) => (tool = v)"
            @undo="onUndo"
            @redo="onRedo"
            @update:selectedColor="(v) => (selectedColor = v)"
            @update:brushSize="(v) => (brushSize = v)"
            @clear="() => { const resetSvg = cleanEngine.reset(); cleanSvg = resetSvg; svgString = resetSvg; updateCanUndoRedo() }"
          />

          <div class="rasterlab__cleanCanvas" :style="cleanPreviewBoxStyle" @click="tool !== 'brush' ? onCleanCanvasClick($event) : undefined">
            <div v-if="cleanSvg" v-html="cleanSvg" class="rasterlab__cleanSvg" :style="{ transform: `scale(${cleanZoom})` }"></div>
            <span v-else class="preview__placeholder">Sin SVG</span>
            <BrushCanvas
              v-if="tool === 'brush'"
              :color="selectedColor"
              :stroke-width="brushSize"
              :zoom="cleanZoom"
              @stroke-complete="onBrushStroke"
            />
          </div>
          <div class="rasterlab__zoombar">
            <button class="preview__zoomBtn" @click="cleanZoom = Math.max(0.2, cleanZoom - 0.2)">−</button>
            <span class="preview__zoomLabel">{{ Math.round(cleanZoom * 100) }}%</span>
            <button class="preview__zoomBtn" @click="cleanZoom = Math.min(5, cleanZoom + 0.2)">+</button>
            <button class="preview__zoomBtn" @click="cleanZoom = 1">Reset</button>
          </div>

          <div class="rasterlab__actions">
            <button class="button" :disabled="!cleanSvg" @click="onDownload">Descargar SVG</button>
            <button class="button button--primary" :disabled="!cleanSvg" @click="onSendToDesigner">Mandar al Diseñador</button>
          </div>
        </template>

        <p v-if="status" class="rasterlab__status">{{ status }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rasterlab {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  padding: 1rem;
}
.rasterlab__panel {
  width: min(1200px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
}
.rasterlab__body { display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem; overflow-y: auto; }
.rasterlab__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--border-color);
}
.rasterlab__title { margin: 0; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; }
.rasterlab__close { border: none; background: transparent; color: var(--text-secondary); font-size: 1.4rem; cursor: pointer; }
.rasterlab__body { display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem; }
.rasterlab__viewToggle { display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end; }
.rasterlab__viewLabel { font-size: 0.7rem; color: var(--text-secondary); }
.rasterlab__viewBtn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; }
.rasterlab__viewBtn--active { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); }
.rasterlab__singlePreviewWrap { display: flex; flex-direction: column; gap: 0.4rem; }
.rasterlab__singlePreview { min-height: 340px; height: clamp(360px, 52vh, 560px); max-height: 62vh; overflow: auto; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-preview); display: flex; align-items: center; justify-content: center; padding: 0.8rem; position: relative; }
.rasterlab__singleSvg { width: 100%; max-width: 520px; max-height: 520px; display: flex; align-items: center; justify-content: center; }
.rasterlab__singleSvg :deep(svg) { width: 100%; height: auto; max-height: 520px; max-width: 100%; }
.rasterlab__cleanHead { display: flex; justify-content: flex-start; align-items: center; gap: 0.5rem; }
.rasterlab__subtitle { margin: 0; font-size: 0.8rem; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.06em; }
.rasterlab__cleanCanvas { min-height: 380px; height: clamp(400px, 58vh, 620px); max-height: 68vh; overflow: auto; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-preview); display: flex; align-items: center; justify-content: center; padding: 0.8rem; position: relative; }
.rasterlab__cleanSvg { width: 100%; max-width: 560px; max-height: 560px; transform-origin: center; transition: transform 0.15s; display: flex; align-items: center; justify-content: center; }
.rasterlab__cleanSvg :deep(svg) { width: 100%; height: auto; max-height: 560px; max-width: 100%; }
.rasterlab__cleanSvg :deep([id^="seg-"]) { cursor: pointer; }
.rasterlab__cleanSvg :deep([id^="seg-"]:hover) { outline: 1px dashed var(--accent-primary); outline-offset: 2px; }
.rasterlab__zoombar { display: flex; gap: 0.3rem; align-items: center; justify-content: center; position: relative; }
.preview__zoomBtn { padding: 0.2rem 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer; font-size: 0.75rem; }
.preview__zoomLabel { font-size: 0.7rem; color: var(--text-secondary); min-width: 3rem; text-align: center; }
.preview__placeholder { font-size: 0.75rem; color: var(--text-secondary); }
.rasterlab__actionBtns { position: absolute; right: 0; display: flex; gap: 0.3rem; }
.rasterlab__actionBtn { padding: 0.2rem 0.6rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.rasterlab__actionBtn:hover { background: var(--border-color); }
.params__field { display: flex; gap: 0.4rem; align-items: center; font-size: 0.75rem; color: var(--text-primary); }
.params__field input[type="range"] { flex: 1; }
.rasterlab__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
.rasterlab__status { margin: 0; font-size: 0.75rem; color: var(--accent-primary); }
.rasterlab__hint { margin: 0; font-size: 0.7rem; color: var(--text-secondary); line-height: 1.4; }
.rasterlab__optionsRow { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.rasterlab__check { display: flex; gap: 0.3rem; align-items: center; font-size: 0.75rem; color: var(--text-primary); cursor: pointer; }
.rasterlab__frameControls { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.button {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
}
.button--primary { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); font-weight: 600; }
.button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
