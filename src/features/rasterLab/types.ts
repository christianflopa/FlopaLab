export type FilterPreset = 'contorno1' | 'contorno2' | 'borde1' | 'borde2' | 'relleno' | 'custom'

export type FilterMode = 'preset' | 'custom'

export interface TracerParams {
  threshold: number // 0-255
  blur: number // 0-5
  turdSize: number
  alphamax: number
  turnPolicy: 'minority' | 'majority' | 'black' | 'white' | 'left' | 'right'
  optCurve: boolean
  // borde specific
  strokeWidth: number
  invert: boolean
}

export interface RasterLabState {
  imageDataUrl: string | null
  imageElement: HTMLImageElement | null
  svgString: string | null
  preset: FilterPreset
  mode: FilterMode
  mono: boolean
  params: TracerParams
  isProcessing: boolean
}

export type CleanTool = 'select' | 'delete' | 'paint' | 'brush'

export interface CleanSegment {
  id: string
  d: string
  fill: string
  stroke: string
  strokeWidth: number
}
