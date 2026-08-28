<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { useUiStore } from '../stores/ui'
import { useThemeStore } from '../stores/theme'
import { parseSvgToRegions } from '../engine/svg/parseSvg'
import { setParsedSvg } from '../engine/svg/svgCache'
import NumberField from './ui/NumberField.vue'
import CheckboxField from './ui/CheckboxField.vue'
import ColorField from './ui/ColorField.vue'

const props = defineProps<{ collapsed?: boolean; mobile?: boolean }>()
const emit = defineEmits<{ 'export-3mf': []; 'export-stl': []; 'open-rasterlab': []; close: [] }>()

const store = useProjectStore()
const uiStore = useUiStore()
const themeStore = useThemeStore()

const fileInput = ref<HTMLInputElement | null>(null)
const baseSvgInput = ref<HTMLInputElement | null>(null)
const exportFormat = ref<'3mf' | 'stl'>('3mf')
const showExportDropdown = ref(false)

const selected = computed(() => store.selectedDesign)

function patchBase(patch: Parameters<typeof store.updateBase>[0]) {
  store.updateBase(patch)
}

function patchHole(patch: Partial<typeof store.base.hole>) {
  store.updateBase({ hole: { ...store.base.hole, ...patch } })
}

function openFilePicker() {
  fileInput.value?.click()
}

function openBaseSvgPicker() {
  baseSvgInput.value?.click()
}

async function onBaseSvgSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !/\.svg$/i.test(file.name)) return
  try {
    const text = await file.text()
    const parsed = parseSvgToRegions(text)
    if (parsed.regions.length === 0) {
      store.setStatus(`${file.name}: no se encontraron formas rellenas compatibles.`, 'error')
      return
    }
    store.setBaseFromSvg(text, parsed)
  } catch {
    store.setStatus(`No se pudo leer ${file.name}.`, 'error')
  }
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])

  for (const file of files) {
    if (!/\.svg$/i.test(file.name)) continue
    try {
      const text = await file.text()
      const parsed = parseSvgToRegions(text)
      if (parsed.regions.length === 0) {
        store.setStatus(`${file.name}: no se encontraron formas rellenas compatibles.`, 'error')
        continue
      }
      const design = store.addDesign(file.name, parsed)
      setParsedSvg(design.id, parsed)
    } catch {
      store.setStatus(`No se pudo leer ${file.name}.`, 'error')
    }
  }

  input.value = ''
}

function scalePercent(value: number) {
  return Math.round(value * 1000) / 10
}

function onScaleInput(axis: 'x' | 'y', value: number) {
  store.setScale(axis, value / 100)
}

function onDepthInput(value: number) {
  store.setDepth(value)
}

function selectExportFormat(format: '3mf' | 'stl') {
  exportFormat.value = format
  showExportDropdown.value = false
}

function doExport() {
  if (exportFormat.value === '3mf') {
    emit('export-3mf')
  } else {
    emit('export-stl')
  }
}

const rotationPresets = [0, 90, 180, 270]
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed && !mobile, 'sidebar--mobile': mobile, 'sidebar--open': uiStore.sidebarOpen }">
    <div class="sidebar__header">
      <h1 v-if="!collapsed || mobile" class="sidebar__title">FlopaLab</h1>
      <div class="sidebar__header-actions">
        <button
          v-if="!collapsed || mobile"
          class="sidebar__theme-btn"
          @click="themeStore.toggleTheme()"
          :title="themeStore.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
          :aria-label="themeStore.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
        >
          <svg v-if="themeStore.theme === 'dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
        <button v-if="mobile" class="sidebar__close-btn" @click="emit('close')" aria-label="Cerrar menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button v-else-if="collapsed" class="sidebar__toggle-btn" @click="uiStore.toggleSidebar()" aria-label="Expandir menú" title="Expandir menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <button v-else class="sidebar__toggle-btn" @click="uiStore.toggleSidebar()" aria-label="Colapsar menú" title="Colapsar menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <template v-if="!collapsed || mobile">
    <section class="sidebar__section">
      <h2 class="sidebar__subtitle">OBJETO BASE</h2>

      <NumberField
        label="Ancho"
        unit="mm"
        :step="1"
        :min="10"
        :max="400"
        :model-value="store.base.width"
        @update:model-value="(v) => patchBase({ width: v })"
      />
      <NumberField
        label="Alto"
        unit="mm"
        :step="1"
        :min="20"
        :max="500"
        :model-value="store.base.height"
        @update:model-value="(v) => patchBase({ height: v })"
      />
      <NumberField
        label="Grosor"
        unit="mm"
        :step="0.1"
        :min="0.4"
        :max="10"
        :model-value="store.base.thickness"
        @update:model-value="(v) => patchBase({ thickness: v })"
      />
      <NumberField
        label="Radio de esquinas"
        unit="mm"
        :step="0.5"
        :min="0"
        :disabled="store.base.kind === 'svg'"
        :model-value="store.base.cornerRadius"
        @update:model-value="(v) => patchBase({ cornerRadius: v })"
      />

      <ColorField
        label="Color base"
        :model-value="store.base.color"
        @update:model-value="(v) => patchBase({ color: v })"
      />

      <CheckboxField
        v-if="store.base.kind === 'svg'"
        label="Silueta"
        :model-value="store.base.silhouette"
        @update:model-value="(v) => patchBase({ silhouette: v })"
      />
      <p v-if="store.base.kind === 'svg' && store.base.silhouette" class="sidebar__hint">
        Solo se usa la silueta perimetral del SVG. Todo lo interno se rellena.
      </p>

      <CheckboxField
        label="Agujero superior"
        :model-value="store.base.hole.enabled"
        @update:model-value="(v) => patchHole({ enabled: v })"
      />

      <template v-if="store.base.hole.enabled">
        <NumberField
          label="Diámetro del agujero"
          unit="mm"
          :step="0.5"
          :min="1"
          :model-value="store.base.hole.diameter"
          @update:model-value="(v) => patchHole({ diameter: v })"
        />
        <NumberField
          label="Distancia al borde superior"
          unit="mm"
          :step="0.5"
          :min="0.5"
          :model-value="store.base.hole.topOffset"
          @update:model-value="(v) => patchHole({ topOffset: v })"
        />
        <NumberField
          label="Posición X del agujero"
          unit="mm"
          :step="0.5"
          :model-value="store.base.hole.x"
          @update:model-value="(v) => patchHole({ x: v })"
        />
      </template>

      <div class="base-svg-row">
        <button class="button" @click="openBaseSvgPicker">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align: -2px; margin-right: 6px">
            <path d="M12 3v12" />
            <path d="M8 7l4-4 4 4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          SVG como objeto base
        </button>
        <button v-if="store.base.kind === 'svg'" class="button" @click="store.clearBaseSvg()">Rectángulo</button>
      </div>
      <input
        ref="baseSvgInput"
        type="file"
        accept=".svg,image/svg+xml"
        class="sidebar__file-input"
        @change="onBaseSvgSelected"
      />
      <p v-if="store.base.kind === 'svg'" class="sidebar__hint">
        Forma base SVG activa. El lado más largo se ajusta a 150 mm; ancho y alto mantienen proporción.
      </p>
    </section>

    <section class="sidebar__section">
      <h2 class="sidebar__subtitle">DISEÑOS</h2>

      <input
        ref="fileInput"
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        class="sidebar__file-input"
        @change="onFilesSelected"
      />

      <template v-if="store.designs.length">
        <ul class="design-list">
          <li
            v-for="design in store.designs"
            :key="design.id"
            class="design-list__item"
            :class="{ 'design-list__item--selected': design.id === store.selectedDesignId }"
          >
            <button
              class="design-list__visibility"
              :title="design.visible ? 'Ocultar' : 'Mostrar'"
              @click="store.toggleVisible(design.id)"
            >
              {{ design.visible ? '◉' : '◌' }}
            </button>
            <button class="design-list__name" @click="store.selectDesign(design.id)">
              {{ design.name }}
            </button>
            <button
              class="design-list__remove"
              title="Eliminar diseño"
              @click="store.removeDesign(design.id)"
            >
              ×
            </button>
          </li>
        </ul>
      </template>

      <template v-if="selected">
        <div class="subblock">
          <h3 class="sidebar__subtitle">CONFIGURACIÓN DISEÑO</h3>

          <NumberField
            label="Posición X"
            unit="mm"
            :step="0.5"
            :model-value="selected.position.x"
            @update:model-value="(v) => store.setPosition(v, selected!.position.y)"
          />
          <NumberField
            label="Posición Y"
            unit="mm"
            :step="0.5"
            :model-value="selected.position.y"
            @update:model-value="(v) => store.setPosition(selected!.position.x, v)"
          />

          <CheckboxField
            label="Escalado uniforme"
            :model-value="selected.uniformScale"
            @update:model-value="(v) => store.setUniformScale(v)"
          />
          <NumberField
            label="Escala X"
            unit="%"
            :step="5"
            :min="1"
            :max="2000"
            :model-value="scalePercent(selected.scaleX)"
            @update:model-value="(v) => onScaleInput('x', v)"
          />
          <NumberField
            label="Escala Y"
            unit="%"
            :step="5"
            :min="1"
            :max="2000"
            :disabled="selected.uniformScale"
            :model-value="scalePercent(selected.scaleY)"
            @update:model-value="(v) => onScaleInput('y', v)"
          />

          <NumberField
            label="Rotación"
            unit="°"
            :step="1"
            :model-value="selected.rotationDeg"
            @update:model-value="(v) => store.setRotation(v)"
          />

          <div class="rotation-row">
            <button class="button button--small" @click="store.rotateBy(90)">↶ 90°</button>
            <button class="button button--small" @click="store.rotateBy(-90)">↷ 90°</button>
            <button
              v-for="preset in rotationPresets"
              :key="preset"
              class="button button--small"
              :class="{ 'button--active': Math.round(selected.rotationDeg) === preset }"
              @click="store.setRotation(preset)"
            >
              {{ preset }}°
            </button>
          </div>

          <NumberField
            label="Profundidad"
            unit="mm"
            :step="0.05"
            :min="0.1"
            :max="store.base.thickness"
            :disabled="store.extendsToSurface(selected)"
            :model-value="selected.depth"
            @update:model-value="onDepthInput"
          />

          <div class="color-section">
            <div
              v-for="mapping in selected.colors"
              :key="mapping.originalColor"
              class="color-mapping"
            >
              <span
                class="color-mapping__swatch"
                :style="{ background: mapping.originalColor }"
                :title="mapping.originalColor"
              ></span>
              <span class="color-mapping__original">{{ mapping.originalColor }}</span>
              <span class="color-mapping__arrow">→</span>
              <input
                class="color-mapping__picker"
                type="color"
                :value="mapping.assignedColor"
                @input="
                  store.setColorMapping(
                    selected!.id,
                    mapping.originalColor,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>
          </div>

          <button class="button" @click="store.resetDesignConfig()">
            Restablecer configuración
          </button>
        </div>
      </template>

      <button class="button button--primary" @click="openFilePicker">+ Agregar SVG</button>
      <button class="button" @click="emit('open-rasterlab')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align: -2px; margin-right: 6px">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        Imagen → SVG
      </button>
    </section>

    <section class="sidebar__section sidebar__section--actions">
      <h2 class="sidebar__subtitle">EXPORTAR</h2>

      <div class="export-split-button">
        <button
          class="button button--primary export-split-button__action"
          :disabled="!store.designs.length"
          @click="doExport"
        >
          Exportar
        </button>
        <div class="export-split-button__dropdown">
          <button
            class="button export-split-button__trigger"
            :disabled="!store.designs.length"
            @click="showExportDropdown = !showExportDropdown"
          >
            <span>{{ exportFormat === '3mf' ? '3MF' : 'STL' }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div v-if="showExportDropdown" class="export-split-button__menu">
            <button
              class="export-split-button__option"
              :class="{ 'export-split-button__option--active': exportFormat === '3mf' }"
              @click="selectExportFormat('3mf')"
            >
              3MF
            </button>
            <button
              class="export-split-button__option"
              :class="{ 'export-split-button__option--active': exportFormat === 'stl' }"
              @click="selectExportFormat('stl')"
            >
              STL
            </button>
          </div>
        </div>
      </div>

      <p
        v-if="store.statusMessage"
        class="status"
        :class="`status--${store.statusKind}`"
      >
        {{ store.statusMessage }}
      </p>
    </section>
    </template>

    <template v-else>
      <div class="sidebar__icons">
        <button class="sidebar__icon-btn" title="Objeto base" aria-label="Objeto base">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
        </button>
        <button class="sidebar__icon-btn" title="Diseños" aria-label="Diseños">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </button>
        <button class="sidebar__icon-btn" title="Exportar" aria-label="Exportar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 300px;
  height: 100%;
  padding: 1.25rem;
  overflow-y: auto;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  transition: width 0.3s ease, padding 0.3s ease;
}

.sidebar__title {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary);
}

.sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar__section--actions {
  margin-top: auto;
  border-bottom: none;
}

.sidebar__subtitle {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-primary);
}

.sidebar__hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.sidebar__file-input {
  display: none;
}

.base-svg-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.base-svg-row .button { flex: 1; }

.subblock {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
}

.color-section {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
}

.design-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.design-list__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
}

.design-list__item--selected {
  border-color: var(--accent-primary);
}

.design-list__visibility,
.design-list__remove {
  padding: 0.1rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
}

.design-list__visibility:hover,
.design-list__remove:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.design-list__name {
  overflow: hidden;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.78rem;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  padding: 0;
}

.rotation-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.color-mapping {
  display: grid;
  grid-template-columns: 1.1rem auto auto minmax(0, 1fr);
  gap: 0.45rem;
  align-items: center;
}

.color-mapping__swatch {
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.color-mapping__original {
  font-size: 0.72rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.color-mapping__arrow {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.color-mapping__picker {
  justify-self: end;
  width: 2.5rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}

.status {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  font-size: 0.73rem;
  line-height: 1.4;
}

.status--info {
  border: 1px solid var(--accent-primary);
  background: rgba(122, 162, 247, 0.08);
  color: var(--accent-primary);
}

.status--error {
  border: 1px solid var(--accent-error);
  background: rgba(247, 118, 142, 0.08);
  color: var(--accent-error);
}

.status--success {
  border: 1px solid var(--accent-success);
  background: rgba(158, 206, 106, 0.08);
  color: var(--accent-success);
}

.button {
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.button:hover:not(:disabled) {
  background: var(--border-color);
}

.button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.button--primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-on-primary);
  font-weight: 600;
}

.button--primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}

.button--small {
  padding: 0.3rem 0.5rem;
  font-size: 0.72rem;
}

.button--active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.export-split-button {
  display: flex;
  gap: 0;
  width: 100%;
}

.export-split-button__dropdown {
  position: relative;
  flex-shrink: 0;
}

.export-split-button__trigger {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--accent-primary);
  border-left: none;
  border-radius: 0 6px 6px 0;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.export-split-button__trigger:hover:not(:disabled) {
  background: var(--border-color);
}

.export-split-button__trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.export-split-button__menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  left: 0;
  margin-bottom: 0.3rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.export-split-button__option {
  display: block;
  width: 100%;
  padding: 0.5rem 0.7rem;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.export-split-button__option:hover {
  background: var(--border-color);
}

.export-split-button__option--active {
  background: var(--accent-primary);
  color: var(--text-on-primary);
  font-weight: 600;
}

.export-split-button__action {
  flex: 1;
  border-radius: 6px 0 0 6px;
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 2rem;
}

.sidebar__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sidebar__theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease;
}

.sidebar__theme-btn:hover {
  background: var(--bg-hover);
}

.sidebar__close-btn,
.sidebar__toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease;
}

.sidebar__close-btn:hover,
.sidebar__toggle-btn:hover {
  background: var(--bg-hover);
}

.sidebar--collapsed {
  width: 60px;
  padding: 0.75rem;
  align-items: center;
}

.sidebar--collapsed .sidebar__header {
  justify-content: center;
}

.sidebar__icons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}

.sidebar__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.sidebar__icon-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.sidebar--mobile {
  position: fixed;
  top: 0;
  left: 0;
  width: 85%;
  max-width: 320px;
  height: 100vh;
  height: 100dvh;
  z-index: 1000;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
}

.sidebar--mobile.sidebar--open {
  transform: translateX(0);
}

@media (max-width: 768px) {
  .sidebar:not(.sidebar--mobile) {
    position: fixed;
    top: 0;
    left: 0;
    width: 85%;
    max-width: 320px;
    height: 100vh;
    height: 100dvh;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
  }

  .export-split-button {
    width: 100%;
  }

  .export-split-button__action {
    flex: 1;
    font-size: 0.75rem;
    padding: 0.45rem 0.6rem;
  }

  .export-split-button__trigger {
    font-size: 0.75rem;
    padding: 0.45rem 0.5rem;
  }
}
</style>
