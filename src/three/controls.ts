import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Camera } from 'three'

export function createOrbitControls(camera: Camera, domElement: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  return controls
}

export function createTransformControls(camera: Camera, domElement: HTMLElement): TransformControls {
  const controls = new TransformControls(camera, domElement)
  controls.setSize(0.9)
  return controls
}
