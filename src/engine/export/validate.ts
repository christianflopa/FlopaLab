import { BufferGeometry, Vector3 } from 'three'

export interface SolidPart {
  name: string
  colorHex: string
  geometry: BufferGeometry
}

export interface ValidationReport {
  errors: string[]
  warnings: string[]
}

const MIN_VOLUME_MM3 = 0.05

export function validateSolids(parts: SolidPart[]): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []

  if (parts.length === 0) {
    errors.push('No hay geometría que exportar.')
    return { errors, warnings }
  }

  for (const part of parts) {
    const label = part.name
    const position = part.geometry.getAttribute('position')

    if (!position || position.count === 0) {
      errors.push(`«${label}» no tiene geometría.`)
      continue
    }

    let hasNaN = false
    for (let i = 0; i < position.array.length; i++) {
      if (!Number.isFinite(position.array[i])) {
        hasNaN = true
        break
      }
    }
    if (hasNaN) {
      errors.push(`«${label}» contiene coordenadas inválidas (NaN).`)
      continue
    }

    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (box) {
      const size = box.getSize(new Vector3())
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
        errors.push(`«${label}» es una geometría degenerada (medida nula en algún eje).`)
        continue
      }
    }

    const volume = Math.abs(signedVolume(part.geometry))
    if (volume < MIN_VOLUME_MM3) {
      warnings.push(`«${label}» es una región muy pequeña (${volume.toFixed(3)} mm³); puede no imprimirse.`)
      continue
    }

    const open = countOpenEdges(part.geometry)
    if (open > 0) {
      errors.push(`«${label}» tiene ${open} aristas abiertas (malla no estanca).`)
    }

    const overShared = countOverSharedEdges(part.geometry)
    if (overShared > 0) {
      const example = overSharedEdgeExample(part.geometry)
      errors.push(
        `«${label}» tiene ${overShared} aristas no manifold (compartidas por más de 2 caras${example ? `; ejemplo cerca de ${example}` : ''}).`,
      )
    }
  }

  return { errors, warnings }
}

export async function validateSolidsAsync(
  parts: SolidPart[],
  onProgress?: (done: number, total: number) => void,
): Promise<ValidationReport> {
  const errors: string[] = []
  const warnings: string[] = []
  if (parts.length === 0) {
    errors.push('No hay geometría que exportar.')
    return { errors, warnings }
  }
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx]
    onProgress?.(idx, parts.length)
    // ceder al event loop cada pieza para no bloquear UI con 2 SVGs (validate
    // puede tardar 300ms para 60k tris ×2)
    if (idx % 1 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    const label = part.name
    const position = part.geometry.getAttribute('position')
    if (!position || position.count === 0) {
      errors.push(`«${label}» no tiene geometría.`)
      continue
    }
    let hasNaN = false
    for (let i = 0; i < position.array.length; i++) {
      if (!Number.isFinite(position.array[i])) {
        hasNaN = true
        break
      }
    }
    if (hasNaN) {
      errors.push(`«${label}» contiene coordenadas inválidas (NaN).`)
      continue
    }
    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (box) {
      const size = box.getSize(new Vector3())
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
        errors.push(`«${label}» es una geometría degenerada (medida nula en algún eje).`)
        continue
      }
    }
    const volume = Math.abs(signedVolume(part.geometry))
    if (volume < MIN_VOLUME_MM3) {
      warnings.push(`«${label}» es una región muy pequeña (${volume.toFixed(3)} mm³); puede no imprimirse.`)
      continue
    }
    const open = countOpenEdges(part.geometry)
    if (open > 0) errors.push(`«${label}» tiene ${open} aristas abiertas (malla no estanca).`)
    const overShared = countOverSharedEdges(part.geometry)
    if (overShared > 0) {
      const example = overSharedEdgeExample(part.geometry)
      errors.push(
        `«${label}» tiene ${overShared} aristas no manifold (compartidas por más de 2 caras${example ? `; ejemplo cerca de ${example}` : ''}).`,
      )
    }
  }
  return { errors, warnings }
}

function overSharedEdgeExample(geometry: BufferGeometry): string | null {
  const position = geometry.getAttribute('position')
  if (!position || position.count === 0) return null
  const edges = new Map<string, number>()
  forEachEdge(geometry, (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  })
  for (const [key, count] of edges) {
    if (count > 2) {
      const [x, y, z] = key.split('|')[0].split(',')
      return `(x=${x}, y=${y}, z=${z})`
    }
  }
  return null
}

function forEachEdge(
  geometry: BufferGeometry,
  visit: (a: string, b: string) => void,
): void {
  const position = geometry.getAttribute('position')
  if (!position || position.count === 0) return

  const keyFor = (i: number) =>
    `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`

  const triangle = (i0: number, i1: number, i2: number) => {
    visit(keyFor(i0), keyFor(i1))
    visit(keyFor(i1), keyFor(i2))
    visit(keyFor(i2), keyFor(i0))
  }

  const index = geometry.index
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      triangle(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    }
  } else {
    for (let i = 0; i + 2 < position.count; i += 3) {
      triangle(i, i + 1, i + 2)
    }
  }
}

export function countOpenEdges(geometry: BufferGeometry): number {
  const edges = new Map<string, number>()
  forEachEdge(geometry, (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  })

  let open = 0
  for (const count of edges.values()) {
    if (count % 2 !== 0) open += 1
  }
  return open
}

export function countOverSharedEdges(geometry: BufferGeometry): number {
  const edges = new Map<string, number>()
  forEachEdge(geometry, (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  })

  let overShared = 0
  for (const count of edges.values()) {
    if (count > 2) overShared += 1
  }
  return overShared
}

function signedVolume(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position')
  if (!position || !geometry.index) {
    if (!position) return 0
    let sum = 0
    for (let i = 0; i + 2 < position.count; i += 3) {
      sum += tetraVolume(
        position.getX(i),
        position.getY(i),
        position.getZ(i),
        position.getX(i + 1),
        position.getY(i + 1),
        position.getZ(i + 1),
        position.getX(i + 2),
        position.getY(i + 2),
        position.getZ(i + 2),
      )
    }
    return sum
  }

  const index = geometry.index
  let sum = 0
  for (let i = 0; i + 2 < index.count; i += 3) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    sum += tetraVolume(
      position.getX(a),
      position.getY(a),
      position.getZ(a),
      position.getX(b),
      position.getY(b),
      position.getZ(b),
      position.getX(c),
      position.getY(c),
      position.getZ(c),
    )
  }
  return sum
}

function tetraVolume(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) {
  return (
    (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  )
}
