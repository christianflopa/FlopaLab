import { describe, expect, it } from 'vitest'
import { clampBaseValues, createDefaultBaseObject, holeCenterY } from '../src/models/BaseObject'

describe('clampBaseValues', () => {
  it('mantiene los valores por defecto intactos', () => {
    const base = createDefaultBaseObject()
    const clamped = clampBaseValues(base)
    expect(clamped.width).toBe(50)
    expect(clamped.height).toBe(150)
    expect(clamped.thickness).toBe(1)
    expect(clamped.cornerRadius).toBe(5)
  })

  it('limita el radio a la mitad del lado menor', () => {
    const base = { ...createDefaultBaseObject(), cornerRadius: 40 }
    expect(clampBaseValues(base).cornerRadius).toBe(25)
  })

  it('limita el grosor al rango válido', () => {
    const base = { ...createDefaultBaseObject(), thickness: 99 }
    expect(clampBaseValues(base).thickness).toBe(10)
  })

  it('impide que el agujero atraviese la pared', () => {
    const base = createDefaultBaseObject()
    base.hole.diameter = 100
    const clamped = clampBaseValues(base)
    expect(clamped.hole.diameter).toBeLessThanOrEqual(48)
  })

  it('impide offsets superiores que rompan la pieza', () => {
    const base = createDefaultBaseObject()
    base.hole.topOffset = 200
    const clamped = clampBaseValues(base)
    const maxValid = 150 / 2 - clamped.hole.diameter / 2 - 1
    expect(clamped.hole.topOffset).toBeLessThanOrEqual(maxValid)
    expect(holeCenterY(clamped) + clamped.hole.diameter / 2).toBeLessThanOrEqual(75)
  })
})

describe('holeCenterY', () => {
  it('coloca el centro según el offset desde el borde superior', () => {
    const base = createDefaultBaseObject()
    expect(holeCenterY(base)).toBe(150 / 2 - base.hole.topOffset - base.hole.diameter / 2)
  })
})
