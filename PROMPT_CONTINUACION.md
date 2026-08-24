# PROMPT DE CONTINUACIÓN — FlopaLab (bug de aristas abiertas en bolsillos múltiples)

Pega esto como primer mensaje del nuevo chat:

---

## Objetivo
App "FlopaLab" en `/Users/christianflores/Proyectos/FlopaLab` (Vue 3 + TS + Vite + Three.js): convierte SVGs multicolor (potrace) en separadores de libros 3D imprimibles. Flujo: cargar SVG → recortar al footprint de la base → extruir colores por profundidad → exportar UN objeto 3MF multicolor que Bambu Studio abra sin warnings.

## Estado actual (verificado hoy)
- Suite: **29/30 tests verdes**, build OK. `npx vue-tsc --noEmit` limpio.
- **frieren.svg (SVG real del usuario) exporta PERFECTO**: `abiertas=0 noManifold=0 avisos=0`, 41ms, piezas=3.
- ÚNICO fallo: `tests/pipeline.test.ts` > "colores vecinos que comparten borde" > Base tiene **open=8**. Es un caso sintético: dos bolsillos cuadrados x∈[-15,-5] y [5,15] (¡ojo: el comentario del test dice que comparten borde en x=5 pero hay un hueco de 10mm entre -5 y 5!), depth=0.4 sobre base 50×150×1.5.
- El usuario debe recargar la app: la fidelidad visual está restaurada (una iteración intermedia con tapas por "losas" la rompió y ya se revirtió).

## Causa raíz ACREDITADA (no especulada)
`THREE.ShapeUtils.triangulateShape` (earcut) genera triángulos-puente espurios cuando un polígono tiene VARIOS huecos con aristas perfectamente COLINEALES (ambos bolsillos tienen su borde inferior en exactamente y=-5.0030). Las tapas quedan rotas solo en esas aristas → paredes de bolsillo sin emparejar → 8 aristas abiertas en Base (banda superior), tanto en z=1.1 como z=1.5.

Datos capturados del MultiPolygon exacto que llega a extrusión para Base (rings 389/5/5/65 = exterior redondeado + 2 bolsillos + agujero ⌀5):
```json
hole1: [[-4.9955,5.0045],[-4.9955,-5.003],[-15.003,-5.003],[-15.003,5.0045],[-4.9955,5.0045]]
hole2: [[15.0045,5.0045],[15.0045,-5.003],[4.997,-5.003],[4.997,5.0045],[15.0045,5.0045]]
```

### Hipótesis DESCARTADAS (no pierdas tiempo ahí)
- NO son puntos duplicados consecutivos (verificado con Map por clave toFixed(6)).
- NO hay autointersecciones en ningún anillo (O(n²) con test estricto; único "cruce" reportado es falso positivo por vértice compartido en el ⌀5).
- NO hay keyholes ni segmentos del exterior cruzando zonas de huecos.
- NO es el winding/orientación (probado CW/CCW/raw: idéntico resultado).
- NO es mi preparación de anillos: con `ExtrudeGeometry`, un constructor manual con ShapeUtils, y otro con prep mínimo, TODOS dan exactamente 8 sobre el mismo dato.
- Un empuje (nudge) de +1e-4mm a UN hueco NO lo arregló (sigue 8).

### Pistas importantes
- En un harness aislado con cutters construidos a mano (mismos tamaños de anillo 389/5/5/65), las tres variantes daban 0 abiertas. Con el dato REAL de producción dan 8. Hay una diferencia sutil entre ambos datos aún no identificada (coordenadas ligeramente distintas por doble pasada martinez: inflateAboutOwnCentroid dentro de unionPolygons + GROW ×1.002 global + clipMultiPolygonToPolygon contra footprint).
- La soldadura del exportador usa toFixed(4) (=0.1μm); cualquier perturbación < 1e-4mm es invisible para `validate.ts` y para Bambu.

## Siguientes pasos propuestos (en orden)
1. **Micro-jitter determinista de vértices de HUECOS solo para la triangulación de tapas**: en `extrudeMultiPolygon` (src/engine/clipping/polyBoolean.ts), antes de construir Shape/Path para ExtrudeGeometry, desplazar cada vértice de cada anillo de hueco por un offset pseudoaleatorio determinista basado en hash de (índice de anillo, índice de punto) en rango ±2e-5 mm. Mantener las PAREDES con coordenadas originales (ExtrudeGeometry genera ambas internamente así que el jitter va en el Shape completo; el umbral de soldadura 1e-4 las re-fusiona). Verificar: test vecinos → 0 abiertas; suite completa verde; frieren sigue limpio.
   - Si el jitter parcial no basta, probar jitter también en contorno exterior o magnitud 5e-5.
2. Alternativa si earcut sigue roto: partir polígonos multi-hueco en prismas de UN hueco máximo usando keyholes deliberados (corredor de ancho ~1e-3mm conectando hueco con exterior como un único anillo simple) — riesgo: geometría degenerada que Bambu puede marcar; probar solo si (1) falla.
3. Alternativa mayor: sustituir triangulación de tapas por earcut directo (dep `earcut`) con opción `hashing:false`, o tri-disección propia; mantener paredes cuadrilátero a cuadrilátero compartiendo vértices exactos.
4. Tras cerrar el bug: borrar/restaurar restos de depuración si quedaran, correr suite + `npm run build`, y pedir al usuario re-probar con su SVG real.

## Herramienta de diagnóstico reutilizable (patrón que funcionó)
Capturar el dato exacto pre-extrusión insertando temporalmente en bookmarkScene.ts (bloque bandas):
```ts
;(globalThis as unknown as { __bandInput?: unknown }).__bandInput = structuredClone(bandInput)
```
y volcarlo a `/tmp/opencode/bandinput.json` desde un test; luego comparar constructores sobre ese JSON idéntico (harness estilo `tests/__debug2.test.ts` que existió: PRODUCCION vs SIMPLE sobre mismo dato). Esto fue lo que demostró que el defecto vive EN EL DATO (salida de booleanos), no en la extrusión.

## Contexto técnico clave
- Motor booleano híbrido `polyBoolean.ts`: polygon-clipping (martinez) primario con validación por área (`min(subjArea,clipArea)*1.02+0.25`), polybooljs como fallback. `unionPolygons` infla cada polígono 0.005mm sobre su centroide (`inflateAboutOwnCentroid`) antes de unir para disolver bordes compartidos entre polígonos que se tocan (martinez no fusiona tocados secos). NO forzar PolyBool para todo: fold lento (~25s).
- `cleanRing` (usada por cleanMulti en toda salida booleana) dedupe <1e-4mm, área mínima 0.002, y RE-AÑADE punto de cierre explícito al final de cada anillo.
- Base por bandas de profundidad: banda j = subtractMulti(outerRing, holes, cutters) extruida; fondo aparte. outerRing compartido entre bandas (getPoints(48)); ⌀5 hole ring de 65 pts con cierre.
- Constantes en bookmarkScene.ts: DESIGN_LIFT_MM=0.02, DESIGN_EMBED_MM=0.08, DESIGN_GROW_RATIO=1.002, colorStaggerMM(hash%5×0.004).
- Writer 3MF: objeto compuesto único, soldadura de vértices por toFixed(4), displaycolor por parte. validate.ts bloquea export si countOpenEdges>0 (impar dirigido) o countOverSharedEdges>0.

## Entorno
- NPM cache roto: instalar con `--cache /var/folders/wk/l4hbl2c53vz9dkmc81wfjj500000gn/T/opencode/npm-cache`. Sin git.
- Tests: `npx vitest run`. Tipos: `npx vue-tsc --noEmit`. Build: `npm run build`.
- Editar archivos grandes vía python heredocs con assert-in-replace (cuidado con anidado de corchetes en helpers de test: Polygon = Ring[] = [x,y][][], un nivel menos provocó horas de falsos positivos).
- Usuario no puede adjuntar imágenes; pedir descripciones en texto.
