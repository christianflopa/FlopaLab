import { ExtrudeGeometry, Path, Shape } from 'three'
import type { BaseObject } from '../../models/BaseObject'
import { holeCenterY } from '../../models/BaseObject'

const CORNER_SEGMENTS = 32

export function createBaseGeometry(base: BaseObject): ExtrudeGeometry {
  const shape = createRoundedRectShape(base.width, base.height, base.cornerRadius)

  if (base.hole.enabled) {
    const radius = base.hole.diameter / 2
    const hole = new Path()
    hole.absarc(base.hole.x, holeCenterY(base), radius, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: base.thickness,
    bevelEnabled: false,
    curveSegments: CORNER_SEGMENTS,
  })

  return geometry
}

export function createFootprintShape(base: BaseObject): Shape {
  return createRoundedRectShape(base.width, base.height, base.cornerRadius)
}

function createRoundedRectShape(width: number, height: number, radius: number): Shape {
  const shape = new Shape()
  const hw = width / 2
  const hh = height / 2

  if (radius <= 0) {
    shape.moveTo(-hw, -hh)
    shape.lineTo(hw, -hh)
    shape.lineTo(hw, hh)
    shape.lineTo(-hw, hh)
    shape.closePath()
    return shape
  }

  shape.moveTo(-hw + radius, -hh)
  shape.lineTo(hw - radius, -hh)
  shape.absarc(hw - radius, -hh + radius, radius, -Math.PI / 2, 0, false)
  shape.lineTo(hw, hh - radius)
  shape.absarc(hw - radius, hh - radius, radius, 0, Math.PI / 2, false)
  shape.lineTo(-hw + radius, hh)
  shape.absarc(-hw + radius, hh - radius, radius, Math.PI / 2, Math.PI, false)
  shape.lineTo(-hw, -hh + radius)
  shape.absarc(-hw + radius, -hh + radius, radius, Math.PI, (3 * Math.PI) / 2, false)
  shape.closePath()

  return shape
}
