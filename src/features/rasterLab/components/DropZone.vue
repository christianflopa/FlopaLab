<script setup lang="ts">
const emit = defineEmits<{ 'file-selected': [file: File] }>()
const props = defineProps<{ disabled?: boolean }>()

function onDrop(e: DragEvent) {
  if (props.disabled) return
  const file = e.dataTransfer?.files?.[0]
  if (file && /image\/(png|jpeg|jpg|webp)/.test(file.type)) emit('file-selected', file)
}
function onInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('file-selected', file)
}
</script>

<template>
  <label
    class="dropzone"
    :class="{ 'dropzone--disabled': disabled }"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" class="dropzone__input" :disabled="disabled" @change="onInput" />
    <span class="dropzone__icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </span>
    <span class="dropzone__text">Arrastra la imagen o haz click para seleccionar</span>
    <span class="dropzone__hint">Formatos soportados: PNG, JPG, JPEG, WEBP</span>
  </label>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 1.2rem;
  border: 1.5px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: border-color 0.15s;
}
.dropzone:hover { border-color: var(--accent-primary); }
.dropzone--disabled { opacity: 0.5; pointer-events: none; }
.dropzone__input { display: none; }
.dropzone__icon { font-size: 1.6rem; }
.dropzone__text { font-size: 0.85rem; color: var(--text-primary); }
.dropzone__hint { font-size: 0.7rem; color: var(--text-secondary); }
</style>
