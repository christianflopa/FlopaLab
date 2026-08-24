# FlopaLab

Configurador 3D client-side para objetos planos imprimibles, comenzando por separadores de libros personalizados a partir de archivos SVG.

La interfaz es una evolución directa del sistema visual y la arquitectura de `Clickermaker` (Vue 3 + Pinia + Three.js, tema oscuro, sidebar + canvas).

## Stack

- Vue 3 (`<script setup>`) + TypeScript
- Vite
- Pinia (estado central del proyecto)
- Three.js 0.185 (SVGLoader, ExtrudeGeometry, STLExporter)
- three-bvh-csg (clipping booleano real)
- fflate (empaquetado ZIP OPC para 3MF)

## Arquitectura

```text
src/
├── components/            UI pura
│   ├── Sidebar.vue        secciones 1-4 del flujo
│   ├── Viewport.vue       toolbar + canvas
│   ├── Toolbar.vue        modos de gizmo, vistas de cámara, preview
│   ├── Canvas3D.vue       orquestación store ⇄ escena
│   └── ui/                NumberField / CheckboxField / ColorField
├── stores/project.ts      estado central: Project { base, designs[] }
├── models/                tipos puros: BaseObject, SvgDesign, ParsedSvg
├── three/                 fábricas reutilizadas de Clickermaker (mm scale)
└── engine/
    ├── constants.ts       valores por defecto y límites físicos
    ├── svg/               parseo agrupado por color + caché no reactiva
    ├── geometry/          base slab (rect redondeado + agujero real), extrusión con caché
    ├── clipping/          CSG: diseño ∩ (slab−agujero); base − bolsillos
    ├── materials/         registro compartido de materiales por color
    ├── builder/           BookmarkScene: pipeline original→transform→clip→depth
    └── export/            validación, STL por región, writer 3MF propio
```

### Regla fundamental

El SVG original jamás se modifica. El pipeline es derivado y recalculable:

```text
SVG original → transformación → extrusión(profundidad) → clipping → material → exportación
```

Cambiar posición/escala/rotación después de un recorte vuelve a calcular el clipping automáticamente (debounce 150 ms; durante el arrastre se muestra el diseño sin recortar para respuesta inmediata).

## Semántica de profundidad

- `1 unidad = 1 mm`; el grosor total siempre es el grosor de la base.
- El diseño ocupa los últimos `profundidad` mm desde la **cara frontal** (inlay al ras).
- La base pierde material únicamente debajo de los diseños (CSG).
- Si `profundidad = grosor`, el diseño atraviesa toda la pieza ("extender hasta la superficie", automático y bloqueado).

## Exportación

- **3MF** (principal): ZIP OPC generado localmente (`fflate`) con `unit="millimeter"`, un objeto por región de color y `<m:basematerials>` del Materials Extension estándar. Compatible con PrusaSlicer / Bambu Studio / Cura como objetos separados con color asignable.
- **STL**: un archivo binario por región de color (`flopalab_base.stl`, `flopalab_<color>.stl`). STL no conserva colores: los archivos separados permiten asignar filamento por pieza en el slicer.

## Limitaciones técnicas conocidas

- Solo `fill` sólido: gradientes, patrones y texturas se informan y se omiten.
- El contorno (`stroke`) no genera geometría en esta versión.
- Colores 3MF a nivel de objeto (path portable del estándar), no pintado por triángulo.
- Solapes entre diseños distintos no se resuelven entre sí (se advierten en validación).
- La resolución de curvas SVG es adaptativa (~0.1 mm); indistinguible en impresión FDM.

## Comandos

```bash
npm install
npm run dev      # desarrollo
npm run build    # typecheck + build producción
npm run test     # pruebas unitarias del motor (vitest)
```

## Verificación manual sugerida

1. Separador inicial 50 × 150 × 1.5 mm visible con agujero real.
2. Modificar dimensiones/radio/agujero/color → geometría actualiza en vivo.
3. Cargar SVG B/N → colores detectados, reasignables.
4. Mover/escalar (uniforme y libre)/rotar (37°, ±90°, presets) desde panel y gizmo.
5. Profundidades 0.2 / 0.5 / 1.0 / 1.5 mm; intentar 2.0 mm → limitado al grosor.
6. Diseño parcialmente fuera → recortado; moverlo de vuelta → recupera geometría.
7. Diseño sobre el agujero → recorte respeta el agujero.
8. Exportar 3MF → abrir en slicer → dimensiones exactas y colores por objeto.
9. Exportar STL → N archivos, uno por color.
