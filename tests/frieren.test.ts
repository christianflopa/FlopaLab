// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Scene } from 'three'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'
import { setParsedSvg } from '../src/engine/svg/svgCache'
import { createDefaultBaseObject } from '../src/models/BaseObject'
import { BookmarkScene } from '../src/engine/builder/bookmarkScene'
import {
  countOpenEdges,
  countOverSharedEdges,
  type SolidPart,
} from '../src/engine/export/validate'
import { mergePartsByColor } from '../src/engine/export/solids'
import { validateSolids } from '../src/engine/export/validate'

const svgText = readFileSync('tests/fixtures/frieren.svg', 'utf8')
const parsed = parseSvgToRegions(svgText)

const base = createDefaultBaseObject()
const design = {
  id: 'frieren', name: 'frieren', position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1,
  uniformScale: true, rotationDeg: 0, depth: 0.4, protrusion: 0, visible: true, colors: [],
}

it('interacción sin CSG: frío acotado y caliente rápido', () => {
  setParsedSvg('frieren', parsed)
  const scene = new BookmarkScene(new Scene())

  design.scaleX = 0.12
  design.scaleY = 0.12
  const tCold = performance.now()
  scene.update(base, [design], () => parsed)
  const cold = performance.now() - tCold

  let warm = 0
  for (const scale of [0.5, 0.3, 0.2, 0.12, 0.05]) {
    design.scaleX = scale
    design.scaleY = scale
    const t = performance.now()
    scene.update(base, [design], () => parsed)
    warm = Math.max(warm, performance.now() - t)
  }
  scene.dispose()

  console.log(`frieren interactivo: frio=${Math.round(cold)}ms caliente=${Math.round(warm)}ms`)
  expect(cold).toBeLessThan(5000)
  expect(warm).toBeLessThan(250)
}, 30000)

it('exportación 2D: finita, rápida y produce piezas', async () => {
  setParsedSvg('frieren-export', parsed)
  design.scaleX = 0.11
  design.scaleY = 0.11

  const scene = new BookmarkScene(new Scene())
  scene.update(base, [design], () => parsed)

  const t = performance.now()
  const { parts, warnings } = await scene.buildExportModel(base, [design], () => parsed)
  const elapsed = Math.round(performance.now() - t)
  scene.dispose()

  const triangles = parts.reduce(
    (n, part) => n + Math.round(part.geometry.getAttribute('position').count / 3),
    0,
  )
  const openEdges = parts.reduce((n, part) => n + countOpenEdges(part.geometry), 0)
  const overShared = parts.reduce((n, part) => n + countOverSharedEdges(part.geometry), 0)
  console.log(
    `export frieren: ${elapsed}ms piezas=${parts.length} tris=${triangles} abiertas=${openEdges} noManifold=${overShared} avisos=${warnings.length}`,
  )

  expect(parts.length).toBeGreaterThanOrEqual(2)
  expect(openEdges).toBe(0)
  expect(overShared).toBe(0)
  expect(warnings).toHaveLength(0)
  expect(elapsed).toBeLessThan(5000)
}, 30000)

it('flujo de export de la app: merge por color + validación sin errores', async () => {
  setParsedSvg('frieren-appflow', parsed)
  design.scaleX = 0.11
  design.scaleY = 0.11

  const scene = new BookmarkScene(new Scene())
  scene.update(base, [design], () => parsed)
  const { parts } = await scene.buildExportModel(base, [design], () => parsed)
  scene.dispose()

  // mismo flujo que Canvas3D.doExport
  const solids = mergePartsByColor(parts)
  const report = validateSolids(solids)
  console.log(
    `app-flow piezas=${parts.length} solidos=${solids.length} errores=${report.errors.length} ${report.errors.join(' ')}`,
  )

  expect(report.errors).toHaveLength(0)
}, 30000)

it('auto-ajuste: el SVG enorme entra en la base al cargarlo con escala inicial del store', () => {
  // escala que aplica store.addDesign (FIT_MARGIN_RATIO=0.92)
  const fit = Math.min((base.width * 0.92) / parsed.width, (base.height * 0.92) / parsed.height, 1)
  expect(fit).toBeLessThan(0.12)
  expect(parsed.width * fit).toBeLessThanOrEqual(base.width)
  expect(parsed.height * fit).toBeLessThanOrEqual(base.height)
})
