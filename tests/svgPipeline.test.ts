// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createBaseGeometry } from '../src/engine/geometry/baseGeometry'
import { createDefaultBaseObject } from '../src/models/BaseObject'
import { ensureDesignGeometries, designWorldMatrix } from '../src/engine/geometry/designGeometry'
import { clipToFootprint } from '../src/engine/clipping/csgClip'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'
import { setParsedSvg } from '../src/engine/svg/svgCache'
import type { SvgDesign } from '../src/models/SvgDesign'

function tracedPathSvg(segments: number): string {
  const step = 0.5
  let d = 'M 10 10'
  for (let i = 1; i <= segments; i++) {
    const x = 10 + i * step
    const y = i % 2 === 0 ? 10 : 12
    d += ` L ${x.toFixed(2)} ${y}`
  }
  d += ' Z'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect x="20" y="20" width="160" height="160" fill="#000000"/>
    <path d="${d}" fill="#FF0000"/>
  </svg>`
}

function makeDesign(depth: number): SvgDesign {
  return {
    id: 't1',
    name: 'test.svg',
    position: { x: 0, y: 0 },
    scaleX: 1,
    scaleY: 1,
    uniformScale: true,
    rotationDeg: 0,
    depth,
    visible: true,
    colors: [],
  }
}

describe('pipeline con SVG realista', () => {
  it('parsea y recorta un SVG con path trazado de muchos segmentos rectos', () => {
    const svg = tracedPathSvg(400)
    const parsed = parseSvgToRegions(svg)
    expect(parsed.regions.length).toBe(2)

    setParsedSvg('t1', parsed)

    const base = createDefaultBaseObject()
    const design = makeDesign(1.5)

    const geometries = ensureDesignGeometries(design.id, parsed.regions, design.depth)
    expect(geometries.size).toBeGreaterThan(0)

    const slab = createBaseGeometry(base)

    let totalTriangles = 0
    for (const [, geometry] of geometries) {
      const world = geometry.clone().applyMatrix4(designWorldMatrix(design, base.thickness))
      const clipped = clipToFootprint(world, slab)
      world.dispose()
      if (clipped) {
        totalTriangles += clipped.getAttribute('position').count / 3
        clipped.dispose()
      }
    }

    expect(totalTriangles).toBeGreaterThan(0)
    slab.dispose()
  }, 8000)

  it('un rectángulo simple no explota en cantidad de puntos', () => {
    const parsed = parseSvgToRegions(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#123456"/></svg>',
    )
    const contour = parsed.regions[0].shapes[0]
    const points = contour.getPoints(1)
    expect(points.length).toBeLessThanOrEqual(8)
  })
})
