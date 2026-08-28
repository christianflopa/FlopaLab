export class SvgCleanEngine {
  private history: string[] = []
  private redoStack: string[] = []
  private currentSvg: string = ''

  load(svgString: string) {
    this.currentSvg = svgString
    this.history = [svgString]
    this.redoStack = []
  }

  getSvg(): string {
    return this.currentSvg
  }

  canUndo(): boolean {
    return this.history.length > 1
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private pushHistory(next: string) {
    this.history.push(next)
    this.currentSvg = next
    this.redoStack = []
  }

  // Elimina el <path> completo con id dado (segmento)
  deleteSegment(segmentId: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(this.currentSvg, 'image/svg+xml')
    const el = doc.getElementById(segmentId)
    if (!el) return this.currentSvg
    el.remove()
    const next = new XMLSerializer().serializeToString(doc.documentElement)
    this.pushHistory(next)
    return next
  }

  // Cambia fill/stroke de un segmento
  recolorSegment(segmentId: string, color: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(this.currentSvg, 'image/svg+xml')
    const el = doc.getElementById(segmentId) as SVGElement | null
    if (!el) return this.currentSvg
    el.setAttribute('fill', color)
    if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
      el.setAttribute('stroke', color)
    }
    const next = new XMLSerializer().serializeToString(doc.documentElement)
    this.pushHistory(next)
    return next
  }

  // Asegura que cada <path>/<circle>/<rect> tenga id para selección
  static ensureIds(svgString: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')
    let counter = 0
    const elements = doc.querySelectorAll('path, circle, rect, ellipse, polygon, polyline')
    elements.forEach((el) => {
      if (!el.id) el.id = `seg-${counter++}`
    })
    return new XMLSerializer().serializeToString(doc.documentElement)
  }

  undo(): string {
    if (!this.canUndo()) return this.currentSvg
    const cur = this.history.pop()!
    this.redoStack.push(cur)
    this.currentSvg = this.history[this.history.length - 1]
    return this.currentSvg
  }

  redo(): string {
    if (!this.canRedo()) return this.currentSvg
    const next = this.redoStack.pop()!
    this.history.push(next)
    this.currentSvg = next
    return next
  }

  reset(): string {
    if (this.history.length === 0) return this.currentSvg
    this.currentSvg = this.history[0]
    this.history = [this.currentSvg]
    this.redoStack = []
    return this.currentSvg
  }

  // Agrega un trazo de pincel como nuevo path SVG
  addBrushStroke(pathData: string, color: string, strokeWidth: number): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(this.currentSvg, 'image/svg+xml')
    const svgEl = doc.documentElement
    
    // Crear nuevo path para el trazo del pincel
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', color)
    path.setAttribute('stroke-width', strokeWidth.toString())
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('id', `brush-${Date.now()}`)
    
    svgEl.appendChild(path)
    
    const next = new XMLSerializer().serializeToString(doc.documentElement)
    this.pushHistory(next)
    return next
  }
}
