import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'dark' | 'light'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('dark')

  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('flopalab-theme', newTheme)
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function initTheme() {
    const saved = localStorage.getItem('flopalab-theme') as Theme | null
    if (saved === 'dark' || saved === 'light') {
      theme.value = saved
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }

  return { theme, setTheme, toggleTheme, initTheme }
})
