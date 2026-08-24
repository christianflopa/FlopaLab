import { AmbientLight, DirectionalLight, type Scene } from 'three'

export function addLights(scene: Scene) {
  const ambient = new AmbientLight(0xffffff, 0.6)

  const key = new DirectionalLight(0xffffff, 2.4)
  key.position.set(120, 200, 100)

  const fill = new DirectionalLight(0x9ec3ff, 0.8)
  fill.position.set(-100, 60, -80)

  scene.add(ambient, key, fill)
}
