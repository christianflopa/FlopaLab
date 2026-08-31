import { DEFAULTS, LIMITS } from '../engine/constants'

export interface HoleConfig {
  enabled: boolean
  diameter: number
  topOffset: number
  x: number
}

export interface BorderConfig {
  enabled: boolean
  width: number
  depth: number
  protrusion: number
  color: string
}

export type BaseKind = 'rect' | 'svg'

export interface BaseObject {
  kind: BaseKind
  width: number
  height: number
  thickness: number
  cornerRadius: number
  hole: HoleConfig
  color: string
  svgBaseId: string | null
  svgBaseAspect: number | null
  svgBaseInitialSize: { w: number; h: number } | null
  silhouette: boolean
  border: BorderConfig
}

export function createDefaultBaseObject(): BaseObject {
  return {
    kind: 'rect',
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
    svgBaseId: null,
    svgBaseAspect: null,
    svgBaseInitialSize: null,
    silhouette: false,
    border: {
      enabled: DEFAULTS.borderEnabled,
      width: DEFAULTS.borderWidth,
      depth: DEFAULTS.borderDepth,
      protrusion: DEFAULTS.borderProtrusion,
      color: DEFAULTS.borderColor,
    },
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
  const border = clampBorder(base.border, width, height, thickness)

  return { 
    ...base, 
    width, 
    height, 
    thickness, 
    cornerRadius, 
    hole, 
    kind: base.kind, 
    svgBaseId: base.svgBaseId ?? null, 
    svgBaseAspect: base.svgBaseAspect ?? null, 
    svgBaseInitialSize: base.svgBaseInitialSize ?? null,
    silhouette: base.silhouette ?? false,
    border,
  }
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

function clampBorder(border: BorderConfig, width: number, height: number, thickness: number): BorderConfig {
  const maxBorderWidth = Math.min(width, height) / 2 - LIMITS.minWall
  return {
    enabled: border.enabled,
    width: clamp(border.width, LIMITS.minBorderWidth, Math.max(LIMITS.minBorderWidth, maxBorderWidth)),
    depth: clamp(border.depth, LIMITS.minBorderDepth, thickness),
    protrusion: clamp(border.protrusion, 0, LIMITS.maxProtrusion),
    color: border.color,
  }
}

export function holeCenterY(base: BaseObject): number {
  return base.height / 2 - base.hole.topOffset - base.hole.diameter / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
