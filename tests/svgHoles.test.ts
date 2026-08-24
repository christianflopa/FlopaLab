// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'

function ringAbsArea(ring: readonly { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    area += p.x * q.y - q.x * p.y
  }
  return Math.abs(area / 2)
}

describe('preservación de huecos al importar SVG', () => {
  it('evenodd: el cuadrado interior queda como hueco, no como relleno negro', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path fill="#000000" fill-rule="evenodd"
        d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z"/>
    </svg>`

    const parsed = parseSvgToRegions(svg)
    expect(parsed.regions).toHaveLength(1)

    const polys = parsed.regions[0].polys
    expect(polys).toBeDefined()
    expect(polys).toHaveLength(1)
    expect(polys![0]).toHaveLength(2)

    const [outer, hole] = polys![0]
    expect(ringAbsArea(outer)).toBeCloseTo(6400, 0)
    expect(ringAbsArea(hole)).toBeCloseTo(1600, 0)
  })

  it('nonzero con subpaths en sentidos opuestos también preserva el hueco', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path fill="#111111" d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L30 70 L70 70 L70 30 Z"/>
    </svg>`

    const parsed = parseSvgToRegions(svg)
    expect(parsed.regions).toHaveLength(1)

    const polys = parsed.regions[0].polys!
    expect(polys).toHaveLength(1)
    expect(polys[0]).toHaveLength(2)
  })

  it('dos formas del mismo color que se tocan siguen fusionándose sin perder sus huecos', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
      <rect x="5" y="5" width="50" height="50" fill="#222222"/>
      <rect x="55" y="5" width="60" height="50" fill="#222222"/>
      <circle cx="85" cy="30" r="15" fill="#ffffff"/>
    </svg>`

    const parsed = parseSvgToRegions(svg)
    const region = parsed.regions.find((r) => r.originalColor === '#222222')
    expect(region).toBeDefined()

    const polys = region!.polys!
    expect(polys).toHaveLength(1)

    const whiteRegion = parsed.regions.find((r) => r.originalColor.toUpperCase() === '#FFFFFF')
    expect(whiteRegion).toBeDefined()
  })
})
