<script setup lang="ts">
defineProps<{
  label: string
  modelValue: number
  unit?: string
  step?: number
  min?: number
  max?: number
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function onInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <label class="number-field" :class="{ 'number-field--disabled': disabled }">
    <span class="number-field__label">{{ label }}</span>
    <input
      class="number-field__input"
      type="number"
      :value="modelValue"
      :step="step ?? 0.1"
      :min="min"
      :max="max"
      :disabled="disabled"
      @input="onInput"
    />
    <span v-if="unit" class="number-field__unit">{{ unit }}</span>
  </label>
</template>

<style scoped>
.number-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem auto;
  gap: 0.5rem;
  align-items: center;
}

.number-field--disabled {
  opacity: 0.45;
}

.number-field__label {
  font-size: 0.8rem;
  color: #c0caf5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.number-field__input {
  width: 100%;
  padding: 0.3rem 0.4rem;
  border: 1px solid #2a2b3d;
  border-radius: 5px;
  background: #1f2335;
  color: #c0caf5;
  font-size: 0.8rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  appearance: textfield;
  -moz-appearance: textfield;
}

.number-field__input:focus {
  outline: none;
  border-color: #7aa2f7;
}

.number-field__input::-webkit-outer-spin-button,
.number-field__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.number-field__input:disabled {
  opacity: 0.6;
}

.number-field__unit {
  font-size: 0.65rem;
  color: #565f89;
  white-space: nowrap;
}
</style>
