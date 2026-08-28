<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ imageDataUrl: string | null; svgString: string | null; isProcessing?: boolean; imageAspect?: number | null }>()
const emit = defineEmits<{ 'svg-click': [segmentId: string]; clean: []; crop: [] }>()

const zoom = ref(1)

// Altura dinámica basada en la imagen cargada, con límite estético
const boxStyle = computed(() => {
  if (props.imageAspect && props.imageAspect > 0) {
    // Para imágenes verticales (aspect <1), usar más alto; para horizontales, más bajo
    // aspect = width/height, vertical ~0.5-0.7, horizontal ~1.5
    const isVertical = props.imageAspect < 0.9
    if (isVertical) {
      return { height: 'clamp(380px, 62vh, 640px)', minHeight: '380px', maxHeight: '640px' }
    }
    return { height: 'clamp(320px, 42vh, 520px)', minHeight: '320px', maxHeight: '520px' }
  }
  return {}
})

function onSvgClick(e: MouseEvent) {
  const target = e.target as Element
  const closest = target.closest('[id^="seg-"]')
  if (closest?.id) emit('svg-click', closest.id)
}
</script>

<template>
  <div class="preview">
    <div class="preview__col">
      <h4 class="preview__title">Imagen original</h4>
      <div class="preview__box preview__box--scroll" :style="boxStyle">
        <img v-if="imageDataUrl" :src="imageDataUrl" class="preview__img" :style="{ transform: `scale(${zoom})` }" />
        <span v-else class="preview__placeholder">Sin imagen</span>
      </div>
    </div>
    <div class="preview__col">
      <h4 class="preview__title">SVG salida <span v-if="isProcessing" class="preview__loading">· procesando…</span></h4>
      <div class="preview__box preview__box--scroll preview__box--svg" :style="boxStyle" @click="onSvgClick">
        <div v-if="svgString" v-html="svgString" class="preview__svg" :style="{ transform: `scale(${zoom})` }"></div>
        <span v-else class="preview__placeholder">Sin SVG</span>
      </div>
    </div>
    <div class="preview__zoombar">
      <button class="preview__zoomBtn" @click="zoom = Math.max(0.2, zoom - 0.2)">−</button>
      <span class="preview__zoomLabel">{{ Math.round(zoom * 100) }}%</span>
      <button class="preview__zoomBtn" @click="zoom = Math.min(5, zoom + 0.2)">+</button>
      <button class="preview__zoomBtn" @click="zoom = 1">Reset</button>
      <div v-if="svgString || imageDataUrl" class="preview__actionBtns">
        <button v-if="imageDataUrl" class="preview__actionBtn" title="Recortar imagen" @click="emit('crop')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
        </button>
        <button v-if="svgString" class="preview__actionBtn" @click="emit('clean')">Limpiar SVG</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; position: relative; }
.preview__col { display: flex; flex-direction: column; gap: 0.4rem; }
.preview__title { margin: 0; font-size: 0.75rem; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.06em; }
.preview__loading { color: var(--text-secondary); text-transform: none; }
.preview__box { min-height: 320px; height: clamp(340px, 42vh, 520px); max-height: 58vh; overflow: auto; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-preview); display: flex; align-items: center; justify-content: center; padding: 0.6rem; }
.preview__box--scroll { scrollbar-width: thin; }
.preview__img, .preview__svg { max-width: 100%; max-height: 440px; width: auto; height: auto; transform-origin: center; transition: transform 0.15s; }
.preview__img { object-fit: contain; max-height: 440px; }
.preview__placeholder { font-size: 0.75rem; color: var(--text-secondary); }
.preview__svg :deep(svg) { width: 100%; height: auto; max-height: 440px; }
.preview__svg :deep([id^="seg-"]:hover) { outline: 1px dashed var(--accent-primary); cursor: pointer; }
.preview__zoombar { grid-column: 1 / -1; display: flex; gap: 0.3rem; align-items: center; justify-content: center; margin-top: 0.2rem; position: relative; }
.preview__zoomBtn { padding: 0.2rem 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer; font-size: 0.75rem; }
.preview__zoomLabel { font-size: 0.7rem; color: var(--text-secondary); min-width: 3rem; text-align: center; }
.preview__actionBtns { position: absolute; right: 0; display: flex; gap: 0.3rem; }
.preview__actionBtn { padding: 0.2rem 0.6rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.preview__actionBtn:hover { background: var(--border-color); }
</style>
