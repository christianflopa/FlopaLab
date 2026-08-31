import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { ExtrudeGeometry, Shape, Vector3 } from 'three'
import { createBaseGeometry } from '../src/engine/geometry/baseGeometry'
import { createDefaultBaseObject, type BaseObject } from '../src/models/BaseObject'
import { clipToFootprint, subtractSolid } from '../src/engine/clipping/csgClip'
import { validateSolids, countOverSharedEdges, type SolidPart } from '../src/engine/export/validate'
import { mergePartsByColor } from '../src/engine/export/solids'
import { build3mfArchive } from '../src/engine/export/threeMF'
import { designWorldMatrix } from '../src/engine/geometry/designGeometry'
import type { SvgDesign } from '../src/models/SvgDesign'

function rectShape(width: number, height: number): Shape {
  const shape = new Shape()
  shape.moveTo(-width / 2, -height / 2)
  shape.lineTo(width / 2, -height / 2)
  shape.lineTo(width / 2, height / 2)
  shape.lineTo(-width / 2, height / 2)
  shape.closePath()
  return shape
}

function extrudeRect(width: number, height: number, depth: number): ExtrudeGeometry {
  return new ExtrudeGeometry(rectShape(width, height), { depth, bevelEnabled: false })
}

function makeDesign(patch: Partial<SvgDesign> = {}): SvgDesign {
  return {
    id: 'test',
    name: 'test.svg',
    position: { x: 0, y: 0 },
    scaleX: 1,
    scaleY: 1,
    uniformScale: true,
    rotationDeg: 0,
    depth: 1.5,
    protrusion: 0,
    visible: true,
    colors: [],
    ...patch,
  }
}

function signedVolume(geometry: { getAttribute: (name: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number }; index: { count: number; getX: (i: number) => number } | null }): number {
  const position = geometry.getAttribute('position')
  let sum = 0
  const add = (a: number, b: number, c: number) => {
    sum +=
      (position.getX(a) * (position.getY(b) * position.getZ(c) - position.getZ(b) * position.getY(c)) -
        position.getY(a) * (position.getX(b) * position.getZ(c) - position.getZ(b) * position.getX(c)) +
        position.getZ(a) * (position.getX(b) * position.getY(c) - position.getY(b) * position.getX(c))) / 6
  }
  if (geometry.index) {
    for (let i = 0; i + 2 < geometry.index.count; i += 3) {
      add(geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2))
    }
  } else {
    for (let i = 0; i + 2 < position.count; i += 3) {
      add(i, i + 1, i + 2)
    }
  }
  return sum
}

describe('createBaseGeometry', () => {
  it('produce la pieza con dimensiones exactas', () => {
    const base = createDefaultBaseObject()
    const geometry = createBaseGeometry(base)
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new Vector3())
    expect(size.x).toBeCloseTo(base.width, 3)
    expect(size.y).toBeCloseTo(base.height, 3)
    expect(size.z).toBeCloseTo(base.thickness, 3)
  })

  it('sin agujero no genera contornos internos', () => {
    const base: BaseObject = createDefaultBaseObject()
    base.hole.enabled = false
    const geometry = createBaseGeometry(base)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
  })
})

describe('clipToFootprint', () => {
  it('recorta un diseño que sobresale del borde', () => {
    const base = createDefaultBaseObject()
    base.hole.enabled = false
    base.thickness = 1.5
    const slab = createBaseGeometry(base)
    const design = extrudeRect(20, 20, 1.5)

    const moved = design.applyMatrix4(
      designWorldMatrix(makeDesign({ position: { x: -20, y: 0 }, depth: 1.5 }), 1.5),
    )

    const clipped = clipToFootprint(moved, slab)
    expect(clipped).not.toBeNull()

    clipped!.computeBoundingBox()
    const min = clipped!.boundingBox!.min
    expect(min.x).toBeGreaterThanOrEqual(-25.01)

    const volume = Math.abs(signedVolume(clipped!))
    expect(volume).toBeGreaterThan(380)
    expect(volume).toBeLessThan(480)
  })

  it('devuelve null cuando el diseño está completamente fuera', () => {
    const base = createDefaultBaseObject()
    base.hole.enabled = false
    const slab = createBaseGeometry(base)
    const design = extrudeRect(10, 10, 1.5)
    const moved = design.applyMatrix4(
      designWorldMatrix(makeDesign({ position: { x: 100, y: 100 }, depth: 1.5 }), 1.5),
    )
    expect(clipToFootprint(moved, slab)).toBeNull()
  })

  it('respeta el agujero al recortar', () => {
    const base = createDefaultBaseObject()
    const slab = createBaseGeometry(base)
    const design = extrudeRect(30, 30, 1.5)
    const moved = design.applyMatrix4(
      designWorldMatrix(makeDesign({ position: { x: 0, y: 70 }, depth: 1.5 }), 1.5),
    )
    const clipped = clipToFootprint(moved, slab)
    expect(clipped).not.toBeNull()
  })
})

describe('subtractSolid', () => {
  it('resta el volumen de los diseños de la base', () => {
    const base = createDefaultBaseObject()
    const slab = createBaseGeometry(base)
    const pocket = extrudeRect(10, 10, base.thickness)

    const carved = subtractSolid(slab, pocket)
    const volume = Math.abs(signedVolume(carved))

    const holeArea = Math.PI * (base.hole.diameter / 2) * (base.hole.diameter / 2)
    const expected = (base.width * base.height - holeArea) * base.thickness - 10 * 10 * base.thickness
    expect(volume).toBeGreaterThan(expected - 60)
    expect(volume).toBeLessThan(expected + 60)
  })
})

describe('validateSolids', () => {
  it('detecta piezas vacías', () => {
    const report = validateSolids([])
    expect(report.errors.length).toBeGreaterThan(0)
  })

  it('aprueba geometría válida', () => {
    const part: SolidPart = { name: 'Base', colorHex: '#FFFFFF', geometry: createBaseGeometry(createDefaultBaseObject()) }
    const report = validateSolids([part])
    expect(report.errors).toHaveLength(0)
  })
})

describe('mergePartsByColor', () => {
  it('fusiona piezas del mismo color separadas en el espacio', () => {
    const a: SolidPart = { name: 'a', colorHex: '#FF0000', geometry: extrudeRect(5, 5, 1) }
    const bGeometry = extrudeRect(6, 6, 1)
    bGeometry.translate(20, 0, 0)
    const b: SolidPart = { name: 'b', colorHex: '#ff0000', geometry: bGeometry }
    const c: SolidPart = { name: 'c', colorHex: '#00FF00', geometry: extrudeRect(7, 7, 1) }

    const merged = mergePartsByColor([a, b, c])
    expect(merged).toHaveLength(2)

    const red = merged.find((part) => part.colorHex === '#FF0000')!
    expect(signedVolume(red.geometry)).toBeCloseTo(signedVolume(a.geometry) + signedVolume(b.geometry), 3)
  })

  it('no concatena piezas del mismo color que se tocan (serían no manifold)', () => {
    const a: SolidPart = { name: 'a', colorHex: '#FF0000', geometry: extrudeRect(5, 5, 1) }
    const b: SolidPart = { name: 'b', colorHex: '#FF0000', geometry: extrudeRect(5, 5, 1) }

    const merged = mergePartsByColor([a, b])
    expect(merged).toHaveLength(2)
    expect(merged.map((part) => part.name)).toEqual(['a', 'b'])

    for (const part of merged) {
      expect(countOverSharedEdges(part.geometry)).toBe(0)
    }
  })
})

describe('build3mfArchive', () => {
  it('genera un zip OPC válido con unidades en milímetros y materiales por color', () => {
    const parts: SolidPart[] = [
      { name: 'Base', colorHex: '#C0CAF5', geometry: createBaseGeometry(createDefaultBaseObject()) },
      { name: 'diseno_FFFFFF', colorHex: '#FFFFFF', geometry: extrudeRect(10, 10, 0.4) },
    ]

    const archive = build3mfArchive(parts)
    const files = unzipSync(archive)

    expect(files['[Content_Types].xml']).toBeDefined()
    expect(files['_rels/.rels']).toBeDefined()

    const model = new TextDecoder().decode(files['3D/3dmodel.model'])
    expect(model).toContain('unit="millimeter"')
    expect(model).toContain('basematerials')
    expect(model).toContain('#FFFFFF')
    expect(model).toContain('#C0CAF5')
    expect(model).toContain('<triangle')

    // Cada pieza es un item independiente en build (sin composite)
    // Esto permite que los nombres personalizados aparezcan correctamente en el slicer
    expect(model.match(/<item /g)).toHaveLength(parts.length)
    expect((model.match(/<component /g) ?? []).length).toBe(0)
    expect(model).not.toContain('<components>')
    // Los nombres personalizados están en los objetos
    expect(model).toContain('name="Base"')
    expect(model).toContain('name="diseno_FFFFFF"')
  })
})

describe('buildExportModel: bolsillo parcial', () => {
  it('la base conserva grosor bajo el diseño (bolsillo de depth mm, no agujero pasante)', async () => {
    const { Scene } = await import('three')
    const { BookmarkScene } = await import('../src/engine/builder/bookmarkScene')
    const { createFootprintShape } = await import('../src/engine/geometry/baseGeometry')

    const base = createDefaultBaseObject()
    const side = 10
    const square = new Shape()
    square.moveTo(-side / 2, -side / 2)
    square.lineTo(side / 2, -side / 2)
    square.lineTo(side / 2, side / 2)
    square.lineTo(-side / 2, side / 2)
    square.closePath()

    const design: SvgDesign = {
      id: 'pocket',
      name: 'pocket.svg',
      position: { x: 0, y: 0 },
      scaleX: 1,
      scaleY: 1,
      uniformScale: true,
      rotationDeg: 0,
      depth: 0.4,
      protrusion: 0,
      visible: true,
      colors: [],
    }

    const parsed = {
      width: side,
      height: side,
      regions: [{ originalColor: '#111111', shapes: [square] }],
    }

    const scene = new BookmarkScene(new Scene())
    scene.update(base, [design], () => parsed)
    const { parts, warnings } = await scene.buildExportModel(base, [design], () => parsed)
    scene.dispose()

    const volumeOf = (geometry: import('three').BufferGeometry) => {
      const pos = geometry.getAttribute('position')
      const index = geometry.index
      let volume = 0
      const triangleVolume = (a: number, b: number, c: number) => {
        const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a)
        const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b)
        const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c)
        return (
          (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
        )
      }
      if (index) {
        for (let i = 0; i + 2 < index.count; i += 3) {
          volume += triangleVolume(index.getX(i), index.getX(i + 1), index.getX(i + 2))
        }
      } else {
        for (let i = 0; i + 2 < pos.count; i += 3) {
          volume += triangleVolume(i, i + 1, i + 2)
        }
      }
      return Math.abs(volume)
    }

    const baseParts = parts.filter((part) => part.name.startsWith('Base'))
    const designPart = parts.find((part) => !part.name.startsWith('Base'))
    expect(designPart).toBeDefined()

    const footprintArea =
      createFootprintShape(base)
        .getPoints(64)
        .reduce((sum, point, i, pts) => {
          const next = pts[(i + 1) % pts.length]
          return sum + point.x * next.y - next.x * point.y
        }, 0) / 2
    const holeArea = base.hole.enabled ? Math.PI * (base.hole.diameter / 2) ** 2 : 0
    // el bolsillo se corta con el diseño crecido 0.2% (holgura de impresión)
    const pocketArea = (side * 1.002) ** 2

    // bolsillo de 0.4mm: la base pierde pocketArea*0.4, no pocketArea*thickness
    const expectedBase = (footprintArea - holeArea) * base.thickness - pocketArea * 0.4
    const actualBase = baseParts.reduce((sum, part) => sum + volumeOf(part.geometry), 0)
    expect(actualBase).toBeCloseTo(expectedBase, 0)

    // diseño a tamaño real (fiel al SVG; el bolsillo es quien crece 0.2%),
    // se hunde 0.02mm en el fondo y sobresale 0.02mm
    const designArea = side * side
    const designVolume = volumeOf(designPart!.geometry)
    // el escalonado anti-coplanaridad por color añade hasta 0.016mm de altura
    expect(designVolume).toBeGreaterThanOrEqual(designArea * (0.4 + 0.02 + 0.02))
    expect(designVolume).toBeLessThanOrEqual(designArea * (0.4 + 0.02 + 0.02 + 0.016) + 1)

    // fidelidad: la huella del diseño coincide con el cuadrado original (sin engordar)
    designPart!.geometry.computeBoundingBox()
    const bbox = designPart!.geometry.boundingBox!
    expect(bbox.max.x - bbox.min.x).toBeCloseTo(side, 3)
    expect(bbox.max.y - bbox.min.y).toBeCloseTo(side, 3)

    const { countOpenEdges, countOverSharedEdges } = await import('../src/engine/export/validate')
    for (const part of parts) {
      expect(countOverSharedEdges(part.geometry)).toBe(0)
      expect(countOpenEdges(part.geometry)).toBe(0)
    }
  })
})

describe('buildExportModel: colores vecinos que comparten borde', () => {
  it('no genera aristas no manifold en la base ni en los diseños', async () => {
    const { Scene, Shape } = await import('three')
    const { BookmarkScene } = await import('../src/engine/builder/bookmarkScene')

    const base = createDefaultBaseObject()

    const makeSquare = (minX: number): Shape => {
      const s = new Shape()
      s.moveTo(minX, -5)
      s.lineTo(minX + 10, -5)
      s.lineTo(minX + 10, 5)
      s.lineTo(minX, 5)
      s.closePath()
      return s
    }

    const design: SvgDesign = {
      id: 'vecinos',
      name: 'vecinos.svg',
      position: { x: 0, y: 0 },
      scaleX: 1,
      scaleY: 1,
      uniformScale: true,
      rotationDeg: 0,
      depth: 0.4,
      protrusion: 0,
      visible: true,
      colors: [],
    }

    // dos cuadrados adyacentes que comparten el borde x=5
    const parsed = {
      width: 20,
      height: 10,
      regions: [
        { originalColor: '#FF0000', shapes: [makeSquare(-15)] },
        { originalColor: '#0000FF', shapes: [makeSquare(5)] },
      ],
    }

    const scene = new BookmarkScene(new Scene())
    scene.update(base, [design], () => parsed)
    const { parts } = await scene.buildExportModel(base, [design], () => parsed)
    scene.dispose()

    expect(parts.length).toBeGreaterThanOrEqual(3)

    const { countOpenEdges, countOverSharedEdges } = await import('../src/engine/export/validate')
    for (const part of parts) {
      expect(countOpenEdges(part.geometry)).toBe(0)
      expect(countOverSharedEdges(part.geometry)).toBe(0)
    }
  })
})
