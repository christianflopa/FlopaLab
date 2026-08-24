import { describe, expect, it } from 'vitest'
import { resolveFill } from '../src/engine/svg/colors'

describe('resolveFill', () => {
  it('resuelve hex a mayúsculas normalizadas', () => {
    expect(resolveFill('#ff0000')).toEqual({ kind: 'solid', hex: '#FF0000' })
  })

  it('resuelve colores con nombre', () => {
    expect(resolveFill('white')).toEqual({ kind: 'solid', hex: '#FFFFFF' })
  })

  it('resuelve rgb()', () => {
    expect(resolveFill('rgb(255, 0, 0)')).toEqual({ kind: 'solid', hex: '#FF0000' })
  })

  it('trata none y transparent como sin color', () => {
    expect(resolveFill('none').kind).toBe('none')
    expect(resolveFill('transparent').kind).toBe('none')
    expect(resolveFill(undefined).kind).toBe('none')
  })

  it('marca gradientes y patrones como no soportados', () => {
    const result = resolveFill('url(#grad1)')
    expect(result.kind).toBe('unsupported')
  })
})
