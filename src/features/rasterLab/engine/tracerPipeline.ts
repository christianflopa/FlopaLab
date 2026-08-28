import type { TracerParams } from '../types'

// Import imagetracerjs (CommonJS -> interop)
// @ts-ignore
import * as ImageTracerModule from 'imagetracerjs/imagetracer_v1.2.6.js'

// Resolver el export: puede ser default, module.exports, o global
const ImageTracer: any =
  (ImageTracerModule as any).default ??
  (ImageTracerModule as any).ImageTracer ??
  (ImageTracerModule as any) ??
  (globalThis as any).ImageTracer

function getImageTracer(): any {
  if (ImageTracer && typeof ImageTracer.imagedataToSVG === 'function') return ImageTracer
  // fallback global
  const g = (globalThis as any).ImageTracer
  if (g && typeof g.imagedataToSVG === 'function') return g
  throw new Error('ImageTracer no disponible')
}

// Pre-procesado con Canvas 2D (sin opencv para mantener bundle ligero)
// - grayscale, blur, threshold, sobel para modos Borde
function cloneImageData(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
}

function toGrayscale(img: ImageData): void {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
  }
}

function applyThreshold(img: ImageData, threshold: number): void {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

function applyInvert(img: ImageData): void {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]
    d[i + 1] = 255 - d[i + 1]
    d[i + 2] = 255 - d[i + 2]
  }
}

// Box blur simple (rápido, suficiente para presets)
function applyBoxBlur(img: ImageData, radius: number): void {
  if (radius <= 0) return
  const w = img.width, h = img.height
  const src = new Uint8ClampedArray(img.data)
  const r = Math.round(radius)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, cnt = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          const idx = (ny * w + nx) * 4
          rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; cnt++
        }
      }
      const idx = (y * w + x) * 4
      img.data[idx] = rs / cnt
      img.data[idx + 1] = gs / cnt
      img.data[idx + 2] = bs / cnt
    }
  }
}

// Sobel para modos Borde (solo trazo)
function applySobel(img: ImageData): void {
  const w = img.width, h = img.height
  const src = new Uint8ClampedArray(img.data)
  const out = new Uint8ClampedArray(img.data.length)
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4
          const g = src[idx] // ya en grayscale
          const k = (ky + 1) * 3 + (kx + 1)
          sx += g * gx[k]
          sy += g * gy[k]
        }
      }
      const mag = Math.min(255, Math.sqrt(sx * sx + sy * sy))
      const idx = (y * w + x) * 4
      out[idx] = out[idx + 1] = out[idx + 2] = mag
      out[idx + 3] = 255
    }
  }
  img.data.set(out)
}

function getCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') {
    return new OffscreenCanvas(width, height) as any
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

function resizeIfNeeded(img: ImageData, maxSide = 800): ImageData {
  const { width, height } = img
  if (width <= maxSide && height <= maxSide) return img
  const scale = Math.min(maxSide / width, maxSide / height)
  const nw = Math.round(width * scale)
  const nh = Math.round(height * scale)
  const canvas: any = getCanvas(nw, nh)
  const ctx = canvas.getContext('2d')!
  // crear canvas temporal con img original
  const tmp: any = getCanvas(width, height)
  tmp.getContext('2d')!.putImageData(img, 0, 0)
  ctx.drawImage(tmp, 0, 0, width, height, 0, 0, nw, nh)
  return ctx.getImageData(0, 0, nw, nh)
}

function buildImagetracerOptions(params: TracerParams, mono: boolean, removeBackground?: boolean): any {
  const isStroke = params.strokeWidth > 0
  // Si mono + eliminar fondo, generar solo negro (como PNG sin fondo)
  if (mono && removeBackground) {
    return {
      ltres: params.alphamax > 1 ? 0.5 : 1,
      qtres: params.alphamax > 1 ? 0.5 : 1,
      pathomit: Math.max(0, params.turdSize),
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 1,
      mincolorratio: 0,
      colorquantcycles: 1,
      layering: 0,
      strokewidth: isStroke ? params.strokeWidth : 0,
      linefilter: isStroke,
      scale: 1,
      roundcoords: 1,
      viewbox: true,
      desc: false,
      blurradius: 0,
      blurdelta: 20,
      pal: [{ r: 0, g: 0, b: 0, a: 255 }],
    }
  }
  if (mono) {
    // Monocromo: 2 colores (blanco/negro), sin blur por defecto (ya preprocesado)
    return {
      ltres: params.alphamax > 1 ? 0.5 : 1,
      qtres: params.alphamax > 1 ? 0.5 : 1,
      pathomit: Math.max(0, params.turdSize),
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 2,
      mincolorratio: 0,
      colorquantcycles: 1,
      layering: 0,
      strokewidth: isStroke ? params.strokeWidth : 0,
      linefilter: isStroke,
      scale: 1,
      roundcoords: 1,
      viewbox: true,
      desc: false,
      blurradius: 0,
      blurdelta: 20,
    }
  } else {
    // Color: cuantización
    return {
      ltres: 1,
      qtres: 1,
      pathomit: params.turdSize,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: 16,
      mincolorratio: 0,
      colorquantcycles: 3,
      layering: 0,
      strokewidth: params.strokeWidth || 0,
      linefilter: false,
      scale: 1,
      roundcoords: 1,
      viewbox: true,
      desc: false,
      blurradius: params.blur > 0 ? Math.round(params.blur) : 0,
      blurdelta: 20,
    }
  }
}

export async function traceImageToSvg(
  imageData: ImageData,
  params: TracerParams,
  mono: boolean,
  onProgress?: (stage: string) => void,
  options?: { maxSide?: number; removeBackground?: boolean },
): Promise<string> {
  onProgress?.('Preprocesando imagen…')
  await new Promise<void>((r) => setTimeout(r, 0))

  // Clonar y preprocesar — tamaño adaptativo: 640 por defecto para <2s, 1024 en alta calidad
  const maxSide = options?.maxSide ?? 640
  let processed = cloneImageData(imageData)
  processed = resizeIfNeeded(processed, maxSide)
  await new Promise<void>((r) => setTimeout(r, 0))

  // Blur
  if (params.blur > 0) {
    applyBoxBlur(processed, params.blur)
    await new Promise<void>((r) => setTimeout(r, 0))
  }

  const isBorde = params.strokeWidth > 0 && mono

  if (mono) {
    toGrayscale(processed)
    if (isBorde) {
      onProgress?.('Detectando bordes…')
      await new Promise<void>((r) => setTimeout(r, 0))
      applySobel(processed)
      // Umbralizar bordes
      applyThreshold(processed, params.threshold ?? 128)
    } else {
      applyThreshold(processed, params.threshold)
    }
    if (params.invert) applyInvert(processed)
  } else {
    // Color: si hay blur ya aplicado, no threshold
    if (params.invert) {
      toGrayscale(processed)
      applyInvert(processed)
    }
  }

  onProgress?.('Vectorizando…')
  await new Promise<void>((r) => setTimeout(r, 0))

  const tracer = getImageTracer()
  const opts = buildImagetracerOptions(params, mono, options?.removeBackground)

  // imagetracer es sincrónico pero puede tardar 500ms-2s con imágenes grandes
  // Lo ejecutamos en el mismo hilo pero ya cedimos; para 2 SVGs el worker lo hará off-thread
  const svgString: string = tracer.imagedataToSVG(processed as any, opts as any)

  // Asegurar viewBox y fondo transparente, normalizar fill/stroke para mono
  // imagetracer ya genera viewBox si viewbox:true
  return svgString
}

export async function loadImageData(file: File): Promise<{ dataUrl: string; imageData: ImageData; width: number; height: number }> {
  const valid = /image\/(png|jpeg|jpg|webp)/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
  if (!valid) throw new Error('Formato no soportado. Usa PNG, JPG o WEBP.')

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    el.src = dataUrl
  })

  // Validar tamaño antes de procesar (evitar OOM con imágenes 8k)
  if (img.naturalWidth > 4000 || img.naturalHeight > 4000) {
    console.warn('Imagen muy grande, se redimensionará a 800px para trazado')
  }

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  return { dataUrl, imageData, width: canvas.width, height: canvas.height }
}
