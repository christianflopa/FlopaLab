<script setup lang="ts">
import type { TracerParams } from '../types'
defineProps<{ params: TracerParams }>()
const emit = defineEmits<{ 'update:params': [v: TracerParams] }>()
function update<K extends keyof TracerParams>(key: K, value: TracerParams[K]) {
  // el padre hace merge; emitimos patch completo vía v-model-like
  // simplificado: emitir objeto nuevo se hace en el padre con spread
  emit('update:params', { [key]: value } as any)
}
</script>

<template>
  <div class="params">
    <label class="params__field">Umbral <input type="range" :value="params.threshold" min="0" max="255" @input="update('threshold', Number(($event.target as HTMLInputElement).value))" /> <span>{{ params.threshold }}</span></label>
    <label class="params__field">Blur <input type="range" :value="params.blur" min="0" max="5" step="0.5" @input="update('blur', Number(($event.target as HTMLInputElement).value))" /> <span>{{ params.blur }}</span></label>
    <label class="params__field">TurdSize <input type="range" :value="params.turdSize" min="0" max="50" @input="update('turdSize', Number(($event.target as HTMLInputElement).value))" /> <span>{{ params.turdSize }}</span></label>
    <label class="params__field">Alphamax <input type="range" :value="params.alphamax" min="0" max="2" step="0.05" @input="update('alphamax', Number(($event.target as HTMLInputElement).value))" /> <span>{{ params.alphamax }}</span></label>
    <label class="params__field">Grosor Borde <input type="range" :value="params.strokeWidth" min="0" max="10" step="0.5" @input="update('strokeWidth', Number(($event.target as HTMLInputElement).value))" /> <span>{{ params.strokeWidth }}</span></label>
  </div>
</template>

<style scoped>
.params { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; padding: 0.6rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.params__field { display: flex; gap: 0.4rem; align-items: center; font-size: 0.75rem; color: var(--text-primary); }
.params__field input[type="range"] { flex: 1; }
</style>
