import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const sidebarOpen = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem('flopalab-sidebar-collapsed', String(sidebarCollapsed.value))
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function toggleMobileSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function initUiState() {
    const saved = localStorage.getItem('flopalab-sidebar-collapsed')
    if (saved !== null) {
      sidebarCollapsed.value = saved === 'true'
    }
  }

  return { sidebarCollapsed, sidebarOpen, toggleSidebar, openSidebar, closeSidebar, toggleMobileSidebar, initUiState }
})
