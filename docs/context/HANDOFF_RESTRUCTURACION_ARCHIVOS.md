# HANDOFF — REESTRUCTURACIÓN DE ARCHIVOS (index.html monolítico → css/ + js/)

## Estado
COMPLETADO.

## Motivo
Después de LOOP 08A, el usuario preguntó por la ubicación de los archivos y aclaró que esperaba una estructura separada (`src`/`app` por módulos) en lugar de un único `index.html` de ~2800 líneas con todo el CSS y JS inline. Se acordó reestructurar sin introducir un build step/bundler, para preservar el flujo de trabajo actual del usuario (abrir `index.html` con doble clic vía `file://`, sin `npm run build` ni servidor de desarrollo obligatorio).

## Decisión técnica
- **Sin bundler ni ES modules.** Los módulos ES rompen bajo `file://` por CORS, y un bundler (Vite, etc.) sería un cambio de stack no autorizado que complicaría el despliegue simple actual. Se usaron `<script src>` clásicos en orden de dependencia.
- **Prefijos numéricos** (`00-`, `01-`, ... `13-`) en los nombres de archivo para que el orden de carga sea explícito y no dependa de que alguien recuerde la dependencia real.
- Casi todo el código son *declaraciones* de función (izadas a `window`, no dependen de orden de carga entre sí para poder *llamarse* después). Los únicos puntos sensibles al orden son código que se **ejecuta** al cargar: los objetos `db`/`ui` (deben ir primero) y el bloque de init final `load().then(...)` (debe ir al final). Se preservó el orden top-to-bottom original del `<script>` monolítico al repartirlo en archivos, así que el riesgo de comportamiento distinto es mínimo por construcción.
- **Cero cambios de lógica o de HTML** — todo el contenido (CSS, HTML del `<body>`, funciones JS) se copió verbatim a los nuevos archivos. La única diferencia intencional en `index.html` es que el `<style>` inline se volvió `<link rel="stylesheet" href="css/styles.css">` y el `<script>` inline se volvió una secuencia de `<script src="js/...">`.

## Archivos creados
- `css/styles.css` — CSS completo (602 líneas), extraído verbatim del `<style>` original.
- `js/00-estado.js` — `MESAS`, `db`, `ui`, cliente Supabase (`sb`), `PACOMER_TENANT_ID`, `sbErr()`.
- `js/01-persistencia-legacy.js` — `save()`/`load()` legacy (código muerto preexistente que consulta tablas de un schema antiguo que ya no existe; se dejó intacto con un comentario explicativo — su limpieza es trabajo de Loop 14, no de esta reestructuración).
- `js/02-utils-navegacion.js` — `uid()`, `cop()`, `elapsed()`, formateo de fechas/valores, `toast()`, navegación (`navTo`), overlays.
- `js/03-mesas.js` — módulo Mesas completo (pantalla protegida).
- `js/04-quick-service.js` — LOOP 08A (Mobile Quick Service).
- `js/05-clientes.js` — módulo Clientes.
- `js/06-proveedores.js` — módulo Proveedores.
- `js/07-caja.js` — módulo Caja (apertura/día/cierre/arqueo).
- `js/08-respaldo.js` — exportar/importar respaldo local + vista de Movimientos.
- `js/09-stats-roles.js` — stats del header + permisos por rol.
- `js/10-ticket.js` — ticket de papel rasgado + compartir por WhatsApp.
- `js/11-configuracion.js` — módulo Configuración (datos del negocio, usuarios).
- `js/12-auth.js` — splash + pin gate + login real + bootstrap de administrador.
- `js/13-init.js` — bloque de arranque (`load().then(...)`) — se carga último a propósito.
- `.claude/launch.json` — configuración para levantar un servidor estático local (`node` + script en el scratchpad de la sesión) solo para poder probar la app con `preview_start` del navegador de Claude Code, ya que abrir el `index.html` nuevo por `file://` cae en "modo static snapshot" del navegador de la herramienta (no ejecuta `<script src>` con rutas relativas) — limitación de la herramienta, no del código. **No afecta el flujo normal del usuario**, que sigue siendo abrir `index.html` directamente por `file://` en un navegador real.

## Archivos modificados
- `index.html` — reescrito como shell delgado: mismo `<head>` (meta, título, CDN de Supabase), `<link>` a `css/styles.css`, todo el HTML del `<body>` preservado verbatim (splash, pin gate, header, las 5 páginas, todos los modales, ticket, quick service, toast), y 14 `<script src="js/...">` en orden de dependencia en vez de un único `<script>` inline. Pasó de ~2806 líneas a 344.

## QA ejecutado
Probado end-to-end contra el backend real (`hqrjbgheclpnfoexyzyj`), sirviendo el `index.html` nuevo por HTTP local (no `file://`, por la limitación de herramienta ya descrita) para poder ejecutar JS de verdad en el navegador de la sesión:

- [x] Los 14 archivos `js/*.js` + `css/styles.css` cargan con `200` (verificado con `performance.getEntriesByType('resource')`) y en el orden correcto.
- [x] `typeof db/sb/uid/cargarMesas/qsRegistrar/guardarProveedor` = función/objeto en todos los casos — ninguna función quedó huérfana o mal referenciada entre archivos.
- [x] Bootstrap de administrador (`crearAdminBootstrap`) → login real por PIN (`pinPress` × 4, `signInWithPassword`) → sesión iniciada, permisos por rol aplicados.
- [x] Caja: apertura, gasto manual, vista Día, vista Movimientos — matemática verificada (apertura $200.000 + ingresos $25.000 − egresos $40.000 = esperado $185.000).
- [x] Mesas: seleccionar mesa, registrar persona con nota, cobro individual (`cobrarPersona`) — **el ticket de papel rasgado se mostró correctamente** (confirma que el fix del bug pre-existente de LOOP 08A sigue funcionando tras el split).
- [x] Clientes: crear cliente nuevo — persistido y reflejado en `db.clientes`.
- [x] Proveedores: crear proveedor, registrar factura ($80.000), registrar pago parcial ($30.000) — saldo recalculado correctamente ($80.000 → $50.000).
- [x] Quick Service (LOOP 08A): registrar consumo en mesa 5 sin nombre → autogenerado `Consumo 1`, mismo comportamiento que antes del split.
- [x] Configuración: `renderConfig()`/`renderUsuariosList()` muestran datos reales del negocio y el usuario recién creado.
- [x] Limpieza de datos de prueba: se borró todo (pagos, obligaciones, consumos, comensales, sesiones de mesa, cliente, proveedor, sesión de caja, movimientos, auditoría, `app_users`, `auth.identities`, `auth.users`) siguiendo el orden correcto de FKs y capturando `auth_user_id` **antes** de borrar `app_users` (lección de Loop 04). Verificado con conteos en cero al final — la base quedó exactamente como antes de la prueba.

## Problemas encontrados
1. **Limitación de herramienta (no de código)**: abrir el nuevo `index.html` por `file://` en el navegador de Claude Code lo renderiza en "modo static snapshot" (internamente lo convierte a una URL `data:`), lo que hace que los `<script src="js/...">` con rutas relativas no se resuelvan y por lo tanto no se ejecuten. Se resolvió para efectos de la prueba levantando un servidor HTTP estático local desechable (`node` + script en el scratchpad de la sesión, registrado en `.claude/launch.json`) — esto **no cambia ni afecta** el uso normal del usuario abriendo el archivo directamente con doble clic.

## Riesgos pendientes
1. Ninguno nuevo introducido por la reestructuración en sí — el comportamiento verificado es idéntico al `index.html` monolítico previo.
2. `.claude/launch.json` quedó en el repo como conveniencia para futuras sesiones de prueba con la herramienta de navegador; si el usuario prefiere no versionarlo, se puede mover a `.gitignore` o borrar sin ningún impacto funcional.

## Siguiente paso
LOOP 09 — Responsive secundario (según la numeración del plan original de 14 loops; ver `docs/context/PROJECT_STATE.md` para el estado completo).
