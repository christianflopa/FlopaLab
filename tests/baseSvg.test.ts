// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Scene, Vector3 } from 'three'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../src/stores/project'
import { parseSvgToRegions } from '../src/engine/svg/parseSvg'
import { getParsedSvg, setParsedSvg } from '../src/engine/svg/svgCache'
import { createBaseGeometry, createFootprintPolysForBase } from '../src/engine/geometry/baseGeometry'
import { BookmarkScene } from '../src/engine/builder/bookmarkScene'
import { countOverSharedEdges, countOpenEdges } from '../src/engine/export/validate'

const SWORD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 400" width="100" height="400">
  <path d="M50 0 L70 60 L70 340 Q70 360 50 380 Q30 360 30 340 L30 60 Z" fill="#000000" />
</svg>`

describe('Base SVG', () => {
  it('setBaseFromSvg escala el lado más largo a 150mm y mantiene proporción', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    const parsed = parseSvgToRegions(SWORD_SVG)
    store.setBaseFromSvg(SWORD_SVG, parsed)
    expect(store.base.kind).toBe('svg')
    // El lado más grande (el que sea) se lleva a 150mm; el otro es proporcional
    expect(Math.max(store.base.width, store.base.height)).toBeCloseTo(150, 0)
    // Proporción preservada: width/height == parsed.width/parsed.height
    expect(store.base.width / store.base.height).toBeCloseTo(parsed.width / parsed.height, 3)
    expect(store.base.thickness).toBe(1)
  })

  it('createBaseGeometry con SVG base produce bounds proporcionales y grosor 1', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    const parsed = parseSvgToRegions(SWORD_SVG)
    store.setBaseFromSvg(SWORD_SVG, parsed)
    const geo = createBaseGeometry(store.base)
    geo.computeBoundingBox()
    const size = geo.boundingBox!.getSize(new Vector3())
    expect(Math.abs(size.x)).toBeCloseTo(store.base.width, 1)
    expect(Math.abs(size.y)).toBeCloseTo(store.base.height, 1)
    expect(Math.abs(size.z)).toBeCloseTo(1, 0)
  })

  it('buildExportModel produce piezas estancas con base SVG', async () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    const parsed = parseSvgToRegions(SWORD_SVG)
    store.setBaseFromSvg(SWORD_SVG, parsed)
    setParsedSvg(store.base.svgBaseId!, parsed)
    const designParsed = parseSvgToRegions(`<svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 0 H10 V10 H0 Z" fill="#000000"/></svg>`)
    const design = store.addDesign('diseno', designParsed)
    setParsedSvg(design.id, designParsed)
    const getParsed = (id: string) => getParsedSvg(id)
    const scene = new BookmarkScene(new Scene())
    scene.update(store.base, [design], getParsed)
    const { parts } = await scene.buildExportModel(store.base, [design], getParsed)
    scene.dispose()
    expect(parts.length).toBeGreaterThanOrEqual(2)
    for (const part of parts) {
      expect(countOpenEdges(part.geometry)).toBe(0)
      expect(countOverSharedEdges(part.geometry)).toBe(0)
    }
  })

  it('clearBaseSvg resetea width/height a los valores default (50x150)', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    const parsed = parseSvgToRegions(SWORD_SVG)
    store.setBaseFromSvg(SWORD_SVG, parsed)
    // Verificar que el SVG base cambió las dimensiones
    expect(store.base.kind).toBe('svg')
    expect(store.base.width).not.toBe(50) // Debería ser ~37.5 (proporcional al SVG)
    
    // Limpiar el SVG base
    store.clearBaseSvg()
    
    // Verificar que volvió a rectángulo con dimensiones default
    expect(store.base.kind).toBe('rect')
    expect(store.base.width).toBe(50)
    expect(store.base.height).toBe(150)
    expect(store.base.svgBaseId).toBeNull()
  })

  it('silhouette mode combina todos los polígonos del SVG en uno solo', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    // SVG con múltiples regiones disjuntas (dos cuadrados cercanos)
    const multiRegionSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect x="10" y="20" width="30" height="60" fill="#000000"/>
      <rect x="60" y="20" width="30" height="60" fill="#000000"/>
    </svg>`
    const parsed = parseSvgToRegions(multiRegionSvg)
    store.setBaseFromSvg(multiRegionSvg, parsed)
    
    // Sin silhouette: debe haber múltiples polígonos
    expect(store.base.silhouette).toBe(false)
    const polysNormal = createFootprintPolysForBase(store.base)
    // Verificar que hay al menos 2 polígonos separados
    expect(polysNormal.length).toBeGreaterThanOrEqual(2)
    
    // Con silhouette: debe haber un solo polígono combinado
    store.updateBase({ silhouette: true })
    expect(store.base.silhouette).toBe(true)
    const polysSilhouette = createFootprintPolysForBase(store.base)
    // Verificar que los polígonos se combinaron en uno solo
    expect(polysSilhouette.length).toBe(1)
  })
})
