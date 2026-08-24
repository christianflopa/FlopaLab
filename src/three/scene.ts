import { AxesHelper, Color, GridHelper, Scene } from 'three'

export interface SceneHelpers {
  grid: GridHelper
}

export function createScene(): { scene: Scene; helpers: SceneHelpers } {
  const scene = new Scene()
  scene.background = new Color(0x1a1b26)

  const grid = new GridHelper(320, 32, 0x565f89, 0x3b4261)
  grid.position.y = -0.05

  const axes = new AxesHelper(15)

  scene.add(grid, axes)

  return { scene, helpers: { grid } }
}
