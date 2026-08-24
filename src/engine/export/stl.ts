import { BufferGeometry, Mesh } from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import type { SolidPart } from './validate'
import { downloadBlob } from '../../utils/download'

const exporter = new STLExporter()

export function buildStlBinary(geometry: BufferGeometry): ArrayBuffer {
  const mesh = new Mesh(geometry)
  return exporter.parse(mesh, { binary: true }) as unknown as ArrayBuffer
}

export function exportStlParts(parts: SolidPart[], baseName = 'flopalab') {
  for (const part of parts) {
    const data = buildStlBinary(part.geometry)
    downloadBlob(new Blob([data], { type: 'model/stl' }), `${baseName}_${slugify(part.name)}.stl`)
  }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'pieza'
  )
}
