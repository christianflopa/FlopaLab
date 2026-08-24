import { DEFAULTS, LIMITS } from '../engine/constants'

export interface HoleConfig {
  enabled: boolean
  diameter: number
  topOffset: number
  x: number
}

export interface BaseObject {
  width: number
  height: number
  thickness: number
  cornerRadius: number
  hole: HoleConfig
  color: string
}

export function createDefaultBaseObject(): BaseObject {
  return {
    width: DEFAULTS.width,
    height: DEFAULTS.height,
    thickness: DEFAULTS.thickness,
    cornerRadius: DEFAULTS.cornerRadius,
    hole: {
      enabled: DEFAULTS.holeEnabled,
      diameter: DEFAULTS.holeDiameter,
      topOffset: DEFAULTS.holeTopOffset,
      x: DEFAULTS.holeX,
    },
    color: DEFAULTS.baseColor,
  }
}

export interface BaseValidationIssue {
  field: string
  message: string
}

export function clampBaseValues(base: BaseObject): BaseObject {
  const width = clamp(base.width, LIMITS.minWidth, LIMITS.maxWidth)
  const height = clamp(base.height, LIMITS.minHeight, LIMITS.maxHeight)
  const thickness = clamp(base.thickness, LIMITS.minThickness, LIMITS.maxThickness)
  const maxRadius = Math.min(width, height) * LIMITS.maxCornerRadiusRatio
  const cornerRadius = clamp(base.cornerRadius, 0, maxRadius)

  const hole = clampHole(base.hole, width, height)

  return { ...base, width, height, thickness, cornerRadius, hole }
}

function clampHole(hole: HoleConfig, width: number, height: number): HoleConfig {
  const diameter = clamp(
    hole.diameter,
    LIMITS.minHoleDiameter,
    Math.max(LIMITS.minHoleDiameter, Math.min(width, height) - 2 * LIMITS.minWall),
  )
  const radius = diameter / 2
  const maxX = width / 2 - radius - LIMITS.minWall
  const x = clamp(hole.x, -maxX, maxX)
  const maxTopOffset = height / 2 - radius - LIMITS.minWall
  const topOffset = clamp(hole.topOffset, LIMITS.minTopOffset, maxTopOffset)
  return { ...hole, diameter, x, topOffset }
}

export function holeCenterY(base: BaseObject): number {
  return base.height / 2 - base.hole.topOffset - base.hole.diameter / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
