<script setup lang="ts">
import type { CleanTool } from '../types'
defineProps<{ tool: CleanTool; canUndo: boolean; canRedo: boolean; selectedColor: string }>()
const emit = defineEmits<{
  'update:tool': [v: CleanTool]
  'undo': []
  'redo': []
  'update:selectedColor': [v: string]
  'clear': []
}>()
</script>

<template>
  <div class="cleanbar">
    <div class="cleanbar__group">
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'select' }" @click="emit('update:tool', 'select')">Seleccionar</button>
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'delete' }" @click="emit('update:tool', 'delete')">Eliminar</button>
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'paint' }" @click="emit('update:tool', 'paint')">Pintar</button>
      <input v-if="tool === 'paint'" type="color" :value="selectedColor" class="cleanbar__color" @input="emit('update:selectedColor', ($event.target as HTMLInputElement).value)" />
    </div>
    <div class="cleanbar__group">
      <button class="cleanbar__btn" :disabled="!canUndo" @click="emit('undo')">↩ Undo</button>
      <button class="cleanbar__btn" :disabled="!canRedo" @click="emit('redo')">↪ Redo</button>
      <button class="cleanbar__btn cleanbar__btn--danger" @click="emit('clear')">Restaurar</button>
    </div>
  </div>
</template>

<style scoped>
.cleanbar { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.cleanbar__group { display: flex; gap: 0.3rem; align-items: center; }
.cleanbar__btn { padding: 0.3rem 0.6rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.75rem; cursor: pointer; }
.cleanbar__btn--active { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); }
.cleanbar__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cleanbar__btn--danger { color: var(--accent-error); border-color: var(--accent-error); }
.cleanbar__color { width: 2rem; height: 1.6rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; }
</style>
