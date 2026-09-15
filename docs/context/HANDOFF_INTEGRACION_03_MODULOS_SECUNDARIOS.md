# HANDOFF — INTEGRACIÓN PASO 3: Módulos secundarios (Clientes, Proveedores, Caja, Config)

## Contexto
Paso 3 del orden acordado: (1) RPC operativas ✅, (2) login real ✅, **(3) módulos secundarios ✅**, (4) Mesas (pendiente, la pantalla protegida).

## Objetivo
Reconectar Clientes, Proveedores, Caja y Configuración al backend nuevo, reutilizando el backend construido en los Loops 05-08. Estos módulos **sí se pueden rediseñar** (no son Mesas), así que donde el modelo nuevo obligaba a simplificar o reordenar un flujo, se hizo — documentado abajo.

## Backend nuevo construido en este paso

No existía forma de crear/editar clientes o proveedores, ni de guardar la configuración del negocio, ni de gestionar usuarios desde la UI — todo eso faltaba:

- **`crear_cliente` / `editar_cliente`** (cajero y admin) — `customers` ganó una columna `notes` que no existía.
- **`crear_proveedor` / `editar_proveedor`** (admin-only) — `suppliers` ganó `phone`, `category`, `notes` (no existían).
- **`actualizar_config`** (admin-only) — guarda los datos del negocio como un único registro jsonb en `app_config` (clave `'negocio'`).
- **`activar_desactivar_usuario`** (admin-only) — reemplaza "eliminar usuario": un `DELETE` físico rompería `audit_events.actor_user_id` (FK) y violaría la regla de auditoría inmutable. Ahora solo se desactiva, nunca se borra.

## Front-end (`index.html`)

### Clientes
- `cargarClientes()` reemplaza la dependencia de `db.clientes` cargado por el `load()` legacy — trae `customers` + `customer_balances` (saldo real, Loop 05).
- Historial (cargos/abonos) se carga **on-demand** al seleccionar un cliente (`cargarHistorialCliente`), no de una vez — evita traer todo el historial de todos los clientes por adelantado.
- `registrarAbono` ahora llama a `registrar_abono` (Loop 03/05) en vez de mutar `saldo` en el cliente. **Cambio de comportamiento real**: como el abono se registra como efectivo, ahora **requiere caja abierta** (antes no tenía ninguna relación con caja). Es una mejora de rigor (todo efectivo pasa por caja), no un bug, pero es una restricción nueva.
- `guardarCliente` usa `crear_cliente`/`editar_cliente`.

### Proveedores
- `saldoProv(p)` cambió de recalcular sumando `movimientos` a leer directamente `p.saldo` (poblado desde la vista `supplier_balances`, Loop 06) — una sola fuente de verdad, igual criterio que el resto del backend.
- El "estado de cuenta" (facturas + pagos) se carga on-demand al seleccionar proveedor (`cargarMovimientosProveedor`), determinando el origen del pago (caja/fondo) a partir del método real del *tender* (`efectivo`→caja, `transferencia`→fondo).
- `registrarFactura` → `registrar_compra` (Loop 06, admin-only). El campo de descripción libre del formulario legacy se mapea a `invoice_number`.
- `registrarPagoProv` → `registrar_pago_proveedor` (Loop 03/06, admin-only), traduciendo el selector visual caja/fondo a `efectivo`/`transferencia`.
- `guardarProveedor` usa `crear_proveedor`/`editar_proveedor`.

### Configuración
- `cargarConfigNegocio()` lee `app_config` directo (RLS ya lo permite); `guardarNegocio()`/`subirLogoNegocio()` escriben vía `actualizar_config`.
- **Simplificación deliberada**: la subida de logo (`sb.storage...`) sigue en el código tal cual, pero el bucket de Storage (`pacomer-pos-img`) **no existe en el proyecto nuevo** — fallará con un error claro hasta que se cree (fuera de alcance de este paso; no se creó infraestructura de Storage sin que se pidiera).
- Usuarios: `cargarUsuarios()` lee `app_users` directo. `abrirModalUsuario` → `crear_usuario` (Loop 04, admin-only). `toggleUsuario` → `activar_desactivar_usuario`. **Se quitó el botón "eliminar usuario"** — ya no es posible borrar, solo desactivar (ver razón arriba).

### Caja — el rediseño más grande
El modelo legacy era **un documento por fecha calendario** (`db.caja['2026-09-15']`); el backend nuevo es **por sesión** (abrir → operar → arquear → cerrar, Loop 07), sin relación directa con "un día". Se rediseñó todo el módulo:
- `getDia()` (creaba/leía el documento del día) se eliminó — reemplazada por `cargarCajaActual()`, que trae la sesión de caja más reciente (`cash_session_detail`, con ingresos/egresos/esperado recalculados en vivo) más las últimas 7 sesiones cerradas.
- La pestaña **Cierre** ahora tiene 3 estados reales en vez de 2: sin caja abierta → operando (`OPEN`) → **en arqueo** (`COUNTING`, paso nuevo del Loop 07) → cerrada. Antes se cerraba directo; ahora hay un botón "Iniciar arqueo" intermedio obligatorio.
- **Simplificación deliberada**: se eliminó la distinción "caja" vs. "fondo" para gastos manuales — `registrar_gasto` en el backend nuevo solo existe para caja/efectivo. Si el negocio necesita seguir gastos de un fondo aparte que no toque el efectivo del cajón, es una pieza nueva a diseñar, no algo que existiera ya de forma equivalente.
- Se eliminó "Cambiar apertura" (editar el monto de apertura después de abierta) — no hay RPC para eso; una vez abierta, la apertura es inmutable hasta el cierre.
- El auto-descarga de respaldo al cerrar caja (`exportarRespaldo(true)`) se quitó de `cerrarCaja()` — el respaldo automático ligado al cierre de un día calendario no tiene sentido con sesiones; el botón manual de exportar sigue disponible en la pestaña Movimientos.
- Se quitó el botón "Restaurar respaldo": importar un backup JSON antiguo solo mutaba el estado local en memoria sin escribir nada al servidor incluso en el código legacy — mantenerlo ahora sería más engañoso que antes, dado que casi todo el estado ya viene del servidor.

## Bugs reales encontrados y corregidos durante las pruebas

1. **`renderStats()` llamaba a `calcTotales()`**, una función que se eliminó al rediseñar Caja — esto lanzaba un `ReferenceError` no capturado durante el arranque de la página, deteniendo la ejecución **antes** de que se mostrara la pantalla de login. La app parecía "saltarse" el login por completo. Corregido: `renderStats()` ahora usa `db.cajaActual.ingresos` directamente.
2. **`uid()` usaba `crypto.randomUUID()` sin respaldo** — esa función no existe en contextos no seguros (por ejemplo `file://`, usado para las pruebas). Cualquier acción que generara una `idempotency_key` fallaba con `TypeError`. Corregido con un generador UUID v4 alterno vía `Math.random()` cuando `crypto.randomUUID` no está disponible. Relevante también para producción si alguna vez se sirve sin HTTPS.

## QA ejecutado

Todo se probó **en el navegador real**, contra el backend real, iniciando sesión con un administrador de prueba creado a través de la propia UI (no por SQL directo):

### Test
- [x] Bug del `ReferenceError` detectado, corregido, verificado que el login vuelve a aparecer.
- [x] Bug de `crypto.randomUUID` detectado, corregido, verificado que las RPC con `idempotency_key` ya no fallan.
- [x] **Clientes**: crear cliente → aparece en `db.clientes` con `saldo:0`; seleccionar cliente → historial se carga (vacío, correcto).
- [x] **Proveedores**: crear proveedor → `saldo:0`; registrar factura de $50.000 → `saldo:50000`; pagar $20.000 por transferencia (fondo) → `saldo:30000`.
- [x] **Config**: guardar datos del negocio → `db.config` refleja lo guardado, consistente con lo escrito en `app_config`.
- [x] **Usuarios**: crear cajero (mockeando `prompt()` para simular la entrada real del operador) → aparece con rol `cajero`; desactivar → `activo:false`.
- [x] **Caja**: abrir con $100.000 → `esperado_actual:100000`; gasto de $5.000 → `esperado_actual:95000`; iniciar arqueo → estado `COUNTING`; cerrar con $95.000 contados → `difference:0`, estado `CLOSED`.
- [x] Pestaña Movimientos muestra el gasto correctamente clasificado como egreso.
- [x] `historialCierres` recargado tras el cierre incluye la sesión recién cerrada con sus valores exactos.
- [x] Sin errores de consola nuevos tras el login (solo los 404/401 esperados de antes de autenticar, ya documentados en el paso 2).
- [x] Todos los datos de prueba (2 usuarios, cliente, proveedor + compra + pago, config, caja + movimiento, auditoría) eliminados al terminar — capturando el `auth_user_id` **antes** de borrar `app_users` esta vez, aplicando la lección del paso 2.

## Archivos modificados
- `index.html` (Clientes, Proveedores, Caja, Config reescritos; 2 bugs corregidos)
- `docs/context/HANDOFF_INTEGRACION_03_MODULOS_SECUNDARIOS.md` (nuevo)

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `integracion_p3_schema_clientes_proveedores` — columnas nuevas en `customers`/`suppliers`.
2. `integracion_p3_crear_editar_cliente_proveedor` — `crear_cliente`, `editar_cliente`, `crear_proveedor`, `editar_proveedor`.
3. `integracion_p3_config_y_usuarios` — `actualizar_config`, `activar_desactivar_usuario`.

## Riesgos
1. Subida de logo del negocio fallará (bucket de Storage inexistente) hasta que se cree — señalado, no resuelto en este paso.
2. Abonos y pagos a proveedores en efectivo ahora **requieren caja abierta** — comportamiento nuevo (correcto, pero el operador debe entender que si intenta abonar sin haber abierto caja, verá un error claro en vez de que simplemente funcione como antes).
3. La herramienta de captura de pantalla del navegador falló repetidamente por timeout durante esta sesión de pruebas (aparentemente por el render en modo "static snapshot" de archivos `file://` fuera del directorio del proyecto) — la verificación se hizo ejecutando las funciones reales vía JavaScript y leyendo el estado resultante (`db.*`) y la base de datos real, no solo mirando capturas. Es una limitación de la herramienta de pruebas de esta sesión, no del código.

## Pendientes
- Paso 4: Mesas — la pantalla protegida, usando las RPC operativas del paso 1 (`abrir_orden`, `agregar_persona`, `editar_valor_persona`, `liberar_orden`) más `cobrar_persona`/`cobrar_mesa`/`registrar_fiado` (Loop 03).
- Crear el bucket de Storage para logos si el negocio lo necesita.
- Decidir si se necesita separar "fondo" de "caja" para gastos manuales (simplificación #4 de este paso).

## Decisiones
- Se priorizó reutilizar exactamente los mismos nombres de función del legacy (`guardarCliente`, `registrarFactura`, etc.) para minimizar el diff visible y el riesgo de romper referencias `onclick=""` en el HTML que no se tocó.
- Donde el modelo nuevo no tenía equivalente exacto (caja por fecha, gasto de "fondo", restaurar respaldo), se simplificó en vez de inventar estructuras nuevas no pedidas — consistente con "mantener flujo simple" aplicado en toda la sesión.

## Próximo paso
Paso 4 del plan de integración: Mesas — la pantalla protegida. Requiere el mayor cuidado de todo el proyecto: la composición visual y el flujo deben quedar exactamente iguales, solo cambia qué hay detrás de cada botón.
