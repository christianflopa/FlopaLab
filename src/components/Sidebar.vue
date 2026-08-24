<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { parseSvgToRegions } from '../engine/svg/parseSvg'
import { setParsedSvg } from '../engine/svg/svgCache'
import NumberField from './ui/NumberField.vue'
import CheckboxField from './ui/CheckboxField.vue'
import ColorField from './ui/ColorField.vue'

const emit = defineEmits<{ 'export-3mf': []; 'export-stl': [] }>()

const store = useProjectStore()

const fileInput = ref<HTMLInputElement | null>(null)

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

const rotationPresets = [0, 90, 180, 270]

const summaryColors = computed(() => store.uniqueAssignedColors)
</script>

<template>
  <aside class="sidebar">
    <h1 class="sidebar__title">FlopaLab</h1>
    <p class="sidebar__hint">
      Separador de libros 3D · {{ store.base.width }} × {{ store.base.height }} ×
      {{ store.base.thickness }} mm
    </p>

    <section class="sidebar__section">
      <h2 class="sidebar__subtitle">1 · Objeto base</h2>

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
        :model-value="store.base.cornerRadius"
        @update:model-value="(v) => patchBase({ cornerRadius: v })"
      />

      <ColorField
        label="Color base"
        :model-value="store.base.color"
        @update:model-value="(v) => patchBase({ color: v })"
      />

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
    </section>

    <section class="sidebar__section">
      <h2 class="sidebar__subtitle">2 · Diseños</h2>

      <button class="button button--primary" @click="openFilePicker">+ Agregar SVG</button>
      <input
        ref="fileInput"
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        class="sidebar__file-input"
        @change="onFilesSelected"
      />

      <ul v-if="store.designs.length" class="design-list">
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

      <p v-if="!store.designs.length" class="sidebar__hint">
        Cargá un SVG para convertirlo en geometría 3D sobre el separador.
      </p>

      <template v-if="selected">
        <div class="subblock">
          <h3 class="sidebar__subtitle">Transformación</h3>

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
            :min="5"
            :max="2000"
            :model-value="scalePercent(selected.scaleX)"
            @update:model-value="(v) => onScaleInput('x', v)"
          />
          <NumberField
            label="Escala Y"
            unit="%"
            :step="5"
            :min="5"
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

          <button class="button" @click="store.resetDesignTransform()">
            Restablecer transformación
          </button>
        </div>

        <div class="subblock">
          <h3 class="sidebar__subtitle">Profundidad</h3>

          <NumberField
            label="Profundidad del diseño"
            unit="mm"
            :step="0.05"
            :min="0.1"
            :max="store.base.thickness"
            :disabled="store.extendsToSurface(selected)"
            :model-value="selected.depth"
            @update:model-value="onDepthInput"
          />

          <CheckboxField
            label="Extender hasta la superficie"
            :model-value="store.extendsToSurface(selected)"
            :disabled="true"
          />
          <CheckboxField
            label="Incrustar en la pieza"
            :model-value="!store.extendsToSurface(selected)"
            :disabled="true"
          />

          <p class="sidebar__hint">
            Máximo {{ store.base.thickness }} mm (grosor de la pieza). Al ras por la cara frontal;
            el resto del espesor sigue siendo material base.
          </p>
        </div>
      </template>
    </section>

    <section class="sidebar__section">
      <h2 class="sidebar__subtitle">3 · Capas / colores</h2>

      <p v-if="!selected" class="sidebar__hint">Seleccioná un diseño para ver sus colores.</p>

      <template v-else>
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
      </template>
    </section>

    <section class="sidebar__section sidebar__section--actions">
      <h2 class="sidebar__subtitle">4 · Exportar</h2>

      <div class="summary">
        <p class="summary__row">
          Objeto: {{ store.base.width }} × {{ store.base.height }} ×
          {{ store.base.thickness }} mm
        </p>
        <p class="summary__row">Diseños: {{ store.designs.length }}</p>
        <p class="summary__row">
          Profundidad:
          {{
            selected
              ? `${selected.depth} mm (${selected.name})`
              : '—'
          }}
        </p>
        <div class="summary__colors">
          <span
            v-for="color in summaryColors"
            :key="color"
            class="summary__chip"
            :style="{ background: color }"
            :title="color"
          ></span>
          <span v-if="!summaryColors.length" class="sidebar__hint">Sin diseños</span>
        </div>
      </div>

      <button
        class="button button--primary"
        :disabled="!store.designs.length"
        @click="emit('export-3mf')"
      >
        Exportar 3MF
      </button>
      <button
        class="button"
        :disabled="!store.designs.length"
        @click="emit('export-stl')"
      >
        Exportar STL (una pieza por color)
      </button>

      <p
        v-if="store.statusMessage"
        class="status"
        :class="`status--${store.statusKind}`"
      >
        {{ store.statusMessage }}
      </p>
    </section>
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
  background: #16161e;
  border-right: 1px solid #2a2b3d;
}

.sidebar__title {
  margin: 0;
  font-size: 1.15rem;
  color: #c0caf5;
}

.sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid #2a2b3d;
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
  color: #7aa2f7;
}

.sidebar__hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: #565f89;
}

.sidebar__file-input {
  display: none;
}

.subblock {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem;
  border: 1px solid #2a2b3d;
  border-radius: 6px;
  background: #191a24;
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
  border: 1px solid #2a2b3d;
  border-radius: 5px;
  background: #1f2335;
}

.design-list__item--selected {
  border-color: #7aa2f7;
}

.design-list__visibility,
.design-list__remove {
  padding: 0.1rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #565f89;
  cursor: pointer;
  font-size: 0.85rem;
}

.design-list__visibility:hover,
.design-list__remove:hover {
  color: #c0caf5;
  background: #292e42;
}

.design-list__name {
  overflow: hidden;
  border: none;
  background: transparent;
  color: #c0caf5;
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
  border: 1px solid #2a2b3d;
  border-radius: 4px;
}

.color-mapping__original {
  font-size: 0.72rem;
  color: #565f89;
  font-variant-numeric: tabular-nums;
}

.color-mapping__arrow {
  color: #565f89;
  font-size: 0.75rem;
}

.color-mapping__picker {
  justify-self: end;
  width: 2.5rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid #2a2b3d;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid #2a2b3d;
  border-radius: 6px;
  background: #191a24;
}

.summary__row {
  margin: 0;
  font-size: 0.75rem;
  color: #c0caf5;
}

.summary__colors {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.summary__chip {
  width: 1rem;
  height: 1rem;
  border: 1px solid #2a2b3d;
  border-radius: 4px;
}

.status {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  font-size: 0.73rem;
  line-height: 1.4;
}

.status--info {
  border: 1px solid #7aa2f7;
  background: rgba(122, 162, 247, 0.08);
  color: #7aa2f7;
}

.status--error {
  border: 1px solid #f7768e;
  background: rgba(247, 118, 142, 0.08);
  color: #f7768e;
}

.status--success {
  border: 1px solid #9ece6a;
  background: rgba(158, 206, 106, 0.08);
  color: #9ece6a;
}

.button {
  padding: 0.55rem 0.9rem;
  border: 1px solid #2a2b3d;
  border-radius: 6px;
  background: #1f2335;
  color: #c0caf5;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.button:hover:not(:disabled) {
  background: #2a2b3d;
}

.button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.button--primary {
  background: #7aa2f7;
  border-color: #7aa2f7;
  color: #16161e;
  font-weight: 600;
}

.button--primary:hover:not(:disabled) {
  background: #89b4f8;
}

.button--small {
  padding: 0.3rem 0.5rem;
  font-size: 0.72rem;
}

.button--active {
  border-color: #7aa2f7;
  color: #7aa2f7;
}
</style>
