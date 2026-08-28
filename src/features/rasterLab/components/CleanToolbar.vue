<script setup lang="ts">
import type { CleanTool } from '../types'
defineProps<{ tool: CleanTool; canUndo: boolean; canRedo: boolean; selectedColor: string; brushSize?: number }>()
const emit = defineEmits<{
  'update:tool': [v: CleanTool]
  'undo': []
  'redo': []
  'update:selectedColor': [v: string]
  'update:brushSize': [v: number]
  'clear': []
}>()
</script>

<template>
  <div class="cleanbar">
    <div class="cleanbar__group">
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'select' }" @click="emit('update:tool', 'select')">Seleccionar</button>
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'delete' }" @click="emit('update:tool', 'delete')">Eliminar</button>
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'paint' }" @click="emit('update:tool', 'paint')">Pintar</button>
      <button class="cleanbar__btn" :class="{ 'cleanbar__btn--active': tool === 'brush' }" @click="emit('update:tool', 'brush')">Pincel</button>
      <input v-if="tool === 'paint' || tool === 'brush'" type="color" :value="selectedColor" class="cleanbar__color" @input="emit('update:selectedColor', ($event.target as HTMLInputElement).value)" />
      <div v-if="tool === 'brush'" class="cleanbar__brushSize">
        <label class="cleanbar__label">Grosor:</label>
        <input type="range" :value="brushSize" min="1" max="20" step="1" class="cleanbar__slider" @input="emit('update:brushSize', Number(($event.target as HTMLInputElement).value))" />
        <span class="cleanbar__value">{{ brushSize }}px</span>
      </div>
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
.cleanbar__group { display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; }
.cleanbar__btn { padding: 0.3rem 0.6rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.75rem; cursor: pointer; }
.cleanbar__btn--active { background: var(--accent-primary); color: var(--text-on-primary); border-color: var(--accent-primary); }
.cleanbar__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cleanbar__btn--danger { color: var(--accent-error); border-color: var(--accent-error); }
.cleanbar__color { width: 2rem; height: 1.6rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; }
.cleanbar__brushSize { display: flex; gap: 0.3rem; align-items: center; margin-left: 0.3rem; }
.cleanbar__label { font-size: 0.7rem; color: var(--text-secondary); }
.cleanbar__slider { width: 80px; }
.cleanbar__value { font-size: 0.7rem; color: var(--text-primary); min-width: 2rem; }
</style>
