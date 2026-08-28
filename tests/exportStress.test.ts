// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Scene } from 'three'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'
import { setParsedSvg } from '../src/engine/svg/svgCache'
import { createDefaultBaseObject } from '../src/models/BaseObject'
import { BookmarkScene } from '../src/engine/builder/bookmarkScene'
import type { ParsedSvg } from '../src/models/ParsedSvg'
import type { SvgDesign } from '../src/models/SvgDesign'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const USER_FILES = [
  '/Users/christianflores/Downloads/tatsu.svg',
  '/Users/christianflores/Downloads/tatsu2.svg',
  '/Users/christianflores/Downloads/33.svg',
]

function loadSamples(): [string, ParsedSvg][] {
  const samples: [string, ParsedSvg][] = [['frieren', parseSvgToRegions(readFileSync('tests/fixtures/frieren.svg', 'utf8'))]]
  for (const file of USER_FILES) {
    if (!existsSync(file)) continue
    try {
      const parsed = parseSvgToRegions(readFileSync(file, 'utf8'))
      if (parsed.regions.length > 0) samples.push([file.split('/').pop()!, parsed])
    } catch {
      // archivo no disponible en este entorno
    }
  }
  return samples
}

describe('estrés de exportación (transformaciones aleatorias con semilla)', () => {
  it('todas las piezas salen estancas y sin aristas no manifold', async () => {
    const { countOpenEdges, countOverSharedEdges } = await import('../src/engine/export/validate')
    const rng = mulberry32(20260823)
    const all = loadSamples()
    let samples = all.filter(([n]) => n === 'tatsu.svg')
    if (samples.length === 0) samples = all.filter(([n]) => n === 'frieren')
    expect(samples.length).toBeGreaterThan(0)

    const problems: string[] = []

    for (const [name, parsed] of samples) {
      for (let i = 0; i < 5; i++) {
        const base = createDefaultBaseObject()
        base.thickness = rng() < 0.5 ? 1 : 1.5

        const mult = 0.7 + rng() * 0.7
        const fit = Math.min((base.width * 0.92) / parsed.width, (base.height * 0.92) / parsed.height, 1)
        const scale = fit * mult
        const maxX = base.width * 0.35
        const maxY = base.height * 0.35
        const id = `stress-${name}-${i}`
        setParsedSvg(id, parsed)

        const design: SvgDesign = {
          id,
          name,
          position: { x: (rng() * 2 - 1) * maxX, y: (rng() * 2 - 1) * maxY },
          scaleX: scale,
          scaleY: scale,
          uniformScale: true,
          rotationDeg: rng() * 45,
          depth: Math.min(0.25 + rng() * 0.65, base.thickness),
          visible: true,
          colors: [],
        }

        const results: string[] = []
        for (let rep = 0; rep < 2; rep++) {
          const scene = new BookmarkScene(new Scene())
          scene.update(base, [design], () => parsed)
          const { parts } = await scene.buildExportModel(base, [design], () => parsed)
          scene.dispose()
          let sig = ''
          if (name === 'tatsu.svg' && i === 0) {
            for (const part of parts) {
              const o = countOpenEdges(part.geometry)
              const v = countOverSharedEdges(part.geometry)
              const ntri = part.geometry.getAttribute('position').count / 3
              sig += `${part.name}:tris=${ntri},open=${o},over=${v} `
            }
            results.push(sig)
          }
        }
        if (results.length === 2) {
          console.log(`[dup] iguales=${results[0] === results[1]} | A: ${results[0]} | B: ${results[1]}`)
        }
        void results
        const scene = new BookmarkScene(new Scene())
        scene.update(base, [design], () => parsed)
        const { parts } = await scene.buildExportModel(base, [design], () => parsed)
        scene.dispose()
        console.log(
          `[cfg] ${name}#${i} th=${base.thickness} scale=${scale.toFixed(5)} pos=(${design.position.x.toFixed(2)},${design.position.y.toFixed(2)}) rot=${design.rotationDeg.toFixed(2)} depth=${design.depth.toFixed(4)}`,
        )

        for (const part of parts) {
          const open = countOpenEdges(part.geometry)
          const over = countOverSharedEdges(part.geometry)
          if (open > 0 || over > 0) {
            problems.push(`${name} cfg${i} → ${part.name}: abiertas=${open} noManifold=${over}`)
          }
          if (name === 'tatsu.svg' && i === 0) {
            const pa2 = part.geometry.getAttribute('position')
            console.log(`[verts] ${part.name} ${Array.from({ length: 6 }, (_, k) => `${pa2.getX(k).toFixed(5)},${pa2.getY(k).toFixed(5)},${pa2.getZ(k).toFixed(5)}`).join(' | ')}`)
            const posAttr = pa2
            console.log(
              `[probe] ${part.name} tris=${posAttr.count / 3} index=${part.geometry.index ? 'si' : 'no'} bbox=${JSON.stringify(part.geometry.boundingBox)}`,
            )
            const keyFor = (j: number) =>
              `${posAttr.getX(j).toFixed(4)},${posAttr.getY(j).toFixed(4)},${posAttr.getZ(j).toFixed(4)}`
            const em = new Map<string, number>()
            const visit = (a: string, b: string) => {
              const k = a < b ? `${a}|${b}` : `${b}|${a}`
              em.set(k, (em.get(k) ?? 0) + 1)
            }
            const idx = part.geometry.index
            if (idx) {
              for (let t = 0; t + 2 < idx.count; t += 3) {
                const a = idx.getX(t), b2 = idx.getX(t + 1), c = idx.getX(t + 2)
                visit(keyFor(a), keyFor(b2)); visit(keyFor(b2), keyFor(c)); visit(keyFor(c), keyFor(a))
              }
            } else {
              for (let t = 0; t + 2 < posAttr.count; t += 3) {
                visit(keyFor(t), keyFor(t + 1)); visit(keyFor(t + 1), keyFor(t + 2)); visit(keyFor(t + 2), keyFor(t))
              }
            }
            let badCount = 0
            for (const [k, c] of em) {
              if (c > 2 && badCount < 6) {
                badCount++
                console.log(`[probe-bad] x${c} @ ${k.split('|')[0]}`)
              }
            }
          }
        }
      }
    }

    expect(problems).toEqual([])
  }, 600000)
})
