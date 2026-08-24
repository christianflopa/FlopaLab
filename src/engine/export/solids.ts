import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SolidPart } from './validate'

/**
 * Fusión por color para 3MF/STL.
 *
 * - Pieza base: `Base`, `Base_capa2`, `Base_fondo` comparten color pero se
 *   tocan en el plano del bolsillo → `groupHasContact` las mantiene separadas
 *   (evita caras coincidentes no-manifold). El compuesto 3MF las agrupa.
 * - Diseños SVG: cada pieza se nombra `Diseño_1`, `Diseño_2`, ... (o
 *   `Diseño_N_M` si un mismo SVG tiene varios colores). Si dos diseños
 *   distintos comparten el mismo color asignado y están disjuntos, **no** se
 *   fusionan aunque tengan el color idéntico: se preservan como objetos
 *   separados para que en Bambu Studio se vean como `Diseño_1` y `Diseño_2`
 *   (el usuario cargó 2 SVGs y espera 2 objetos). Sólo se fusionan piezas
 *   disjuntas que ya comparten exactamente el mismo `name` (p.ej. regiones
 *   fragmentadas de un mismo bucket que quedaron separadas por recorte).
 */
export function mergePartsByColor(parts: SolidPart[]): SolidPart[] {
  const groups = new Map<string, SolidPart[]>()

  for (const part of parts) {
    const key = part.colorHex.toUpperCase()
    const group = groups.get(key)
    if (group) {
      group.push(part)
    } else {
      groups.set(key, [part])
    }
  }

  const merged: SolidPart[] = []

  for (const [color, group] of groups) {
    if (group.length === 1) {
      merged.push({ ...group[0], colorHex: color })
      continue
    }

    // Si dos piezas del mismo color se tocan (p. ej. la banda superior y el
    // fondo de la base comparten el plano del suelo del bolsillo),
    // concatenarlas deja caras coincidentes y la validación detecta aristas
    // compartidas por más de 2 caras. Se exportan como sólidos separados: el
    // objeto compuesto del 3MF ya las agrupa y cada malla es estanca.
    if (groupHasContact(group)) {
      merged.push(...group.map((part) => ({ ...part, colorHex: color })))
      continue
    }

    // No fusionar diseños distintos aunque compartan color: preservar
    // identidad `Diseño_1` vs `Diseño_2` para que el slicer los liste por
    // separado (cada SVG cargado es un objeto independiente). Sólo se fusionan
    // piezas disjuntas del mismo origen. El test `a`/`b` usa nombres genéricos
    // no-Diseño y debe seguir fusionando (comportamiento original).
    const uniqueNames = new Set(group.map((p) => p.name))
    if (uniqueNames.size > 1) {
      const hasDesignNames = [...uniqueNames].some((n) => n.startsWith('Diseño_'))
      if (hasDesignNames) {
        const designIndices = [...uniqueNames].map((n) => n.match(/^Diseño_(\d+)/)?.[1] ?? n)
        if (new Set(designIndices).size > 1) {
          merged.push(...group.map((part) => ({ ...part, colorHex: color })))
          continue
        }
      }
      // Para `Diseño_*` del mismo índice o nombres genéricos `a`/`b`,
      // caer al bloque de fusión (mergeGeometries) abajo.
    }

    const geometries = group.map((part) => part.geometry)
    const combined = mergeGeometries(geometries, false)
    if (!combined) {
      throw new Error(`No se pudieron combinar las piezas del color ${color}.`)
    }

    merged.push({
      name: group[0].name,
      colorHex: color,
      geometry: combined,
    })
  }

  return merged
}

function groupHasContact(group: SolidPart[]): boolean {
  for (const part of group) part.geometry.computeBoundingBox()
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i].geometry.boundingBox
      const b = group[j].geometry.boundingBox
      if (a && b && a.intersectsBox(b)) return true
    }
  }
  return false
}
