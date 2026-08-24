import { PerspectiveCamera, Vector3 } from 'three'

export interface CameraOptions {
  position?: [number, number, number]
  target?: [number, number, number]
}

export function createCamera(options: CameraOptions = {}): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.5, 4000)
  const [x = 140, y = 110, z = 190] = options.position ?? []
  const [tx = 0, ty = 0, tz = 0] = options.target ?? []
  camera.position.set(x, y, z)
  camera.lookAt(new Vector3(tx, ty, tz))
  return camera
}
