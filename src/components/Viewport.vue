<script setup lang="ts">
import Toolbar from './Toolbar.vue'
</script>

<template>
  <main class="viewport">
    <Toolbar />
    <div class="viewport__content">
      <slot />
    </div>
  </main>
</template>

<style scoped>
.viewport {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.viewport__content {
  flex: 1;
  min-height: 0;
}
</style>
