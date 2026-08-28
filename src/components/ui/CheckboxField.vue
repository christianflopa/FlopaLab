<script setup lang="ts">
defineProps<{
  label: string
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="checkbox-field" :class="{ 'checkbox-field--disabled': disabled }">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span>{{ label }}</span>
  </label>
</template>

<style scoped>
.checkbox-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  cursor: pointer;
}

.checkbox-field--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.checkbox-field input {
  accent-color: var(--accent-primary);
}

.checkbox-field input:disabled {
  cursor: not-allowed;
}
</style>
