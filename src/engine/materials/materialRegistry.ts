import { MeshStandardMaterial } from 'three'

const baseMaterials = new Map<string, MeshStandardMaterial>()
const designMaterials = new Map<string, MeshStandardMaterial>()

function createMaterial(hex: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: hex.toUpperCase(),
    roughness: 0.4,
    metalness: 0.05,
  })
}

export function getBaseMaterial(hex: string): MeshStandardMaterial {
  const key = hex.toUpperCase()
  let material = baseMaterials.get(key)
  if (!material) {
    material = createMaterial(key)
    baseMaterials.set(key, material)
  }
  return material
}

export function getDesignMaterial(hex: string): MeshStandardMaterial {
  const key = hex.toUpperCase()
  let material = designMaterials.get(key)
  if (!material) {
    material = createMaterial(key)
    designMaterials.set(key, material)
  }
  return material
}

export function disposeAllMaterials() {
  for (const material of [...baseMaterials.values(), ...designMaterials.values()]) {
    material.dispose()
  }
  baseMaterials.clear()
  designMaterials.clear()
}
