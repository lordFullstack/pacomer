# HANDOFF LOOP 11 — AUDITORÍA Y SEGURIDAD

## Estado
COMPLETADO.

## Hallazgo antes de empezar: cada RPC mutante ya llamaba a `_audit()`
Se auditó el backend real (no se asumió nada) consultando las definiciones de las 23 funciones mutantes existentes: **todas** ya registraban en `audit_events` — venta, cobro, fiado, abono, corrección (`editar_valor_persona`), liberación, gasto, pago proveedor, apertura/cierre/reapertura de caja y cambios de configuración estaban cubiertos desde los loops 02-08. Lo único del listado del spec que **no** existía era **login y logout** — porque el login pasa por Supabase Auth directamente (`signInWithPassword`), no por una RPC nuestra, y **logout no existía en absoluto como funcionalidad** (no había botón ni función en todo el código para cerrar sesión). Eso definió el alcance real de este loop: no reinventar el registro de auditoría existente, solo cerrar el hueco de sesión y construir la UI de consulta.

## Archivos modificados (backend, Supabase `hqrjbgheclpnfoexyzyj`, migración `loop11_auditoria`)
- **`audit_events`, política de lectura endurecida**: antes cualquier usuario autenticado del tenant podía leer *todo* el rastro de auditoría directo por PostgREST (`select * from audit_events`), sin importar su rol — un hueco real. Se reemplazó la política por una que exige `current_role() = 'admin'`, igual que el resto de pantallas administrativas (Proveedores/Caja/Config).
- **`listar_auditoria(p_desde, p_hasta, p_usuario, p_accion, p_limit, p_offset)`** (nueva RPC) — admin-only (`_require_role`), devuelve eventos con el nombre del actor ya resuelto (`join` a `app_users`), ordenados más reciente primero, límite máximo 500 filas.
- **`registrar_evento_sesion(p_accion)`** (nueva RPC) — solo acepta `'login'`/`'logout'`, usa `current_app_user_id()`/`current_tenant_id()` (derivados de `auth.uid()`, funcionan apenas hay una sesión de Supabase Auth válida) para llamar a `_audit()` internamente. `authenticated`-only, revocada de `anon`/`public`.

## Archivos modificados (front-end)
- `index.html`: nuevo botón de nav "📋 Auditoría" (oculto para cajero, igual que Caja/Proveedores/Config), nueva página `#page-auditoria`. `js/14-init.js` renombrado a `js/15-init.js` para dejar espacio a `js/14-auditoria.js` en el orden de carga.
- `js/14-auditoria.js` (nuevo) — tabla de traducción `action → {módulo, etiqueta legible}` (las 23 acciones existentes + login/logout), `cargarAuditoria()`, filtros por fecha/usuario/módulo/acción, render de la lista con resumen legible de los metadatos más comunes (montos, correcciones de valor, diferencias de caja).
- `js/12-auth.js`: al iniciar sesión ahora también llama a `registrar_evento_sesion('login')` y pinta `#header-usuario-info` (nombre + badge de rol + botón "Salir" — ese `div` existía en el HTML desde antes pero nunca se usaba). Nueva función `cerrarSesion()`: registra el logout, hace `sb.auth.signOut()`, limpia el estado en memoria y vuelve a la pantalla de PIN.
- `js/02-utils-navegacion.js`: `navTo('auditoria')` carga la pantalla.
- `js/09-stats-roles.js`: `aplicarPermisosPorRol()` también esconde el botón de Auditoría para cajero.
- `css/styles.css`: sin cambios — la pantalla de Auditoría reutiliza clases existentes (`.card`, `.pago-item`, `.badge`, `.inp`).

## Cambios funcionales
- Ahora existe una forma real de cerrar sesión (no existía). El nombre y rol del usuario activo se ven en el header en todo momento.
- Login y logout quedan auditados con actor + timestamp, igual que el resto de operaciones críticas.
- La pantalla de Auditoría es de solo lectura — no hay ningún botón ni RPC para editar o borrar un evento ya registrado (cumple el criterio de aceptación explícitamente; ver QA).

## QA ejecutado
Contra el backend real, sirviendo la app por HTTP local. Se usó `_create_staff_account` (SQL directo, la misma función interna que usa `bootstrap_admin`) para crear cuentas de prueba admin/cajero **sin tocar la cuenta real que ya existía en el tenant** ("Jorge Ghisays" — se verificó su existencia y se dejó completamente intacta antes y después de la prueba).

- [x] Login real → evento `login` en `audit_events` con el actor correcto (verificado con SQL directo, no solo confiando en la UI).
- [x] Header muestra nombre + badge de rol + botón "Salir" tras iniciar sesión.
- [x] Logout → evento `logout` registrado, `sb.auth.signOut()` real, UI vuelve a la pantalla de PIN, `ui.usuarioActual`/`db.usuarioActivo` limpiados.
- [x] Pantalla Auditoría carga eventos reales vía `listar_auditoria`, incluidos los recién generados por la propia prueba.
- [x] Filtro por módulo ("Sesión") reduce la lista correctamente en el cliente.
- [x] **Seguridad verificada en dos capas, con un cajero real** (no solo el admin): (1) `select * from audit_events` directo devuelve **0 filas** para un cajero (antes de este loop devolvía todas); (2) `listar_auditoria()` desde el cliente real logueado como cajero devuelve el error `"Rol cajero no tiene permiso para esta operación"`. El botón de nav también está oculto para cajero, pero la protección real —como en el resto del sistema— está en el backend, no en ocultar el botón.
- [x] Limpieza de datos de prueba (2 cuentas, sus `audit_events`, `auth.identities`, `auth.users`) — verificado que la cuenta real preexistente y su historial de auditoría quedaron intactos.

## Problemas encontrados
1. `current_role()` es una palabra reservada de PostgreSQL (como `current_user`) — la función ya existente en el proyecto la define entre comillas (`"current_role"()`). Al escribir la nueva política RLS sin comillas, la migración falló con un error de sintaxis; corregido usando `public."current_role"()`.
2. Al volver a probar en `localhost` después de LOOP 10, el Service Worker (cache-first) sirvió una versión vieja de `index.html`/`js/` cacheada de la sesión de pruebas anterior, ocultando los cambios nuevos (`cargarAuditoria`/`cerrarSesion` aparecían como `undefined`). No es un bug del código — es el comportamiento esperado de un Service Worker cache-first. Se resolvió desregistrándolo y limpiando `caches` antes de recargar. Vale la pena tenerlo presente para las pruebas de los próximos loops.

## Riesgos pendientes
1. `listar_auditoria` no pagina desde la UI (solo trae hasta 200 filas más recientes según los filtros) — suficiente para el volumen actual de un restaurante, pero si el histórico crece mucho convendría agregar "cargar más" en vez de subir el límite.
2. El filtro de "Módulo" se aplica en el cliente sobre el lote ya traído (hasta 200 filas), no en el servidor — irrelevante en la práctica al día de hoy, pero si en el futuro se filtra por un módulo poco frecuente dentro de un rango de fechas amplio, podría no traer resultados que sí existen más atrás en el histórico (habría que ampliar el rango de fechas para verlos).

## Siguiente paso
LOOP 12 — Respaldo y recuperación (hoy el "respaldo" existente es solo una copia local de lo que se ve en pantalla, no un respaldo real del servidor — ver `js/08-respaldo.js`).
