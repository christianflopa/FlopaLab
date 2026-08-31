export interface ColorMapping {
  originalColor: string
  assignedColor: string
}

export interface DesignTransform {
  x: number
  y: number
}

export interface SvgDesign {
  id: string
  name: string
  position: DesignTransform
  scaleX: number
  scaleY: number
  uniformScale: boolean
  rotationDeg: number
  depth: number
  protrusion: number
  visible: boolean
  colors: ColorMapping[]
}
