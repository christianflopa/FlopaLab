<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Viewport from './components/Viewport.vue'
import Canvas3D from './components/Canvas3D.vue'

const canvasRef = ref<InstanceType<typeof Canvas3D> | null>(null)

function onExport3mf() {
  canvasRef.value?.export3mf()
}

function onExportStl() {
  canvasRef.value?.exportStl()
}
</script>

<template>
  <div class="app">
    <Sidebar @export-3mf="onExport3mf" @export-stl="onExportStl" />
    <Viewport>
      <Canvas3D ref="canvasRef" />
    </Viewport>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
