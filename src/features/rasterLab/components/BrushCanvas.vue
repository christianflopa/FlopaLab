<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  color: string
  strokeWidth: number
  zoom: number
}>()

const emit = defineEmits<{
  'stroke-complete': [pathData: string]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const points: Array<{ x: number; y: number }> = []

let ctx: CanvasRenderingContext2D | null = null

function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const parent = canvas.parentElement
  if (!parent) return
  
  // Usar el tamaño del contenedor padre
  canvas.width = parent.clientWidth
  canvas.height = parent.clientHeight
  
  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
}

function getMousePos(e: MouseEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function startDrawing(e: MouseEvent) {
  if (e.button !== 0) return // Solo click izquierdo
  
  isDrawing.value = true
  points.length = 0
  
  const pos = getMousePos(e)
  points.push(pos)
  
  if (ctx) {
    ctx.strokeStyle = props.color
    ctx.lineWidth = props.strokeWidth
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }
}

function draw(e: MouseEvent) {
  if (!isDrawing.value || !ctx) return
  
  const pos = getMousePos(e)
  points.push(pos)
  
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
}

function stopDrawing() {
  if (!isDrawing.value) return
  
  isDrawing.value = false
  
  // Generar path SVG si hay suficientes puntos
  if (points.length >= 2) {
    const pathData = generateSvgPath()
    emit('stroke-complete', pathData)
  }
  
  // Limpiar canvas
  clearCanvas()
  points.length = 0
}

function generateSvgPath(): string {
  if (points.length < 2) return ''
  
  // El SVG tiene viewBox de 100x100 y se renderiza con zoom
  // Necesitamos convertir las coordenadas del canvas al espacio del SVG
  const canvas = canvasRef.value
  if (!canvas) return ''
  
  // El SVG se renderiza con max-width: 560px y max-height: 560px
  // y se escala con transform: scale(zoom)
  // Asumimos que el SVG ocupa el tamaño del canvas (después del padding)
  const svgDisplayWidth = canvas.width
  const svgDisplayHeight = canvas.height
  
  // Factor de escala: de píxeles del canvas a unidades del SVG (viewBox 100x100)
  const scaleX = 100 / svgDisplayWidth
  const scaleY = 100 / svgDisplayHeight
  
  // Simplificar el path usando interpolación lineal
  const step = Math.max(1, Math.floor(points.length / 50))
  
  let path = `M ${points[0].x * scaleX} ${points[0].y * scaleY}`
  
  for (let i = step; i < points.length; i += step) {
    const p = points[i]
    path += ` L ${p.x * scaleX} ${p.y * scaleY}`
  }
  
  // Asegurar que el último punto esté incluido
  const last = points[points.length - 1]
  path += ` L ${last.x * scaleX} ${last.y * scaleY}`
  
  return path
}

function clearCanvas() {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
}

// Watch para cambios de zoom o dimensiones
watch(() => props.zoom, () => {
  // No necesitamos redimensionar el canvas, solo considerar el zoom al generar el path
})

onMounted(() => {
  initCanvas()
  
  // Agregar event listeners
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('mousedown', startDrawing)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDrawing)
    canvas.addEventListener('mouseleave', stopDrawing)
  }
  
  // Redimensionar canvas si cambia el tamaño del contenedor
  const resizeObserver = new ResizeObserver(() => {
    initCanvas()
  })
  
  const parent = canvas?.parentElement
  if (parent) {
    resizeObserver.observe(parent)
  }
  
  onBeforeUnmount(() => {
    if (canvas) {
      canvas.removeEventListener('mousedown', startDrawing)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDrawing)
      canvas.removeEventListener('mouseleave', stopDrawing)
    }
    resizeObserver.disconnect()
  })
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="brush-canvas"
  ></canvas>
</template>

<style scoped>
.brush-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 10;
}
</style>
