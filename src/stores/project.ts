import { defineStore } from 'pinia'
import type { BaseObject } from '../models/BaseObject'
import { clampBaseValues, createDefaultBaseObject } from '../models/BaseObject'
import type { SvgDesign } from '../models/SvgDesign'
import type { ParsedSvg } from '../models/ParsedSvg'
import { LIMITS } from '../engine/constants'
import {
  invalidateDesignGeometries,
} from '../engine/geometry/designGeometry'
import { removeParsedSvg } from '../engine/svg/svgCache'

const EPSILON = 1e-6
const MIN_DEPTH = 0.1
const FIT_MARGIN_RATIO = 0.92

export type StatusKind = 'info' | 'error' | 'success'

export type TransformMode = 'translate' | 'rotate' | 'scale'

export interface ViewRequest {
  view: 'face' | 'profile' | 'reset'
  nonce: number
}

interface ProjectState {
  base: BaseObject
  designs: SvgDesign[]
  selectedDesignId: string | null
  previewMode: boolean
  transformMode: TransformMode
  statusMessage: string
  statusKind: StatusKind
  viewRequest: ViewRequest
}

let designCounter = 0

function createDesignId() {
  designCounter += 1
  return `design-${Date.now().toString(36)}-${designCounter}`
}

function clampDepth(value: number, thickness: number) {
  return Math.min(Math.max(value, MIN_DEPTH), thickness)
}

export const useProjectStore = defineStore('project', {
  state: (): ProjectState => ({
    base: createDefaultBaseObject(),
    designs: [],
    selectedDesignId: null,
    previewMode: false,
    transformMode: 'translate',
    statusMessage: '',
    statusKind: 'info',
    viewRequest: { view: 'reset', nonce: 0 },
  }),

  getters: {
    selectedDesign(state): SvgDesign | null {
      return state.designs.find((design) => design.id === state.selectedDesignId) ?? null
    },
    extendsToSurface(state) {
      return (design: SvgDesign) => design.depth >= state.base.thickness - LIMITS.maxDepthOverThicknessTolerance
    },
    uniqueAssignedColors(state): string[] {
      const colors = new Set<string>()
      for (const design of state.designs) {
        if (!design.visible) continue
        for (const mapping of design.colors) {
          colors.add(mapping.assignedColor.toUpperCase())
        }
      }
      return [...colors]
    },
  },

  actions: {
    setStatus(message: string, kind: StatusKind = 'info') {
      this.statusMessage = message
      this.statusKind = kind
    },

    requestView(view: ViewRequest['view']) {
      this.viewRequest = { view, nonce: this.viewRequest.nonce + 1 }
    },

    setTransformMode(mode: TransformMode) {
      this.transformMode = mode
    },

    updateBase(patch: Partial<BaseObject>) {
      this.base = clampBaseValues({ ...this.base, ...patch })

      let depthClamped = false
      for (const design of this.designs) {
        if (design.depth > this.base.thickness + EPSILON) {
          design.depth = this.base.thickness
          depthClamped = true
        }
      }
      if (depthClamped) {
        this.setStatus('La profundidad de algunos diseños se ajustó al nuevo grosor.', 'info')
      }
    },

    addDesign(name: string, parsed: ParsedSvg): SvgDesign {
      const id = createDesignId()
      const fitScale = Math.min(
        (this.base.width * FIT_MARGIN_RATIO) / parsed.width,
        (this.base.height * FIT_MARGIN_RATIO) / parsed.height,
        1,
      )
      const initialScale = Math.max(fitScale, LIMITS.minDesignScale)
      const design: SvgDesign = {
        id,
        name,
        position: { x: 0, y: 0 },
        scaleX: initialScale,
        scaleY: initialScale,
        uniformScale: true,
        rotationDeg: 0,
        depth: Math.min(0.2, this.base.thickness),
        visible: true,
        colors: parsed.regions.map((region) => ({
          originalColor: region.originalColor,
          assignedColor: region.originalColor,
        })),
      }
      this.designs.push(design)
      this.selectedDesignId = id
      this.previewMode = false

      const notes: string[] = []
      if (fitScale < LIMITS.minDesignScale) {
        notes.push(
          `muy grande para la base; se aplicó la escala mínima (${Math.round(LIMITS.minDesignScale * 1000) / 10}%) y el diseño puede recortarse en los bordes`,
        )
      }
      notes.push(...parsed.warnings)
      if (notes.length > 0) {
        this.setStatus(`${name}: ${notes.join(' ')}`, 'info')
      } else {
        this.setStatus(`${name} cargado (${parsed.regions.length} color/es).`, 'success')
      }

      return design
    },

    selectDesign(id: string | null) {
      this.selectedDesignId = id
    },

    removeDesign(id: string) {
      invalidateDesignGeometries(id)
      removeParsedSvg(id)
      this.designs = this.designs.filter((design) => design.id !== id)
      if (this.selectedDesignId === id) {
        this.selectedDesignId = this.designs[0]?.id ?? null
      }
    },

    setPosition(x: number, y: number) {
      const design = this.selectedDesign
      if (!design) return
      design.position = { x, y }
    },

    moveBy(dx: number, dy: number) {
      const design = this.selectedDesign
      if (!design) return
      design.position = { x: design.position.x + dx, y: design.position.y + dy }
    },

    setScale(axis: 'x' | 'y', value: number) {
      const design = this.selectedDesign
      if (!design) return
      const clamped = Math.min(Math.max(value, LIMITS.minDesignScale), LIMITS.maxDesignScale)
      if (design.uniformScale) {
        design.scaleX = clamped
        design.scaleY = clamped
      } else if (axis === 'x') {
        design.scaleX = clamped
      } else {
        design.scaleY = clamped
      }
    },

    setUniformScale(enabled: boolean) {
      const design = this.selectedDesign
      if (!design) return
      design.uniformScale = enabled
      if (enabled) {
        design.scaleY = design.scaleX
      }
    },

    syncScaleFromTransform(scaleX: number, scaleY: number) {
      const design = this.selectedDesign
      if (!design) return
      design.scaleX = Math.min(Math.max(scaleX, LIMITS.minDesignScale), LIMITS.maxDesignScale)
      if (design.uniformScale) {
        design.scaleY = design.scaleX
      } else {
        design.scaleY = Math.min(Math.max(scaleY, LIMITS.minDesignScale), LIMITS.maxDesignScale)
      }
    },

    setRotation(deg: number) {
      const design = this.selectedDesign
      if (!design) return
      const normalized = ((deg % 360) + 360) % 360
      design.rotationDeg = normalized
    },

    rotateBy(deltaDeg: number) {
      const design = this.selectedDesign
      if (!design) return
      this.setRotation(design.rotationDeg + deltaDeg)
    },

    resetDesignTransform() {
      const design = this.selectedDesign
      if (!design) return
      design.position = { x: 0, y: 0 }
      design.scaleX = 1
      design.scaleY = 1
      design.rotationDeg = 0
    },

    setDepth(value: number) {
      const design = this.selectedDesign
      if (!design) return
      design.depth = clampDepth(value, this.base.thickness)
    },

    setColorMapping(designId: string, originalColor: string, assignedColor: string) {
      const design = this.designs.find((item) => item.id === designId)
      if (!design) return
      const mapping = design.colors.find((item) => item.originalColor === originalColor)
      if (mapping) {
        mapping.assignedColor = assignedColor
      }
    },

    toggleVisible(id: string) {
      const design = this.designs.find((item) => item.id === id)
      if (design) {
        design.visible = !design.visible
      }
    },

    togglePreview() {
      this.previewMode = !this.previewMode
    },
  },
})
