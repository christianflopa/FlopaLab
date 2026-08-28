import type { FilterPreset, TracerParams } from '../types'

// Mapa ingeniería inversa de picsvg.com
// Contorno/Borde/Relleno replican el comportamiento observado:
// - Contorno: relleno sólido, turdSize pequeño vs grande
// - Borde: solo trazo (stroke), sin relleno, grosor variable
// - Relleno: contorno + relleno interior
export const PRESETS: Record<Exclude<FilterPreset, 'custom'>, { label: string; params: TracerParams; mono: boolean }> = {
  contorno1: {
    label: 'Contorno 1',
    mono: true,
    params: {
      threshold: 128,
      blur: 0,
      turdSize: 2,
      alphamax: 1.0,
      turnPolicy: 'minority',
      optCurve: true,
      strokeWidth: 0,
      invert: false,
    },
  },
  contorno2: {
    label: 'Contorno 2',
    mono: true,
    params: {
      threshold: 90,
      blur: 1,
      turdSize: 10,
      alphamax: 1.33,
      turnPolicy: 'majority',
      optCurve: true,
      strokeWidth: 0,
      invert: false,
    },
  },
  borde1: {
    label: 'Borde 1',
    mono: true,
    params: {
      threshold: 50,
      blur: 1,
      turdSize: 2,
      alphamax: 1.0,
      turnPolicy: 'minority',
      optCurve: true,
      strokeWidth: 1,
      invert: false,
    },
  },
  borde2: {
    label: 'Borde 2',
    mono: true,
    params: {
      threshold: 30,
      blur: 1,
      turdSize: 5,
      alphamax: 1.0,
      turnPolicy: 'minority',
      optCurve: true,
      strokeWidth: 2.5,
      invert: false,
    },
  },
  relleno: {
    label: 'Relleno',
    mono: true,
    params: {
      threshold: 128,
      blur: 0,
      turdSize: 5,
      alphamax: 1.0,
      turnPolicy: 'minority',
      optCurve: true,
      strokeWidth: 0,
      invert: false,
    },
  },
}

export const DEFAULT_PARAMS: TracerParams = { ...PRESETS.contorno1.params }

export function getPresetParams(preset: FilterPreset, custom: TracerParams): TracerParams {
  if (preset === 'custom') return custom
  return { ...PRESETS[preset].params }
}
