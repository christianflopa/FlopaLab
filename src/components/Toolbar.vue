<script setup lang="ts">
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

const modes = [
  { value: 'translate', label: 'Mover' },
  { value: 'rotate', label: 'Rotar' },
  { value: 'scale', label: 'Escalar' },
] as const

const views = [
  { value: 'face', label: 'Cara' },
  { value: 'profile', label: 'Perfil' },
  { value: 'reset', label: 'Reset' },
] as const
</script>

<template>
  <div class="toolbar">
    <div class="toolbar__group">
      <button
        v-for="mode in modes"
        :key="mode.value"
        class="toolbar__button"
        :class="{ 'toolbar__button--active': store.transformMode === mode.value }"
        :disabled="!store.selectedDesign || store.previewMode"
        @click="store.setTransformMode(mode.value)"
      >
        {{ mode.label }}
      </button>
    </div>

    <div class="toolbar__group">
      <button
        v-for="view in views"
        :key="view.value"
        class="toolbar__button"
        @click="store.requestView(view.value)"
      >
        {{ view.label }}
      </button>
      <button
        class="toolbar__button"
        :class="{ 'toolbar__button--accent': store.previewMode }"
        @click="store.togglePreview()"
      >
        Vista previa
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.5rem;
  background: rgba(22, 22, 30, 0.85);
  border-bottom: 1px solid #2a2b3d;
}

.toolbar__group {
  display: flex;
  gap: 0.35rem;
}

.toolbar__button {
  padding: 0.35rem 0.8rem;
  border: 1px solid #2a2b3d;
  border-radius: 5px;
  background: #1f2335;
  color: #c0caf5;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.toolbar__button:hover:not(:disabled) {
  background: #292e42;
}

.toolbar__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar__button--active {
  background: #7aa2f7;
  border-color: #7aa2f7;
  color: #16161e;
  font-weight: 600;
}

.toolbar__button--active:hover:not(:disabled) {
  background: #89b4f8;
}

.toolbar__button--accent {
  border-color: #bb9af7;
  color: #bb9af7;
}

.toolbar__button--accent:hover:not(:disabled) {
  background: rgba(187, 154, 247, 0.15);
}
</style>
