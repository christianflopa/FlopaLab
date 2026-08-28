<script setup lang="ts">
import { useProjectStore } from '../stores/project'
import { useThemeStore } from '../stores/theme'
import { useUiStore } from '../stores/ui'

const store = useProjectStore()
const themeStore = useThemeStore()
const uiStore = useUiStore()

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
    <button class="toolbar__menu-btn" @click="uiStore.toggleMobileSidebar()" aria-label="Abrir menú">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>

    <div class="toolbar__group">
      <button
        v-for="mode in modes"
        :key="mode.value"
        class="toolbar__button"
        :class="{ 'toolbar__button--active': store.transformMode === mode.value }"
        :disabled="!store.selectedDesign || store.previewMode"
        @click="store.setTransformMode(mode.value)"
      >
        <svg v-if="mode.value === 'translate'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2v20M2 12h20M5 5l7 7 7-7M5 19l7-7 7 7" />
        </svg>
        <svg v-else-if="mode.value === 'rotate'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <svg v-else-if="mode.value === 'scale'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        {{ mode.label }}
      </button>
      <button
        class="toolbar__button"
        :class="{ 'toolbar__button--active': store.holeDragMode }"
        :disabled="!store.base.hole.enabled || store.previewMode"
        @click="store.setHoleDragMode(!store.holeDragMode)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        Mover agujero
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
      <button
        class="toolbar__button"
        @click="themeStore.toggleTheme()"
        :title="themeStore.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      >
        <svg v-if="themeStore.theme === 'dark'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
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
  border-bottom: 1px solid var(--border-color);
}

.toolbar__group {
  display: flex;
  gap: 0.35rem;
}

.toolbar__button {
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.toolbar__button svg {
  flex-shrink: 0;
}

.toolbar__button:hover:not(:disabled) {
  background: var(--bg-hover);
}

.toolbar__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar__button--active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-on-primary);
  font-weight: 600;
}

.toolbar__button--active:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}

.toolbar__button--accent {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
}

.toolbar__button--accent:hover:not(:disabled) {
  background: rgba(187, 154, 247, 0.15);
}

.toolbar__menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.toolbar__menu-btn:hover {
  background: var(--bg-hover);
}

@media (max-width: 768px) {
  .toolbar__menu-btn {
    display: flex;
  }
}
</style>
