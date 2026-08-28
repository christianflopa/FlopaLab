import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three'
import type { BaseObject } from '../../models/BaseObject'
import { holeCenterY } from '../../models/BaseObject'
import { getParsedSvg } from '../svg/svgCache'
import { createSvgShapesForBase, computeSvgBaseScale } from './baseShape'
import type { ParsedSvg } from '../../models/ParsedSvg'
import { computeSilhouette } from '../clipping/polyBoolean'

const CORNER_SEGMENTS = 32

export function createBaseGeometry(base: BaseObject, parsedBase?: ParsedSvg | null): ExtrudeGeometry {
  // Si es base SVG, usar forma del SVG escalada
  if (base.kind === 'svg' && base.svgBaseId) {
    const parsed = parsedBase ?? getParsedSvg(base.svgBaseId) ?? null
    if (parsed) {
      const shapes = createSvgShapesForBase(parsed, base)
      // Añadir agujero paramétrico como hueco adicional al shape más grande
      if (base.hole.enabled && shapes.length > 0) {
        const target = shapes.reduce((a, b) => (a.getPoints(12).length > b.getPoints(12).length ? a : b))
        const radius = base.hole.diameter / 2
        const hole = new Path()
        hole.absarc(base.hole.x, holeCenterY(base), radius, 0, Math.PI * 2, true)
        target.holes.push(hole)
      }
      // Si hay múltiples shapes disjuntos, ExtrudeGeometry los maneja como array
      const geometry = new ExtrudeGeometry(shapes.length === 1 ? shapes[0] : shapes as any, {
        depth: base.thickness,
        bevelEnabled: false,
        curveSegments: CORNER_SEGMENTS,
      } as any)
      return geometry as ExtrudeGeometry
    }
  }

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

export function createFootprintShape(base: BaseObject, parsedBase?: ParsedSvg | null): Shape {
  if (base.kind === 'svg' && base.svgBaseId) {
    const parsed = parsedBase ?? getParsedSvg(base.svgBaseId) ?? null
    if (parsed) {
      const shapes = createSvgShapesForBase(parsed, base)
      // Para footprint usamos el shape más grande (o el primero si solo hay uno)
      // Si hay múltiples, el caller footprintPolygon manejará el MultiPolygon
      return shapes[0] ?? createRoundedRectShape(base.width, base.height, base.cornerRadius)
    }
  }
  return createRoundedRectShape(base.width, base.height, base.cornerRadius)
}

export function createFootprintPolysForBase(base: BaseObject, parsedBase?: ParsedSvg | null): import('three').Vector2[][][] {
  if (base.kind === 'svg' && base.svgBaseId) {
    const parsed = parsedBase ?? getParsedSvg(base.svgBaseId) ?? null
    if (parsed) {
      const scale = computeSvgBaseScale(parsed, base)
      const all: import('three').Vector2[][][] = []
      for (const region of parsed.regions) {
        const src = region.polys ?? []
        if (src.length > 0) {
          for (const poly of src) {
            all.push(poly.map((ring) => ring.map((p) => p.clone().multiplyScalar(scale))))
          }
        } else {
          for (const shape of region.shapes) {
            const pts = shape.getPoints(12).map((p) => p.clone().multiplyScalar(scale))
            if (pts.length >= 3) all.push([pts])
          }
        }
      }
      
      // Si silhouette está activado, combinar todos los polígonos en uno solo
      if (base.silhouette && all.length > 0) {
        // Convertir Vector2[][][] a [number,number][][][] para computeSilhouette
        const asNumbers: [number, number][][][] = all.map((poly) =>
          poly.map((ring) => ring.map((p) => [p.x, p.y] as [number, number]))
        )
        // Calcular silueta: une todos y devuelve solo contorno exterior (sin holes)
        const silhouette = computeSilhouette(asNumbers)
        if (silhouette) {
          // Convertir de vuelta a Vector2[][][] (un solo poly sin holes)
          return [silhouette.map((ring) => ring.map(([x, y]) => new Vector2(x, y)))]
        }
      }
      
      return all
    }
  }
  return []
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
