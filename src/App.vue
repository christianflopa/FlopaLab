<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Viewport from './components/Viewport.vue'
import Canvas3D from './components/Canvas3D.vue'
import RasterLabModal from './features/rasterLab/RasterLabModal.vue'
import { useThemeStore } from './stores/theme'

const canvasRef = ref<InstanceType<typeof Canvas3D> | null>(null)
const showRasterLab = ref(false)
const themeStore = useThemeStore()

onMounted(() => {
  themeStore.initTheme()
})

function onExport3mf() {
  canvasRef.value?.export3mf()
}

function onExportStl() {
  canvasRef.value?.exportStl()
}
</script>

<template>
  <div class="app">
    <Sidebar @export-3mf="onExport3mf" @export-stl="onExportStl" @open-rasterlab="showRasterLab = true" />
    <Viewport>
      <Canvas3D ref="canvasRef" />
    </Viewport>
    <RasterLabModal v-if="showRasterLab" @close="showRasterLab = false" />
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
