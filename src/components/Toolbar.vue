<script setup lang="ts">
import { useProjectStore } from '../stores/project'
import { useUiStore } from '../stores/ui'

const store = useProjectStore()
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
    <div class="toolbar__header-mobile">
      <button class="toolbar__menu-btn" @click="uiStore.toggleMobileSidebar()" aria-label="Abrir menú">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <h1 class="toolbar__title-mobile">FlopaLab</h1>
    </div>

    <div class="toolbar__section">
      <span class="toolbar__section-label">Diseño</span>
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
          <span class="toolbar__button-text">{{ mode.label }}</span>
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
          <span class="toolbar__button-text">Agujero</span>
        </button>
      </div>
    </div>

    <div class="toolbar__section">
      <span class="toolbar__section-label">Visualización</span>
      <div class="toolbar__group">
        <button
          v-for="view in views"
          :key="view.value"
          class="toolbar__button"
          @click="store.requestView(view.value)"
        >
          <svg v-if="view.value === 'face'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
          <svg v-else-if="view.value === 'profile'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12h20M12 2v20"></path>
          </svg>
          <svg v-else-if="view.value === 'reset'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
          <span class="toolbar__button-text">{{ view.label }}</span>
        </button>
        <button
          class="toolbar__button"
          :class="{ 'toolbar__button--accent': store.previewMode }"
          @click="store.togglePreview()"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span class="toolbar__button-text">Vista previa</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  background: rgba(22, 22, 30, 0.85);
  border-bottom: 1px solid var(--border-color);
}

.toolbar__section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar__section-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
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

.toolbar__header-mobile {
  display: none;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.toolbar__title-mobile {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
  font-weight: 600;
  flex: 1;
  text-align: center;
}

@media (max-width: 768px) {
  .toolbar__menu-btn {
    display: flex;
  }

  .toolbar__header-mobile {
    display: flex;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 0.4rem;
    gap: 0.4rem;
  }

  .toolbar__section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    width: 100%;
  }

  .toolbar__section-label {
    font-size: 0.65rem;
    text-align: left;
  }

  .toolbar__group {
    gap: 0.25rem;
    width: 100%;
    flex-wrap: wrap;
  }

  .toolbar__button {
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
  }
}
</style>
