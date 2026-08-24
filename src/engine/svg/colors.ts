import { Color } from 'three'

export type ResolvedFill =
  | { kind: 'solid'; hex: string }
  | { kind: 'none' }
  | { kind: 'unsupported'; raw: string }

const INVISIBLE = new Set(['none', 'transparent'])

export function resolveFill(raw: unknown): ResolvedFill {
  if (typeof raw !== 'string') return { kind: 'none' }
  const value = raw.trim().toLowerCase()
  if (value === '' || INVISIBLE.has(value)) return { kind: 'none' }
  if (value.startsWith('url(')) return { kind: 'unsupported', raw }
  try {
    const color = new Color()
    color.setStyle(raw)
    return { kind: 'solid', hex: `#${color.getHexString().toUpperCase()}` }
  } catch {
    return { kind: 'unsupported', raw }
  }
}

export function normalizeHex(hex: string): string {
  try {
    const color = new Color()
    color.setStyle(hex)
    return `#${color.getHexString().toUpperCase()}`
  } catch {
    return hex
  }
}
