import { BufferGeometry, Matrix4 } from 'three'
import { Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'

const evaluator = new Evaluator()
evaluator.useGroups = false

export function expandZ(geometry: BufferGeometry, margin: number): BufferGeometry {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox

  if (!box) return geometry.clone()

  const minZ = box.min.z
  const height = Math.max(box.max.z - minZ, 1e-4)
  const factor = (height + 2 * margin) / height

  const matrix = new Matrix4()
    .makeTranslation(0, 0, minZ - margin)
    .multiply(new Matrix4().makeScale(1, 1, factor))
    .multiply(new Matrix4().makeTranslation(0, 0, -minZ))

  return geometry.clone().applyMatrix4(matrix)
}

export function clipToFootprint(geometry: BufferGeometry, footprint: BufferGeometry): BufferGeometry | null {
  const position = geometry.getAttribute('position')
  if (!position || position.count === 0) return null

  const target = new Brush(geometry)
  const tool = new Brush(footprint)
  target.updateMatrixWorld()
  tool.updateMatrixWorld()

  let clipped: BufferGeometry
  try {
    const result = evaluator.evaluate(target, tool, INTERSECTION)
    clipped = result.geometry
  } catch (error) {
    console.error('Clipping falló:', error)
    return null
  }

  const clippedPosition = clipped.getAttribute('position')
  if (!clippedPosition || clippedPosition.count === 0) {
    clipped.dispose()
    return null
  }

  return clipped
}

export function subtractSolid(solid: BufferGeometry, tool: BufferGeometry): BufferGeometry {
  const target = new Brush(solid)
  const cutter = new Brush(tool)
  target.updateMatrixWorld()
  cutter.updateMatrixWorld()

  try {
    const result = evaluator.evaluate(target, cutter, SUBTRACTION)
    return result.geometry
  } catch (error) {
    console.error('Resta de bolsillos falló:', error)
    return solid.clone()
  }
}
