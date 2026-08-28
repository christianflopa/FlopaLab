<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <label class="color-field" :class="{ 'color-field--disabled': disabled }">
    <span class="color-field__label">{{ label }}</span>
    <span class="color-field__value">{{ modelValue.toUpperCase() }}</span>
    <input
      class="color-field__input"
      type="color"
      :value="modelValue"
      :disabled="disabled"
      @input="onInput"
    />
  </label>
</template>

<style scoped>
.color-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.5rem;
  align-items: center;
}

.color-field--disabled {
  opacity: 0.45;
}

.color-field__label {
  font-size: 0.8rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.color-field__value {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.color-field__input {
  width: 2.5rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}
</style>
