// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { Scene } from 'three'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'
import { setParsedSvg } from '../src/engine/svg/svgCache'
import { createDefaultBaseObject } from '../src/models/BaseObject'
import { BookmarkScene } from '../src/engine/builder/bookmarkScene'
import type { SvgDesign } from '../src/models/SvgDesign'
import type { SolidPart } from '../src/engine/export/validate'

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

function edgeStats(geometry: SolidPart['geometry']) {
  const position = geometry.getAttribute('position')
  const keyFor = (i: number) =>
    `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`
  const edges = new Map<string, number>()
  const visit = (a: string, b: string) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  }
  const index = geometry.index
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      visit(keyFor(a), keyFor(b))
      visit(keyFor(b), keyFor(c))
      visit(keyFor(c), keyFor(a))
    }
  }
  const bad: { key: string; count: number }[] = []
  let open = 0
  for (const [key, count] of edges) {
    if (count > 2) bad.push({ key, count })
    if (count % 2 !== 0) open += 1
  }
  return { open, bad }
}

it('disecar cfg0', async () => {
  const parsedF = parseSvgToRegions(readFileSync('tests/fixtures/frieren.svg', 'utf8'))
  let parsed: ReturnType<typeof parseSvgToRegions>
  try {
    parsed = parseSvgToRegions(readFileSync('/Users/christianflores/Downloads/tatsu.svg', 'utf8'))
  } catch {
    console.log('__dbgCfg: tatsu.svg no disponible, se usa frieren como fallback')
    parsed = parsedF
  }
  let parsedT2: ReturnType<typeof parseSvgToRegions> | undefined
  let parsedN33: ReturnType<typeof parseSvgToRegions> | undefined
  try { parsedT2 = parseSvgToRegions(readFileSync('/Users/christianflores/Downloads/tatsu2.svg', 'utf8')) } catch { /* opcional */ }
  try { parsedN33 = parseSvgToRegions(readFileSync('/Users/christianflores/Downloads/33.svg', 'utf8')) } catch { /* opcional */ }
  const samples: [string, typeof parsed][] = [['tatsu.svg', parsed]]
  const rng = mulberry32(20260823)
  void parsedF
  void parsedT2
  void parsedN33

  let target: { label: string; v: Record<string, number> } | null = null
  for (const [name, p] of samples) {
    for (let i = 0; i < 5; i++) {
      const base = createDefaultBaseObject()
      base.thickness = rng() < 0.5 ? 1 : 1.5
      const mult = 0.7 + rng() * 0.7
      const fit = Math.min((base.width * 0.92) / p.width, (base.height * 0.92) / p.height, 1)
      const scale = fit * mult
      const maxX = base.width * 0.35
      const maxY = base.height * 0.35
      const px = (rng() * 2 - 1) * maxX
      const py = (rng() * 2 - 1) * maxY
      const rot = rng() * 45
      const depth = Math.min(0.25 + rng() * 0.65, base.thickness)
      if (name === 'tatsu.svg' && i === 0) {
        target = {
          label: `${name} cfg${i}`,
          v: { th: base.thickness, scale, px, py, rot, depth },
        }
      }
    }
  }
  if (!target) throw new Error('no encontrado')

  const { th, scale, px, py, rot, depth } = target.v
  console.log(`cfg: th=${th} scale=${scale.toFixed(5)} pos=(${px.toFixed(3)},${py.toFixed(3)}) rot=${rot.toFixed(2)} depth=${depth.toFixed(4)}`)

  const base = createDefaultBaseObject()
  base.thickness = th

  setParsedSvg('stress-tatsu.svg-0', parsed)
  const design: SvgDesign = {
    id: 'stress-tatsu.svg-0',
    name: 'tatsu.svg',
    position: { x: px, y: py },
    scaleX: scale,
    scaleY: scale,
    uniformScale: true,
    rotationDeg: rot,
    depth,
    protrusion: 0,
    visible: true,
    colors: [],
  }

  const scene = new BookmarkScene(new Scene())
  scene.update(base, [design], () => parsed)
  const { parts } = await scene.buildExportModel(base, [design], () => parsed)
  scene.dispose()

  const imported = await import('../src/engine/export/validate')
  for (const part of parts) {
    console.log(
      `[importada] ${part.name}: abiertas=${imported.countOpenEdges(part.geometry)} noManifold=${imported.countOverSharedEdges(part.geometry)}`,
    )
  }

  for (const part of parts) {
    const st = edgeStats(part.geometry)
    const ntri = part.geometry.getAttribute('position').count / 3
    const pa = part.geometry.getAttribute('position')
    console.log(`[verts] ${part.name} ${Array.from({ length: 6 }, (_, k) => `${pa.getX(k).toFixed(5)},${pa.getY(k).toFixed(5)},${pa.getZ(k).toFixed(5)}`).join(' | ')}`)
    console.log(`${part.name}: tris=${ntri} abiertas=${st.open} noManifold=${st.bad.length}`)
    for (const b of st.bad.slice(0, 8)) {
      const [p1] = b.key.split('|')
      const [x, y, z] = p1.split(',')
      console.log(`   x${b.count} @ (${x}, ${y}, z=${z})`)
    }
  }
}, 300000)
