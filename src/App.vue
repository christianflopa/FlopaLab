<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Viewport from './components/Viewport.vue'
import Canvas3D from './components/Canvas3D.vue'
import RasterLabModal from './features/rasterLab/RasterLabModal.vue'
import { useThemeStore } from './stores/theme'
import { useUiStore } from './stores/ui'

const canvasRef = ref<InstanceType<typeof Canvas3D> | null>(null)
const showRasterLab = ref(false)
const themeStore = useThemeStore()
const uiStore = useUiStore()

const isMobile = ref(false)

const isMobileViewport = computed(() => isMobile.value)

function checkMobile() {
  isMobile.value = window.innerWidth <= 768
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.sidebarOpen) {
    uiStore.closeSidebar()
  }
}

onMounted(() => {
  themeStore.initTheme()
  uiStore.initUiState()
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('keydown', onKeyDown)
})

function onExport3mf() {
  canvasRef.value?.export3mf()
}

function onExportStl() {
  canvasRef.value?.exportStl()
}

function onOpenRasterLab() {
  showRasterLab.value = true
  if (isMobile.value) {
    uiStore.closeSidebar()
  }
}

function onCloseSidebar() {
  uiStore.closeSidebar()
}
</script>

<template>
  <div class="app">
    <Sidebar
      :collapsed="uiStore.sidebarCollapsed"
      :mobile="isMobileViewport"
      @export-3mf="onExport3mf"
      @export-stl="onExportStl"
      @open-rasterlab="onOpenRasterLab"
      @close="onCloseSidebar"
    />
    <div v-if="isMobileViewport && uiStore.sidebarOpen" class="sidebar-backdrop" @click="onCloseSidebar"></div>
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

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}
</style>
