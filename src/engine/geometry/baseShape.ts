import { Path, Shape, Vector2 } from 'three'
import type { ParsedSvg } from '../../models/ParsedSvg'
import type { BaseObject } from '../../models/BaseObject'
import { LIMITS } from '../constants'
import { computeSilhouette } from '../clipping/polyBoolean'

/**
 * Escala uniforme de una Shape copiada (no muta original).
 */
function scaleShapeCopy(shape: Shape, scale: number): Shape {
  const pts = shape.getPoints(12).map((p) => new Vector2(p.x * scale, p.y * scale))
  const ns = new Shape(pts)
  for (const h of shape.holes) {
    ns.holes.push(new Path(h.getPoints(12).map((p) => new Vector2(p.x * scale, p.y * scale))))
  }
  return ns
}

function scalePolysCopy(polys: Vector2[][][], scale: number): Vector2[][][] {
  return polys.map((poly) => poly.map((ring) => ring.map((p) => new Vector2(p.x * scale, p.y * scale))))
}

/**
 * Calcula escala uniforme a partir de las dimensiones actuales de la base
 * (base.width / base.height) para que la geometría 3D y la exportación
 * coincidan exactamente con las medidas mostradas en la UI.
 */
export function computeSvgBaseScale(parsed: ParsedSvg, base: BaseObject): number {
  const s = Math.min(base.width / parsed.width, base.height / parsed.height)
  return Math.min(Math.max(s, LIMITS.minDesignScale), LIMITS.maxDesignScale)
}

/**
 * Crea Shape(s) escalado(s) para la base a partir del SVG parseado.
 * Si el SVG tiene múltiples regiones disjuntas, las une con unionPolygons y genera Shape(s) escalados.
 * El color se ignora: la base usa base.color único.
 * Si base.silhouette es true, combina todos los polígonos en uno solo (silueta perimetral).
 */
export function createSvgShapesForBase(parsed: ParsedSvg, base: BaseObject): Shape[] {
  const scale = computeSvgBaseScale(parsed, base)
  // Usar polys ya saneados si existen, si no fallback a shapes
  const allPolys: Vector2[][][] = []
  for (const region of parsed.regions) {
    const polys = region.polys ?? []
    if (polys.length > 0) {
      allPolys.push(...scalePolysCopy(polys, scale))
    } else {
      // fallback a shapes
      for (const shape of region.shapes) {
        const scaled = scaleShapeCopy(shape, scale)
        // Convertir shape escalado a polys para union posterior si hay múltiples
        // Por ahora, devolver shapes directos
        allPolys.push(...(scaled as any).polys ?? [])
      }
    }
  }

  // Si hay múltiples polys, unirlos para obtener huella limpia
  if (allPolys.length === 0) {
    // Fallback: usar shapes directos escalados
    const shapes: Shape[] = []
    for (const region of parsed.regions) {
      for (const shape of region.shapes) {
        shapes.push(scaleShapeCopy(shape, scale))
      }
    }
    return shapes
  }

  // Si silhouette está activado, combinar todos los polígonos en uno solo
  if (base.silhouette && allPolys.length > 0) {
    // Convertir Vector2[][][] a [number,number][][][] para computeSilhouette
    const asNumbers: [number, number][][][] = allPolys.map((poly) =>
      poly.map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
    )
    // Calcular silueta: une todos y devuelve solo contorno exterior (sin holes)
    const silhouette = computeSilhouette(asNumbers)
    if (silhouette) {
      // Convertir de vuelta a shape (sin holes)
      const outer = silhouette[0].map(([x, y]) => new Vector2(x, y))
      return [new Shape(outer)]
    }
  }

  // Caso simple: convertir directo sin unión (la unión se hará en footprint si es necesario)
  return allPolys.map((poly) => {
    const outer = poly[0]
    const shape = new Shape(outer.map((p) => new Vector2(p.x, p.y)))
    for (let i = 1; i < poly.length; i++) {
      shape.holes.push(new Path(poly[i].map((p) => new Vector2(p.x, p.y))))
    }
    return shape
  })
}

/**
 * Totales para footprint: si hay múltiples shapes disjuntas, se mantienen como MultiPolygon;
 * createBaseGeometry y createFootprintShape deben manejarlo.
 */
export function createSvgFootprintPolys(parsed: ParsedSvg, base: BaseObject): Vector2[][][] {
  const scale = computeSvgBaseScale(parsed, base)
  const all: Vector2[][][] = []
  for (const region of parsed.regions) {
    const src = region.polys ?? []
    if (src.length > 0) {
      all.push(...scalePolysCopy(src, scale))
    } else {
      for (const shape of region.shapes) {
        const scaled = scaleShapeCopy(shape, scale)
        // @ts-ignore - shape.getPoints no es Vector2[][][] pero lo convertimos
        const poly = (scaled as any).polys ?? []
        if (poly.length > 0) all.push(...poly)
        else {
          // último fallback: usar shape directo
          const pts = scaled.getPoints(12)
          if (pts.length >= 3) all.push([pts])
        }
      }
    }
  }
  return all
}
