import { zip, zipSync } from 'fflate'
import type { BufferGeometry } from 'three'
import type { SolidPart } from './validate'
import { downloadBlob } from '../../utils/download'

/**
 * Export 3MF — nomenclatura de objetos (documentación requerida por el usuario)
 * ---------------------------------------------------------------------------
 * Bambu Studio / OrcaSlicer muestran los <object> del 3MF como piezas en el
 * panel "Objetos". La estructura generada es:
 *
 *   <resources>
 *     <object id="2" name="Base" ...>       ← pieza base (siempre "Base")
 *     <object id="3" name="Base_capa2" ...> ← capa auxiliar del bolsillo (si hay
 *                                            distintos `depth` entre diseños)
 *     <object id="4" name="Base_fondo" ...> ← fondo de la base bajo los bolsillos
 *     <object id="N" name="Diseño_1" ...>    ← 1er SVG cargado (genérico, por
 *                                            orden de carga)
 *     <object id="N+1" name="Diseño_2" ...>  ← 2º SVG, etc.
 *     <object id="N+2" name="Diseño_1_2"...> ← si un mismo SVG tiene varios
 *                                            colores asignados, se suffixea
 *                                            _1, _2 para mantener unicidad
 *   </resources>
 *   <object id="composite" name="FlopaLab" type="model">
 *     <components>
 *       <component objectid="2"/> <!-- Base -->
 *       <component objectid="N"/> <!-- Diseño_1 -->
 *     </components>
 *   </object>
 *   <build><item objectid="composite"/></build>
 *
 * - `Base` es siempre el nombre de la pieza base. Las capas auxiliares
 *   conservan prefijo `Base_` para agruparse visualmente en el slicer.
 * - Los diseños usan `Diseño_1`, `Diseño_2`... según el orden en
 *   `store.designs` (orden de carga), no el nombre de archivo original. Esto
 *   evita `FlopaLab`, `FlopaLab_1` genéricos y colisiones de `sanitizeName`.
 * - El compuesto final se llama `FlopaLab` y es el único <item> en <build>;
 *   el slicer lo despliega como ensamblaje "FlopaLab" con sus componentes
 *   listados (Base, Diseño_1, ...). Si dos objetos tuvieran el mismo `name`,
 *   el slicer los renombraría automáticamente a `FlopaLab_1`; con nombres
 *   únicos esto ya no ocurre.
 */

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
const MATERIAL_NS = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/06'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-3dmodel" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`

export function build3mfArchive(parts: SolidPart[]): Uint8Array {
  const modelXml = buildModelXml(parts)
  return zipSync(
    {
      '[Content_Types].xml': strToBytes(CONTENT_TYPES),
      '_rels/.rels': strToBytes(RELATIONSHIPS),
      '3D/3dmodel.model': strToBytes(modelXml),
    },
    { level: 6 },
  )
}

export async function build3mfArchiveAsync(
  parts: SolidPart[],
  onProgress?: (stage: string) => void,
): Promise<Uint8Array> {
  onProgress?.('Generando XML 3MF…')
  await new Promise<void>((r) => setTimeout(r, 0))
  const modelXml = await buildModelXmlAsync(parts, onProgress)
  await new Promise<void>((r) => setTimeout(r, 0))
  onProgress?.('Comprimiendo 3MF…')
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(
      {
        '[Content_Types].xml': strToBytes(CONTENT_TYPES),
        '_rels/.rels': strToBytes(RELATIONSHIPS),
        '3D/3dmodel.model': strToBytes(modelXml),
      },
      { level: 6 },
      (err, data) => {
        if (err) reject(err)
        else resolve(data as Uint8Array)
      },
    )
  })
  return archive
}

export function export3mf(parts: SolidPart[], baseName = 'flopalab') {
  const archive = build3mfArchive(parts)
  downloadBlob(new Blob([archive as unknown as BlobPart], { type: 'model/3mf' }), `${baseName}.3mf`)
}

export async function export3mfAsync(parts: SolidPart[], baseName = 'flopalab', onProgress?: (s: string) => void) {
  const archive = await build3mfArchiveAsync(parts, onProgress)
  downloadBlob(new Blob([archive as unknown as BlobPart], { type: 'model/3mf' }), `${baseName}.3mf`)
}

function buildModelXml(parts: SolidPart[]): string {
  const uniqueColors: string[] = []
  for (const part of parts) {
    const color = part.colorHex.toUpperCase()
    if (!uniqueColors.includes(color)) {
      uniqueColors.push(color)
    }
  }

  const colorIndex = new Map(uniqueColors.map((color, index) => [color, index]))

  const materialsXml = uniqueColors
    .map((color) => `      <m:base name="${escapeXml(color)}" displaycolor="${toDisplayColor(color)}"/>`)
    .join('\n')

  const meshObjectsXml = parts
    .map((part, index) => {
      const pindex = colorIndex.get(part.colorHex.toUpperCase()) ?? 0
      const baseName = escapeXml(part.name)
      const name =
        baseName.toLowerCase() === 'flopalab' ? `${baseName}_parte` : baseName
      return `    <object id="${index + 2}" name="${name}" type="model" pid="1" pindex="${pindex}" requiredextensions="m">
${meshXml(part.geometry)}
    </object>`
    })
    .join('\n')

  const componentsXml = parts
    .map((_, index) => `      <component objectid="${index + 2}"/>`)
    .join('\n')

  const compositeId = parts.length + 2
  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es" xmlns="${CORE_NS}" xmlns:m="${MATERIAL_NS}">
  <resources>
    <m:basematerials id="1">
${materialsXml}
    </m:basematerials>
${meshObjectsXml}
    <object id="${compositeId}" name="FlopaLab" type="model">
      <components>
${componentsXml}
      </components>
    </object>
  </resources>
  <build>
    <item objectid="${compositeId}"/>
  </build>
</model>
`
  return modelXml
}

async function buildModelXmlAsync(
  parts: SolidPart[],
  onProgress?: (stage: string) => void,
): Promise<string> {
  const uniqueColors: string[] = []
  for (const part of parts) {
    const color = part.colorHex.toUpperCase()
    if (!uniqueColors.includes(color)) uniqueColors.push(color)
  }
  const colorIndex = new Map(uniqueColors.map((color, index) => [color, index]))
  const materialsXml = uniqueColors
    .map((color) => `      <m:base name="${escapeXml(color)}" displaycolor="${toDisplayColor(color)}"/>`)
    .join('\n')

  // Construcción incremental para no bloquear UI con 60k+ triángulos ×2 diseños
  const meshObjects: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    onProgress?.(`Generando XML 3MF… pieza ${i + 1}/${parts.length} (${part.name})…`)
    // ceder cada pieza (meshXml itera todos los triángulos)
    if (i % 1 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    const pindex = colorIndex.get(part.colorHex.toUpperCase()) ?? 0
    const baseName = escapeXml(part.name)
    const name = baseName.toLowerCase() === 'flopalab' ? `${baseName}_parte` : baseName
    meshObjects.push(
      `    <object id="${i + 2}" name="${name}" type="model" pid="1" pindex="${pindex}" requiredextensions="m">\n${meshXml(part.geometry)}\n    </object>`,
    )
  }
  const meshObjectsXml = meshObjects.join('\n')
  const componentsXml = parts.map((_, index) => `      <component objectid="${index + 2}"/>`).join('\n')
  const compositeId = parts.length + 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es" xmlns="${CORE_NS}" xmlns:m="${MATERIAL_NS}">
  <resources>
    <m:basematerials id="1">
${materialsXml}
    </m:basematerials>
${meshObjectsXml}
    <object id="${compositeId}" name="FlopaLab" type="model">
      <components>
${componentsXml}
      </components>
    </object>
  </resources>
  <build>
    <item objectid="${compositeId}"/>
  </build>
</model>
`
}

function meshXml(geometry: BufferGeometry): string {
  const vertexKeys: string[] = []
  const vertexIndexByKey = new Map<string, number>()

  const position = geometry.getAttribute('position')
  const vertexIndexFor = (i: number): number => {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`
    let index = vertexIndexByKey.get(key)
    if (index === undefined) {
      index = vertexKeys.length
      vertexIndexByKey.set(key, index)
      vertexKeys.push(key)
    }
    return index
  }

  const triangles: string[] = []
  const pushTriangle = (a: number, b: number, c: number) => {
    triangles.push(
      `<triangle v1="${vertexIndexFor(a)}" v2="${vertexIndexFor(b)}" v3="${vertexIndexFor(c)}"/>`,
    )
  }

  const index = geometry.index
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      pushTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    }
  } else {
    for (let i = 0; i + 2 < position.count; i += 3) {
      pushTriangle(i, i + 1, i + 2)
    }
  }

  return [
    '      <mesh>',
    '        <vertices>',
    ...vertexKeys.map((key) => {
      const [x, y, z] = key.split(',')
      return `          <vertex x="${x}" y="${y}" z="${z}"/>`
    }),
    '        </vertices>',
    '        <triangles>',
    ...triangles.map((line) => `          ${line}`),
    '        </triangles>',
    '      </mesh>',
  ].join('\n')
}

function toDisplayColor(hex: string): string {
  const value = hex.replace('#', '').toUpperCase()
  const six = value.length >= 6 ? value.slice(0, 6) : '000000'
  return `#${six}FF`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function strToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
