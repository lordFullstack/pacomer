# PROJECT STATE

_Actualizado: Integración front-end completa + LOOP 08A + Reestructuración de archivos + LOOP 09 + LOOP 10 + LOOP 11 + LOOP 12 + Dashboard — 2026-09-15_

## Fix: Mesas no se sincronizaba entre dispositivos (COMPLETO)
El usuario reportó que móvil y escritorio no se sincronizaban a menos que reiniciara sesión. Causa real: el `setInterval` de `js/16-init.js` solo volvía a **dibujar** con los datos que ya estaban en memoria (`renderGrid()`/`renderStats()`), nunca volvía a pedirlos al servidor — así que un cambio hecho desde otro dispositivo nunca llegaba hasta un re-login completo. Ahora el intervalo (cada 15s, solo si hay sesión activa) vuelve a llamar `cargarMesas()`/`cargarOrdenesRecientes()` de verdad. Probado con dos pestañas logueadas simultáneamente: un registro hecho en una apareció en la otra en ~18s sin recargar ni reiniciar sesión.

## Dashboard gerencial (COMPLETO)
Pedido directo del usuario tras revisar la app: pantalla con visión general del negocio. Cierra un hueco señalado desde el Loop 08 — `dashboard_resumen` (la RPC) existía pero nunca se construyó una página para mostrarla. Se agregó `flujo` (ingresos/gastos/saldo, no existía) y períodos `mes`/`año` (antes solo hoy/7d/30d) a la RPC, más la pantalla `#page-dashboard` (admin-only, mismo patrón de protección que Caja/Auditoría). Probado con datos reales: matemática de ingresos/egresos/saldo verificada. Ver `docs/context/HANDOFF_DASHBOARD.md`.

## LOOP 12 — Respaldo y recuperación (COMPLETO)
El respaldo/restauración anteriores eran una trampa: exportaba solo lo cargado en pantalla y el importador escribía a tablas legacy inexistentes — nunca hubo un respaldo ni restauración reales. Ahora `exportarRespaldo()` trae 26 tablas reales del tenant (sin credenciales). La restauración, con alcance acordado explícitamente con el usuario (solo datos de referencia — nunca mesas/pagos/caja, por riesgo de corromper dinero real), valida todo el archivo antes de escribir nada, muestra una vista previa (qué se crearía vs qué se omite por ya existir), y reutiliza `crear_cliente`/`crear_proveedor`/`actualizar_config` para quedar auditada automáticamente. Ver `docs/context/HANDOFF_LOOP_12.md`.

## LOOP 11 — Auditoría y seguridad (COMPLETO)
Todas las RPC mutantes ya auditaban (venta, cobro, fiado, abono, corrección, liberación, gasto, pago proveedor, apertura/cierre/reapertura de caja, config) desde loops anteriores — lo único que faltaba del spec era login/logout (logout ni siquiera existía como función). Se agregó `registrar_evento_sesion` (RPC), botón real de "Salir" en el header, y una pantalla de Auditoría (`listar_auditoria`, admin-only) con filtros por fecha/usuario/módulo/acción. Se endureció además la política RLS de `audit_events`: antes cualquier usuario autenticado del tenant podía leer todo el rastro directo por PostgREST, ahora solo admin — verificado con una cuenta cajero real (0 filas por select directo, RPC rechaza explícitamente). Ver `docs/context/HANDOFF_LOOP_11.md`.

## LOOP 10 — Offline-first / PWA (COMPLETO, desplegado)
`manifest.json` + `sw.js` (cachea el cascarón estático, nunca Supabase) + cola de sincronización en IndexedDB (`js/13-offline-sync.js`). Solo se encola "agregar consumo a una mesa" (Mesas y Quick Service) — nada que mueva dinero se pone en cola nunca (decisión de producto, ver handoff). Probado end-to-end: registrar sin internet, reconectar, sincroniza solo, sin duplicar sesiones de mesa. **Desplegado en Vercel: https://pacomer-pos.vercel.app** (proyecto `pacomer-pos`, vinculado a `lordFullstack/pacomer`, redeploy automático en cada push a `main`) — Service Worker y manifest verificados activos en ese dominio real. El flujo `file://` de siempre sigue funcionando igual, sin Service Worker (no rompe nada). Ver `docs/context/HANDOFF_LOOP_10.md`.

## LOOP 09 — Responsive secundario (COMPLETO)
Clientes y Proveedores pasan a un patrón "drill-down" en móvil (≤768px): lista y detalle ya no van lado a lado, se ve una pantalla a la vez con botón "← Volver". Caja (pestañas, hero del día, grid de ingresos/egresos, fila de gasto manual) y Configuración (fix de bug: no tenía padding/scroll propio) se reflowan a una columna. Header compartido pasa a dos filas en vez de desbordar. Cero cambios en desktop (verificado a 1400px) y cero cambios en la composición de Mesas. "Dashboard" mencionado en el spec del loop no existe como página en el front-end — sigue pendiente. Ver `docs/context/HANDOFF_LOOP_09.md`.

## Reestructuración de archivos (COMPLETA)
`index.html` dejó de ser un monolito de ~2806 líneas: el CSS pasó a `css/styles.css` y el `<script>` inline se repartió en 14 archivos `js/00-*.js` … `js/13-init.js`, cargados con `<script src>` clásicos en orden de dependencia (sin bundler ni ES modules, para preservar el flujo `file://` del usuario). `index.html` quedó en 344 líneas (shell + HTML del body verbatim). Cero cambios de lógica o de composición visual — verificado end-to-end contra el backend real. Ver `docs/context/HANDOFF_RESTRUCTURACION_ARCHIVOS.md`.

## Integración de front-end (COMPLETA — los 4 pasos acordados con el usuario)
1. **RPC operativas de órdenes**: `abrir_orden`, `agregar_persona`, `editar_valor_persona`, `liberar_orden` (ver `docs/context/HANDOFF_INTEGRACION_01_RPC_OPERATIVAS.md`).
2. **Login real**: `index.html` apunta al backend nuevo (`hqrjbgheclpnfoexyzyj`), PIN reemplazado por Supabase Auth real, permisos por rol conectados. Ver `docs/context/HANDOFF_INTEGRACION_02_LOGIN.md`.
3. **Módulos secundarios**: Clientes, Proveedores, Caja y Configuración reescritos contra el backend real. Ver `docs/context/HANDOFF_INTEGRACION_03_MODULOS_SECUNDARIOS.md`.
4. **Mesas** (pantalla protegida): reconectada al backend real sin cambiar su composición visual — completado como parte del trabajo de LOOP 08A (ver abajo), porque ese loop lo requería para poder cumplir su propia QA.

## LOOP 08A — Mobile Quick Service
Pantalla móvil complementaria para registrar consumos de mesa sin scroll, exclusiva para viewport ≤600px (botón flotante ⚡, nunca visible en desktop). Reutiliza `abrir_orden`/`agregar_persona`, sin RPC nuevas. 8 casos de QA (A-H) del spec verificados. Ver `docs/context/LOOP_08A.md` y `docs/context/HANDOFF_LOOP_08A.md`.

De paso se corrigieron 2 bugs pre-existentes reales: `crypto.randomUUID` sin respaldo, y el contenedor HTML del ticket de papel rasgado que nunca existió (CSS y lógica ya estaban, faltaba el HTML — cobrar fallaba en silencio al intentar mostrarlo).

## Estado del tenant real
"Pa Comer" (`920201cb-b3d4-4d29-bed1-f6f628463a6e`) quedó **sin ningún usuario** a propósito — quien abra la app por primera vez debe crear el administrador real con su propio nombre y PIN a través del formulario de arranque. Las 20 mesas reales ya están sembradas en `public.tables`.

## Pendiente real (no de integración, de producto)
Con la integración completa, la app ya es funcional de punta a punta contra el backend real. Lo que queda del plan original de 14 loops: Loop 13 (QA operativo formal), Loop 14 (Optimización y entrega). Loops 09, 10, 11 y 12 ya están completos — ver arriba.

## Loops completados
- Loop 01: auditoría base.
- Loop 02: backend nuevo a la medida (`hqrjbgheclpnfoexyzyj`), 30 tablas, RLS, índices.
- Loop 03: 8 RPC financieras transaccionales e idempotentes, probadas en vivo.
- Loop 04: control de rol en RPC administrativas, RLS verificada correctamente (con corrección de metodología: probar como rol `authenticated`, no como `postgres`), fix del bug `usuarioActivo`/`usuarioActual` en `index.html`, y login real (PIN como contraseña) implementado y verificado con HTTP real contra Supabase Auth (`bootstrap_admin`, `crear_usuario`, `list_staff_for_login`).
- Loop 05: cartera de clientes confiable — cupo de crédito aplicado en `registrar_fiado`, saldo consolidado en una sola vista (`customer_credit_detail`) reutilizada por `registrar_abono`, y `customer_balances` (saldo + vencido) para los KPI de cartera. Vistas creadas con `security_invoker=true` y verificadas contra RLS real.
- Loop 06: cuentas por pagar a proveedores — `registrar_compra` (nueva, antes no existía forma de crear una compra vía API), fechas de pedido/factura/vencimiento en `purchases`, estados PENDIENTE/PARCIAL/PAGADA/VENCIDA calculados en `purchase_detail`, `supplier_balances` para KPI, y `registrar_pago_proveedor` paga primero lo más próximo a vencer.
- Loop 07: flujo de caja completo (apertura → operación → **arqueo** → cierre, `COUNTING` ahora sí bloquea operaciones), `reabrir_caja` (admin-only, pendiente desde Loop 03), rastro de usuario en cada paso, `cash_session_detail` con esperado recalculado en vivo.
- Loop 08: `dashboard_resumen(periodo)` — todos los KPI obligatorios (ventas, mesas, crédito, proveedores, caja, operación) con filtros Hoy/7d/30d, admin-only, verificado campo por campo contra un escenario armado a mano. `anulaciones`/`correcciones` quedan en 0/`null` honestamente porque todavía no existe el mecanismo que los alimente (Loop 11).
- Loop 09: responsive de Clientes, Proveedores, Caja y Configuración (drill-down en móvil, grids que colapsan a una columna, fix de bug en Configuración). Cero cambios en desktop ni en Mesas. "Dashboard" del spec no existe como página, queda pendiente real.
- Loop 10: manifest + Service Worker (cascarón estático, nunca Supabase) + cola de sincronización en IndexedDB para "agregar consumo a una mesa" (Mesas y Quick Service) — nada que mueva dinero se encola nunca. Probado en vivo: registrar sin internet, reconectar, sincroniza solo, sin duplicar sesiones. Desplegado en Vercel.
- Loop 11: `registrar_evento_sesion` (login/logout, únicos eventos del spec que faltaban — el resto de RPC mutantes ya auditaban desde loops anteriores), botón real de "Salir" (no existía), pantalla Auditoría admin-only (`listar_auditoria`) con filtros. RLS de `audit_events` endurecida a admin-only (antes cualquier usuario autenticado del tenant podía leerla completa).
- Loop 12: exportación real de 26 tablas del tenant (antes exportaba solo lo cargado en pantalla). Restauración con alcance acordado con el usuario (solo clientes/proveedores/config, nunca historial financiero), validación completa antes de escribir, vista previa, y reutilización de RPC ya auditadas.

**Falta conectar `index.html` al backend nuevo — requiere reescribir su capa de datos, esfuerzo grande pendiente de confirmación, ver `docs/context/HANDOFF_LOOP_04.md`.**

## Backend oficial (desde Loop 02)

**Proyecto Supabase: `Pa Comer POS` — id `hqrjbgheclpnfoexyzyj` — región us-east-1 — org `pacomer` — plan gratuito $0/mes.**

Creado a la medida en el Loop 02, incorporando los hallazgos de Loop 01. 30 tablas, RLS completo, 1 tenant real ("Pa Comer") sembrado. Ver `docs/context/HANDOFF_LOOP_02.md` y `docs/architecture/DATA_MODEL.md` para el detalle. `kxgusnavshomweqddwvo` (abajo, sección B) y `jhuwepkpjjvponryzykp` quedan como referencia histórica, no como backend activo.

## Baseline

Pa' Comer POS v3.0.0 (front-end, `index.html` del repo). Confirmado byte-idéntico a `reference/PA_COMER_POS_v3_0_0_AUDIT_SOURCE.html`.

## Product modules (front-end actual)

- Mesas (protegida)
- Clientes
- Proveedores
- Caja
- Dashboard (admin-only, Loop Dashboard)
- Configuración
- Auditoría (admin-only, Loop 11)

## Protected area

Mesas.

## HALLAZGO CRÍTICO DE LOOP 01 (histórico): dos backends desconectados

El front-end y el backend "objetivo" ya construido **no están conectados entre sí**. Son dos mitades del mismo producto que nunca se unieron:

### A. Backend que usa el front-end HOY (`index.html`)

- Proyecto Supabase: `jhuwepkpjjvponryzykp` (hardcodeado en `index.html:872`).
- Schema: `pos_pacomer`.
- **No accesible desde el MCP de Supabase conectado a esta sesión** — no aparece en `list_projects` bajo ninguna de las cuentas que se han conectado hasta ahora. No se pudo auditar su estructura real de tablas/RLS directamente; el modelo de tablas se infiere del código cliente (ver `DATA_MODEL.md`, sección "Modelo legacy").
- Modelo de datos ad-hoc: objeto `db` gigante serializado a `localStorage` (`pacomer_v20`) como respaldo, con tablas planas (`mesa_personas`, `llevar`, `domicilios`, `clientes`, `cliente_historial`, `proveedores`, `proveedor_movimientos`, `movimientos`, `caja`, `caja_gastos`, `config`, `usuarios`).
- Auth: PIN de 4 dígitos en texto plano, guardado en la tabla `usuarios` y comparado en el cliente (`index.html:2317-2318`). No es autenticación real.

### B. Backend ya construido con la arquitectura objetivo (proyecto Supabase conectado al MCP)

- Proyecto: `pacomer.mtb@gmail.com's Project`, id `kxgusnavshomweqddwvo`, región us-west-2, creado **2026-09-12** (3 días antes de este loop).
- Schema: `public`, 29 tablas, multi-tenant vía `tenant_id` → `restaurants`.
- Ya implementa varios de los objetivos de este mismo plan de loops: entidades normalizadas, `idempotency_keys`, `audit_events`, `payment_allocations`, roles (`servidor`/`cajero`/`supervisor`/`admin`), Supabase Auth real (existe 1 usuario `auth.users` = `pacomer.mtb@gmail.com`, vinculado a `app_users` con rol `admin`).
- Historial de migraciones confirma que fue construido con un plan de loops **previo y con numeración distinta** al de este paquete: `loop05_backend_core`, `loop08_payments_cash`, `loop09_customer_credit`, `loop10_suppliers_purchases`, `loop11_receipts`, `loop13_security_roles` (todas fechadas 2026-09-12/13).
- Contiene datos de prueba, no vacío: 1 `restaurants` ("Pa Comer - Prueba"), 14 mesas, 14 sesiones de mesa, 21 comensales, 21 consumos, 21 obligaciones de pago, 11 pagos, 3 sesiones de caja, 12 movimientos de caja, 3 proveedores, 3 compras, 42 eventos de auditoría, 35 claves de idempotencia.
- **Gaps encontrados en este backend** (ver `SYSTEM_ARCHITECTURE.md` → Riesgos):
  - Cero funciones RPC de negocio (solo existe `current_tenant_id()`, un helper de lectura). No existe `cobrar_persona`, `cobrar_mesa`, `registrar_fiado`, `abrir_caja`, `cerrar_caja`, etc. — es decir, el Loop 03 de este plan (lógica financiera transaccional) todavía no se implementó aquí a pesar del nombre de las migraciones.
  - Todas las políticas RLS existentes son de solo `SELECT`. No hay políticas de `INSERT`/`UPDATE`/`DELETE` en ninguna tabla — hoy nadie puede escribir a través de la API pública; los datos de prueba se insertaron por otra vía (SQL directo/service role).
  - 10 tablas tienen RLS activado **sin ninguna política** (`changes`, `credit_repayment_allocations`, `credit_repayment_change`, `credit_repayment_tenders`, `idempotency_keys`, `payment_allocations`, `receipt_counters`, `supplier_payment_allocations`, `supplier_payment_tenders`, `tenders`) → inaccesibles vía API incluso para lectura.
  - `current_tenant_id()` es `SECURITY DEFINER` y ejecutable por `anon` y `authenticated` sin restricción, con `search_path` mutable — advertencia de seguridad de Supabase.
  - Protección de contraseñas filtradas (HaveIBeenPwned) desactivada en Auth.
  - 44 foreign keys sin índice de cobertura (impacto de rendimiento a futuro, no crítico con el volumen actual).

## Target state (sin cambios respecto al plan)

- POS confiable para operación real
- seguridad por backend
- transacciones financieras atómicas
- dashboard gerencial
- PWA instalable
- operación offline con sincronización
- auditoría
- backups seguros
- QA operativo repetible

## Current source reference

- Front-end: `reference/PA_COMER_POS_v3_0_0_AUDIT_SOURCE.html` (= `index.html` actual del repo).
- Backend objetivo (parcial): proyecto Supabase `kxgusnavshomweqddwvo`, schema `public`.

## Decisión tomada (Loop 02)

Ni `kxgusnavshomweqddwvo` ni `jhuwepkpjjvponryzykp` son el backend oficial. El usuario pidió explícitamente un proyecto nuevo "a la medida" (`hqrjbgheclpnfoexyzyj`, ver arriba). `index.html` todavía no está conectado a ningún backend nuevo — sigue apuntando a `jhuwepkpjjvponryzykp` (legacy) hasta el loop de integración front-end↔backend.
