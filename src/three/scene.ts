import { AxesHelper, Color, GridHelper, Scene } from 'three'

export interface SceneHelpers {
  grid: GridHelper
}

export function createScene(theme: 'dark' | 'light' = 'dark'): { scene: Scene; helpers: SceneHelpers } {
  const scene = new Scene()
  scene.background = new Color(theme === 'dark' ? 0x1a1b26 : 0xe8f0ff)

  const grid = new GridHelper(320, 32, 0x565f89, 0x3b4261)
  grid.position.y = -0.05

  const axes = new AxesHelper(15)

  scene.add(grid, axes)

  return { scene, helpers: { grid } }
}
