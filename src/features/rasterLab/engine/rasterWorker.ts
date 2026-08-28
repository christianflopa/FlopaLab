// Worker placeholder para Fase 2
// Será instanciado vía `new Worker(new URL('./rasterWorker.ts', import.meta.url))`
// y recibirá { imageData, params, mono } → postMessage { svgString }

import { traceImageToSvg } from './tracerPipeline'

self.onmessage = async (e: MessageEvent<{ imageData: any; params: any; mono: boolean; maxSide?: number; removeBackground?: boolean }>) => {
  try {
    let { imageData, params, mono, maxSide, removeBackground } = e.data
    if (imageData && !(imageData instanceof ImageData) && imageData.data && imageData.width) {
      const data = imageData.data instanceof Uint8ClampedArray ? imageData.data : new Uint8ClampedArray(imageData.data)
      imageData = new ImageData(data, imageData.width, imageData.height)
    } else if (imageData && imageData.data && !(imageData instanceof ImageData)) {
      imageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
    }
    const svg = await traceImageToSvg(imageData as ImageData, params, mono, (stage) => {
      ;(self as any).postMessage({ type: 'progress', stage })
    }, { maxSide: maxSide ?? 640, removeBackground: !!removeBackground })
    ;(self as any).postMessage({ type: 'done', svgString: svg })
  } catch (err: any) {
    ;(self as any).postMessage({ type: 'error', message: err?.message ?? String(err) })
  }
}
