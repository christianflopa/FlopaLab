<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ imageDataUrl: string | null }>()
const emit = defineEmits<{ 'crop': [{ x: number; y: number; width: number; height: number }], 'cancel': [] }>()

const keepAspect = ref(true)
const crop = ref({ x: 0, y: 0, width: 100, height: 100 }) // en % de la imagen, por defecto total

const imgRef = ref<HTMLImageElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)

// Estado de arrastre
let dragging: null | { handle: string; startX: number; startY: number; startCrop: typeof crop.value } = null
let imgRect: DOMRect | null = null

function getImgRect(): DOMRect | null {
  if (imgRef.value) return imgRef.value.getBoundingClientRect()
  if (wrapRef.value) return wrapRef.value.getBoundingClientRect()
  return null
}

function onHandleDown(e: MouseEvent, handle: string) {
  e.preventDefault()
  e.stopPropagation()
  imgRect = getImgRect()
  if (!imgRect) return
  dragging = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop.value } }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onOverlayDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.cropper__handle')) return
  imgRect = getImgRect()
  if (!imgRect) return
  dragging = { handle: 'move', startX: e.clientX, startY: e.clientY, startCrop: { ...crop.value } }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!dragging || !imgRect) return
  const dxPct = ((e.clientX - dragging.startX) / imgRect.width) * 100
  const dyPct = ((e.clientY - dragging.startY) / imgRect.height) * 100
  const start = dragging.startCrop
  let { x, y, width, height } = start

  const minSize = 5

  switch (dragging.handle) {
    case 'move':
      x = Math.max(0, Math.min(100 - width, start.x + dxPct))
      y = Math.max(0, Math.min(100 - height, start.y + dyPct))
      break
    case 'nw':
      x = Math.max(0, Math.min(start.x + start.width - minSize, start.x + dxPct))
      y = Math.max(0, Math.min(start.y + start.height - minSize, start.y + dyPct))
      width = start.width - (x - start.x)
      height = start.height - (y - start.y)
      break
    case 'ne':
      y = Math.max(0, Math.min(start.y + start.height - minSize, start.y + dyPct))
      width = Math.max(minSize, Math.min(100 - start.x, start.width + dxPct))
      height = start.height - (y - start.y)
      x = start.x
      break
    case 'sw':
      x = Math.max(0, Math.min(start.x + start.width - minSize, start.x + dxPct))
      width = start.width - (x - start.x)
      height = Math.max(minSize, Math.min(100 - start.y, start.height + dyPct))
      y = start.y
      break
    case 'se':
      width = Math.max(minSize, Math.min(100 - start.x, start.width + dxPct))
      height = Math.max(minSize, Math.min(100 - start.y, start.height + dyPct))
      break
    case 'n':
      y = Math.max(0, Math.min(start.y + start.height - minSize, start.y + dyPct))
      height = start.height - (y - start.y)
      break
    case 's':
      height = Math.max(minSize, Math.min(100 - start.y, start.height + dyPct))
      break
    case 'w':
      x = Math.max(0, Math.min(start.x + start.width - minSize, start.x + dxPct))
      width = start.width - (x - start.x)
      break
    case 'e':
      width = Math.max(minSize, Math.min(100 - start.x, start.width + dxPct))
      break
  }

  if (keepAspect.value) {
    const ratio = start.width / start.height || 1
    if (['nw', 'ne', 'sw', 'se'].includes(dragging.handle)) {
      const dw = Math.abs(width - start.width)
      const dh = Math.abs(height - start.height)
      if (dw > dh) {
        height = width / ratio
        if (dragging.handle === 'nw' || dragging.handle === 'ne') {
          y = start.y + start.height - height
        }
      } else {
        width = height * ratio
        if (dragging.handle === 'nw' || dragging.handle === 'sw') {
          x = start.x + start.width - width
        }
      }
    } else if (['n', 's'].includes(dragging.handle)) {
      width = height * ratio
      x = start.x + (start.width - width) / 2
      x = Math.max(0, Math.min(100 - width, x))
    } else if (['e', 'w'].includes(dragging.handle)) {
      height = width / ratio
      y = start.y + (start.height - height) / 2
      y = Math.max(0, Math.min(100 - height, y))
    }
    width = Math.max(minSize, Math.min(width, 100 - x))
    height = Math.max(minSize, Math.min(height, 100 - y))
    x = Math.max(0, Math.min(100 - width, x))
    y = Math.max(0, Math.min(100 - height, y))
  }

  crop.value = { x, y, width, height }
}

function onMouseUp() {
  dragging = null
  imgRect = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})

function onConfirm() {
  emit('crop', { ...crop.value })
}

watch(
  () => props.imageDataUrl,
  () => {
    crop.value = { x: 0, y: 0, width: 100, height: 100 }
  },
)
</script>

<template>
  <div class="cropper">
    <div class="cropper__header">
      <span class="cropper__title">Recortar imagen</span>
      <label class="cropper__check">
        <input type="checkbox" :checked="keepAspect" @change="keepAspect = ($event.target as HTMLInputElement).checked" />
        Mantener proporción
      </label>
    </div>

    <div class="cropper__canvasWrap">
      <div ref="wrapRef" class="cropper__imgWrap">
        <img
          v-if="imageDataUrl"
          ref="imgRef"
          :src="imageDataUrl"
          class="cropper__img"
          draggable="false"
          @load="crop = { x: 0, y: 0, width: 100, height: 100 }"
        />
        <div
          v-if="imageDataUrl"
          class="cropper__overlay"
          :style="{
            left: crop.x + '%',
            top: crop.y + '%',
            width: crop.width + '%',
            height: crop.height + '%'
          }"
          @mousedown.stop="onOverlayDown"
        >
          <div class="cropper__handle cropper__handle--nw" @mousedown.stop.prevent="onHandleDown($event, 'nw')"></div>
          <div class="cropper__handle cropper__handle--n" @mousedown.stop.prevent="onHandleDown($event, 'n')"></div>
          <div class="cropper__handle cropper__handle--ne" @mousedown.stop.prevent="onHandleDown($event, 'ne')"></div>
          <div class="cropper__handle cropper__handle--e" @mousedown.stop.prevent="onHandleDown($event, 'e')"></div>
          <div class="cropper__handle cropper__handle--se" @mousedown.stop.prevent="onHandleDown($event, 'se')"></div>
          <div class="cropper__handle cropper__handle--s" @mousedown.stop.prevent="onHandleDown($event, 's')"></div>
          <div class="cropper__handle cropper__handle--sw" @mousedown.stop.prevent="onHandleDown($event, 'sw')"></div>
          <div class="cropper__handle cropper__handle--w" @mousedown.stop.prevent="onHandleDown($event, 'w')"></div>
          <div class="cropper__grid cropper__grid--v1"></div>
          <div class="cropper__grid cropper__grid--v2"></div>
          <div class="cropper__grid cropper__grid--h1"></div>
          <div class="cropper__grid cropper__grid--h2"></div>
        </div>
      </div>
      <!-- Sombras fuera de la imagen, ahora relativas al wrap de la imagen -->
      <div v-if="imageDataUrl" class="cropper__shade cropper__shade--top" :style="{ height: crop.y + '%' }" style="left:0; top:0; width:100%"></div>
    </div>

    <div class="cropper__actions">
      <button class="button" @click="emit('cancel')">Cancelar</button>
      <button class="button button--primary" @click="onConfirm">Aplicar recorte</button>
    </div>
    <p class="cropper__hint">Arrastra vértices o aristas. Por defecto es el tamaño total de la imagen.</p>
  </div>
</template>

<style scoped>
.cropper { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.cropper__header { display: flex; justify-content: space-between; align-items: center; }
.cropper__title { font-size: 0.8rem; color: var(--accent-primary); margin: 0; text-transform: uppercase; }
.cropper__check { font-size: 0.7rem; color: var(--text-primary); display: flex; gap: 0.3rem; align-items: center; }
.cropper__canvasWrap { position: relative; border: 1px solid var(--border-light); border-radius: 4px; overflow: hidden; background: #fff; min-height: 340px; height: clamp(380px, 52vh, 560px); max-height: 62vh; display: flex; align-items: center; justify-content: center; user-select: none; padding: 0.6rem; }
.cropper__imgWrap { position: relative; display: inline-flex; align-items: center; justify-content: center; max-width: 100%; max-height: 100%; line-height: 0; }
.cropper__img { max-width: 100%; max-height: 520px; width: auto; height: auto; object-fit: contain; display: block; pointer-events: none; }
.cropper__overlay { position: absolute; border: 2px solid var(--accent-primary); background: rgba(122,162,247,0.12); cursor: move; box-sizing: border-box; }
.cropper__handle { position: absolute; width: 10px; height: 10px; background: var(--accent-primary); border: 2px solid #fff; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
.cropper__handle--nw { left: -5px; top: -5px; cursor: nwse-resize; }
.cropper__handle--n { left: 50%; top: -5px; transform: translateX(-50%); cursor: ns-resize; }
.cropper__handle--ne { right: -5px; top: -5px; cursor: nesw-resize; }
.cropper__handle--e { right: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.cropper__handle--se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.cropper__handle--s { left: 50%; bottom: -5px; transform: translateX(-50%); cursor: ns-resize; }
.cropper__handle--sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.cropper__handle--w { left: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.cropper__grid { position: absolute; background: rgba(255,255,255,0.35); pointer-events: none; }
.cropper__grid--v1 { left: 33.33%; top: 0; width: 1px; height: 100%; }
.cropper__grid--v2 { left: 66.66%; top: 0; width: 1px; height: 100%; }
.cropper__grid--h1 { top: 33.33%; left: 0; height: 1px; width: 100%; }
.cropper__grid--h2 { top: 66.66%; left: 0; height: 1px; width: 100%; }
.cropper__shade { display: none; }
.cropper__actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
.cropper__hint { font-size: 0.65rem; color: var(--text-secondary); margin: 0; }
.button { padding: 0.4rem 0.7rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; cursor: pointer; }
.button--primary { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); }
</style>
