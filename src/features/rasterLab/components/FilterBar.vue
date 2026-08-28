<script setup lang="ts">
import type { FilterPreset, FilterMode } from '../types'
import { PRESETS } from '../engine/presets'

defineProps<{ preset: FilterPreset; mode: FilterMode }>()
const emit = defineEmits<{
  'update:preset': [v: FilterPreset]
  'update:mode': [v: FilterMode]
}>()

const presets = Object.entries(PRESETS).map(([value, { label }]) => ({ value, label }))
</script>

<template>
  <div class="filterbar">
    <div class="filterbar__row">
      <button class="filterbar__tab" :class="{ 'filterbar__tab--active': mode === 'preset' }" @click="emit('update:mode', 'preset')">Filtros</button>
      <button class="filterbar__tab" :class="{ 'filterbar__tab--active': mode === 'custom' }" @click="emit('update:mode', 'custom')">Parámetros</button>
    </div>
    <div v-if="mode === 'preset'" class="filterbar__row">
      <label class="filterbar__label">Filtro</label>
      <select class="filterbar__select" :value="preset" @change="emit('update:preset', ($event.target as HTMLSelectElement).value as FilterPreset)">
        <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
        <option value="custom">Custom (parámetros)</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.filterbar { display: flex; flex-direction: column; gap: 0.5rem; }
.filterbar__row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.filterbar__label { font-size: 0.75rem; color: var(--text-secondary); }
.filterbar__select { padding: 0.3rem 0.5rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
.filterbar__tab { padding: 0.25rem 0.6rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; }
.filterbar__tab--active { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); font-weight: 600; }
</style>
