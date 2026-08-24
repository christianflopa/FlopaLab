// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ParsedSvg } from '../src/models/ParsedSvg'
import { useProjectStore } from '../src/stores/project'
import { createDefaultBaseObject } from '../src/models/BaseObject'

function fakeParsed(width: number, height: number): ParsedSvg {
  return {
    width,
    height,
    warnings: [],
    regions: [{ originalColor: '#FF0000', shapes: [] }],
  }
}

describe('auto-ajuste al cargar', () => {
  it('reduce un SVG enorme para caber en la base', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    store.base = createDefaultBaseObject()

    const design = store.addDesign('grande', fakeParsed(850, 1243))
    const fitted = Math.min(
      (store.base.width * 0.92) / 850,
      (store.base.height * 0.92) / 1243,
    )
    expect(design.scaleX).toBeCloseTo(fitted, 5)
    expect(design.scaleY).toBeCloseTo(fitted, 5)
    expect(850 * design.scaleX).toBeLessThanOrEqual(store.base.width)
    expect(1243 * design.scaleY).toBeLessThanOrEqual(store.base.height)
  })

  it('no amplía un SVG pequeño', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    store.base = createDefaultBaseObject()

    const design = store.addDesign('pequeno', fakeParsed(30, 40))
    expect(design.scaleX).toBe(1)
    expect(design.scaleY).toBe(1)
  })
})
