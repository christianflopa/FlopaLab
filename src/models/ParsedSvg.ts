import type { Shape, Vector2 } from 'three'

export interface SvgRegion {
  originalColor: string
  shapes: Shape[]
  /**
   * Polígonos simples (sin auto-intersecciones) en coordenadas locales del SVG:
   * cada polígono es [contornoExterior, ...huecos]. Se calculan una única vez
   * al parsear resolviendo solapes y auto-intersecciones por paridad par-impar;
   * los huecos se preservan para que la geometría sea fiel al original.
   */
  polys?: Vector2[][][]
}

export interface ParsedSvg {
  regions: SvgRegion[]
  width: number
  height: number
  warnings: string[]
}
