import { ExtrudeGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import type { SvgDesign } from '../../models/SvgDesign'
import type { SvgRegion } from '../../models/ParsedSvg'

export interface DesignGeometryCacheEntry {
  depth: number
  geometries: Map<string, ExtrudeGeometry>
}

const extrudedByDesign = new Map<string, DesignGeometryCacheEntry>()

export function ensureDesignGeometries(
  designId: string,
  regions: SvgRegion[],
  depth: number,
): Map<string, ExtrudeGeometry> {
  const existing = extrudedByDesign.get(designId)
  if (existing && existing.depth === depth) {
    return existing.geometries
  }

  if (existing) {
    disposeEntry(existing)
  }

  const geometries = new Map<string, ExtrudeGeometry>()
  for (const region of regions) {
    if (region.shapes.length === 0) continue
    const geometry = new ExtrudeGeometry(region.shapes, {
      depth,
      bevelEnabled: false,
    })
    geometries.set(region.originalColor, geometry)
  }

  extrudedByDesign.set(designId, { depth, geometries })
  return geometries
}

export function invalidateDesignGeometries(designId: string) {
  const entry = extrudedByDesign.get(designId)
  if (entry) {
    disposeEntry(entry)
    extrudedByDesign.delete(designId)
  }
}

export function disposeAllDesignGeometries() {
  for (const entry of extrudedByDesign.values()) {
    disposeEntry(entry)
  }
  extrudedByDesign.clear()
}

function disposeEntry(entry: DesignGeometryCacheEntry) {
  for (const geometry of entry.geometries.values()) {
    geometry.dispose()
  }
  entry.geometries.clear()
}

export function designWorldMatrix(design: SvgDesign, thickness: number): Matrix4 {
  return new Matrix4().compose(
    new Vector3(design.position.x, design.position.y, Math.max(0, thickness - design.depth)),
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (design.rotationDeg * Math.PI) / 180),
    new Vector3(design.scaleX, design.scaleY, 1),
  )
}
