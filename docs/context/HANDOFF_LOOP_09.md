# HANDOFF LOOP 09 — RESPONSIVE SECUNDARIO

## Estado
COMPLETADO.

**Nota de alcance**: el spec del loop (`loops/LOOP_09.md`) menciona "Dashboard" como uno de los módulos a mejorar para móvil. En el estado actual del front-end **no existe una página de Dashboard** — solo existe la RPC `dashboard_resumen()` (Loop 08), pero nunca se construyó una vista/nav para ella. No hay nada que responsivizar ahí todavía; se deja como pendiente real, no como trabajo hecho.

## Archivos modificados
- `css/styles.css`:
  - Fix base (no depende de viewport) de un bug pre-existente: `#page-config` no tenía `padding` ni `overflow-y`, así que la página de Configuración podía quedar sin scroll propio si el contenido no cabía. Se agregó `#page-config { padding: 20px; overflow-y: auto; }`.
  - Un único bloque `@media (max-width: 768px)` nuevo al final del archivo, más la regla base (fuera de la media query) de `.btn-volver { display: none; ... }`. **Cero reglas existentes modificadas o eliminadas** — todo lo nuevo se agregó al final, sin tocar ninguna clase `.mesas-*`, `.mesa-*`, `.reg-*`, `.personas-list`, `.add-p-*`, ni los selectores `#ov-mesa`/`#ov-fiar` (fuera de alcance del loop, protegidos).
- `js/05-clientes.js`: `selCliente()` ahora agrega la clase `mostrar-detalle` a `#page-clientes`; nueva función `volverListaCliente()`; `renderCliDetail()` agrega un botón "← Volver" (oculto en desktop, visible solo ≤768px) al inicio del `detail-head`.
- `js/06-proveedores.js`: mismo patrón — `selProv()`, `volverListaProveedor()`, botón "← Volver" en `renderProvDetail()`.

## Archivos creados
- `docs/context/HANDOFF_LOOP_09.md` — este archivo.

## Decisión de diseño: header compartido
El header (marca + nav + stats) es chrome compartido por las 5 páginas, incluida Mesas — no es parte de la composición protegida en sí (`LOOP_CONTEXT.md` protege el grid, el panel de registro, el modal de mesa, etc., no la barra de navegación superior). Antes de este loop no existía **ninguna media query en todo el archivo** (hallazgo #6 de la auditoría original), así que en pantallas angostas el header podía desbordar horizontalmente incluso estando parado en Mesas. Se agregó una regla `@media (max-width:768px)` que hace que el header pase a `flex-wrap` (nav arriba, stats abajo) en vez de una sola fila — es un fix de overflow, no un rediseño: en desktop (>768px) el header renderiza exactamente igual que antes (verificado, ver QA). Se decidió no pedir autorización aparte porque no cambia ni un solo pixel del grid/panel/modal de Mesas, solo evita que la barra superior se corte.

## Cambios funcionales
- Ninguno en lógica de negocio. Los únicos cambios de JS son puramente de presentación: agregar/quitar una clase CSS y limpiar la selección (`ui.cliSel`/`ui.provSel = null`) al volver a la lista en móvil — mismo patrón que ya usaban `selCliente`/`selProv` para des-seleccionar.

## Cambios de UI (solo ≤768px — cero cambio en desktop, verificado)
- **Header**: pasa de una fila a dos (`flex-wrap`) para no desbordar.
- **Clientes / Proveedores**: patrón "drill-down" — en vez de lista+detalle lado a lado (300px + resto), en móvil se ve una pantalla a la vez: la lista ocupa todo el ancho hasta que se toca un cliente/proveedor, entonces la lista se oculta y el detalle ocupa todo el ancho con un botón "← Volver" arriba. Los formularios de "Nuevo/Editar cliente" y "Nuevo/Editar proveedor" (`#ov-cliente`, `#ov-proveedor`) se ajustan a `calc(100vw - 32px)` para no desbordar en pantallas de 320-375px (`#ov-mesa` y `#ov-fiar`, ligados a Mesas, no se tocaron).
- **Caja**: las 4 pestañas pasan de una fila a una grilla 2×2; las cards de "Día" (hero de 3 columnas, grid de ingresos/egresos) pasan a una columna; la fila de "gasto manual" (descripción + valor + botón) se apila en vez de comprimirse.
- **Configuración**: ahora tiene padding y scroll propio (fix de bug, ver arriba); botones principales con `min-height:46px` para mejor objetivo táctil.

## QA ejecutado
Contra el backend real, sirviendo el `index.html` actual por HTTP local (misma limitación de herramienta para `file://` ya documentada en el handoff de la reestructuración de archivos).

- [x] **375×812** (iPhone estándar): sin overflow horizontal en Mesas, Clientes, Proveedores, Caja (día/movimientos), Configuración — `document.documentElement.scrollWidth === window.innerWidth` en los 5 casos.
- [x] **320×700** (pantalla angosta límite, iPhone SE): mismo resultado — sin overflow horizontal en ningún módulo, incluido el modal de "Nuevo cliente" (`calc(100vw-32px)` respetado).
- [x] Drill-down Clientes: seleccionar cliente → lista se oculta, detalle visible con botón "Volver"; tocar "Volver" → `ui.cliSel` vuelve a `null`, lista visible de nuevo. Verificado leyendo `getComputedStyle(...).display` antes/después, no solo asumido.
- [x] Drill-down Proveedores: mismo comportamiento, verificado igual.
- [x] **Desktop real (1400×900)**: verificado explícitamente que nada cambió — `list-panel` sigue en 300px lado a lado con el detalle, botón "Volver" con `display:none`, pestañas de Caja en una sola fila (`nowrap`), panel de registro de Mesas en 320px sin cambios, header en una sola fila (`nowrap`). Importante: el "desktop" por defecto del propio panel de vista previa de la herramienta resultó ser de solo 481px de ancho (menor que el breakpoint de 768px), así que la comparación real se hizo forzando un viewport de escritorio genuino (1400px), no el tamaño por defecto del panel.
- [x] Limpieza de datos de prueba (cliente, proveedor, sesión de caja, usuario admin de prueba con su `auth.users`/`auth.identities`) — capturando `auth_user_id` antes de borrar `app_users`, mismo procedimiento que en loops anteriores. Verificado con conteos en cero al final.

## Problemas encontrados
Ninguno nuevo. Se reutilizó el hallazgo ya documentado de que la herramienta de navegador renderiza `file://` fuera de servidor en "modo static snapshot" — se probó vía el mismo servidor HTTP local desechable de la reestructuración anterior.

## Riesgos pendientes
1. **Dashboard**: no existe página en el front-end (ver nota de alcance arriba) — cuando se construya, necesitará su propio trabajo de responsive; no cubierto por este loop.
2. El breakpoint elegido es único (768px) — cubre bien teléfonos y la mayoría de tablets en modo retrato; no se probó exhaustivamente en el rango 600-900px (tablets en horizontal), aunque el patrón (drill-down, grids que colapsan) debería degradarse de forma razonable por ser CSS estándar, no algo frágil.
3. El header ahora reflowa a dos filas en pantallas angostas incluso estando en Mesas (ver "Decisión de diseño" arriba) — es una decisión mía de interpretar que el header no es parte de la composición protegida; si el usuario prefiere que Mesas se vea con la barra recortada en vez de en dos filas, es una reversión de una sola regla CSS.

## Siguiente paso
LOOP 10 — Offline-first / PWA (manifest, service worker, cola de operaciones pendientes), según el plan original de 14 loops.
