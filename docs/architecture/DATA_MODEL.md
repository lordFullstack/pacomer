# DATA MODEL — ESTADO REAL (Loop 01 + Loop 02)

> **Backend oficial desde Loop 02**: proyecto Supabase `Pa Comer POS` (`hqrjbgheclpnfoexyzyj`), 30 tablas, RLS completo. Ver sección **C** más abajo. Las secciones A y B documentan el estado encontrado en Loop 01 (modelo legacy del front-end y modelo del proyecto de prueba `kxgusnavshomweqddwvo`) y se conservan como referencia histórica — ninguno de los dos es el backend activo.

Tres modelos documentados: legacy (front-end actual), prueba (Loop 01, descartado) y oficial (Loop 02, activo).

---

## A. Modelo LEGACY — el que usa `index.html` hoy

Inferido del código cliente (`sb.from('...')`), ya que el proyecto Supabase que lo respalda (`jhuwepkpjjvponryzykp`, schema `pos_pacomer`) no es accesible desde esta sesión — **no verificado contra la base real**, solo contra el uso que el JS hace de él.

| Tabla | Uso observado en el código |
|---|---|
| `mesa_personas` | Personas sentadas por mesa, consumo, estado de pago/fiado |
| `llevar` | Órdenes "para llevar" (sin mesa) |
| `domicilios` | Órdenes a domicilio |
| `clientes` | Cartera de clientes, saldo |
| `cliente_historial` | Historial de cargos/abonos por cliente |
| `proveedores` | Proveedores |
| `proveedor_movimientos` | Movimientos/pagos a proveedores |
| `movimientos` | Movimientos generales (ligados a caja) |
| `caja` | Apertura/cierre de caja |
| `caja_gastos` | Gastos registrados contra caja |
| `config` | Configuración general de la app |
| `usuarios` | Usuarios + **PIN en texto plano** (`pin`), `rol` (default `'cajero'`), `activo` |

Persistencia de respaldo: `localStorage['pacomer_v20']` = `JSON.stringify(db)` completo (incluye PINs, sin filtrar).

No hay evidencia en el código de constraints, FKs explícitas ni tipos — todo se maneja como JSON suelto desde el cliente.

---

## B. Modelo OBJETIVO — ya construido en el backend (`kxgusnavshomweqddwvo`, schema `public`)

Verificado directamente contra la base de datos real vía MCP (`list_tables` verbose + `pg_policies`) el 2026-09-15. Multi-tenant: toda tabla de negocio tiene `tenant_id → restaurants.id`.

### Identidad

**`restaurants`** — `id (uuid, pk)`, `name`, `created_at`. 1 fila: "Pa Comer - Prueba".

**`app_users`** — `id (pk)`, `auth_user_id (uuid, unique, → auth.users)`, `tenant_id → restaurants`, `role` (check: `servidor|cajero|supervisor|admin`), `created_at`. 1 fila real: `admin` = `pacomer.mtb@gmail.com`.

### Mesas

**`tables`** — `id`, `tenant_id`, `label`, `created_at`. 14 filas.

**`table_sessions`** — `id`, `tenant_id`, `table_id → tables`, `status` (`OPEN|CLOSING|CLOSED`), `opened_at`, `closed_at`. 14 filas.

**`diners`** — `id`, `tenant_id`, `table_session_id → table_sessions`, `name`, `descriptor`, `created_by_user_id → app_users`, `created_at`. 21 filas.

**`consumptions`** — `id`, `tenant_id`, `diner_id → diners`, `amount` (check `> 0`), `created_at`. 21 filas.

### Cobros

**`payment_obligations`** — `id`, `tenant_id`, `diner_id → diners`, `consumption_id → consumptions`, `payment_mode` (`individual|conjunto`), `amount` (`>0`), `status` (`PENDING|PARTIAL|PAID|CREDIT|SETTLED`), `created_at`. 21 filas.

**`payments`** — `id`, `tenant_id`, `status` (`ACTIVE|VOIDED`, default `ACTIVE`), `amount` (`>=0`), `created_by_user_id`, `voided_at`, `voided_by_user_id`, `created_at`. 11 filas.

**`tenders`** — `id`, `payment_id → payments`, `method` (`efectivo|transferencia`), `amount` (`>0`), `created_at`. 11 filas.

**`payment_allocations`** — `id`, `payment_id → payments`, `obligation_id → payment_obligations`, `amount` (`>0`), `created_at`. 12 filas. **Sin política RLS (ni lectura).**

**`changes`** — vueltos: `id`, `payment_id → payments (unique)`, `amount` (`>=0`), `created_at`. 0 filas. **Sin política RLS.**

**`payment_void_requests`** — flujo de anulación con autorización: `id`, `tenant_id`, `payment_id → payments`, `status` (`PENDING_AUTHORIZATION|AUTHORIZED|DENIED|EXECUTED|SELF_EXECUTED`), `reason`, `requested_by_user_id`, `authorized_by_user_id`, `requested_at`, `resolved_at`. 1 fila.

### Caja

**`cash_sessions`** — `id`, `tenant_id`, `status` (`OPEN|OPERATING|COUNTING|CLOSED`), `opened_by_user_id`, `opening_cash` (default 0), `opened_at`, `closed_at`, `counted_cash`, `expected_cash`, `difference`, y desde Loop 07: `counting_started_at`, `counted_by_user_id`, `closed_by_user_id`, `reopened_at`, `reopened_by_user_id`, `reopen_reason`. 3 filas (histórico de prueba).

**`cash_session_detail`** (vista, Loop 07, `security_invoker=true`) — recalcula `ingresos`, `egresos`, `movimientos_neto` y `esperado_actual` en vivo desde `cash_movements`, en cualquier estado de la sesión (no solo al cerrar).

**`cash_movements`** — `id`, `tenant_id`, `cash_session_id → cash_sessions`, `type` (`SALE|ADJUSTMENT|REVERSAL|SUPPLIER_PAYMENT`), `amount`, `payment_id → payments (nullable)`, `created_at`. 12 filas.

### Clientes / crédito

**`customers`** — `id`, `tenant_id`, `name`, `phone`, `type` (`persona|empresa`), `credit_limit` (`>0`, nullable = sin límite), `credit_term_days` (default 30, `>0`, agregado en Loop 05), `created_at`. 0 filas.

**`customer_credit_detail`** (vista, Loop 05, `security_invoker=true`) — saldo pendiente por cargo individual (`amount - asignado en abonos activos`). Fuente única de verdad del saldo, usada por `registrar_abono`, `registrar_fiado` y cualquier reporte futuro.

**`customer_balances`** (vista, Loop 05, `security_invoker=true`) — un renglón por cliente: `saldo` total y `saldo_vencido` (cargos con más de `credit_term_days` de antigüedad). Base de los KPI de cartera.

**`customer_credits`** — `id`, `tenant_id`, `customer_id → customers`, `obligation_id → payment_obligations (unique)`, `amount` (`>0`), `created_by_user_id`, `created_at`. 0 filas.

**`credit_repayments`** — `id`, `tenant_id`, `customer_id → customers`, `status` (`ACTIVE|VOIDED`), `applied_amount` (`>=0`), `created_by_user_id`, `created_at`. 0 filas.

**`credit_repayment_tenders`**, **`credit_repayment_allocations`**, **`credit_repayment_change`** — desgloses de método de pago/asignación/vuelto del abono, análogos a `tenders`/`payment_allocations`/`changes` pero para abonos de cartera. 0 filas cada una. **Sin política RLS (ninguna, ni lectura).**

### Proveedores

**`suppliers`** — `id`, `tenant_id`, `name`, `payment_terms` (`contado|semanal|quincenal`), `created_at`. 3 filas.

**`purchases`** — `id`, `tenant_id`, `supplier_id → suppliers`, `amount` (`>0`), `created_by_user_id`, `created_at`, y desde Loop 06: `order_date` (default hoy), `invoice_date`, `invoice_number`, `due_date` (calculado desde `suppliers.payment_terms` si no se especifica). 3 filas.

**`purchase_detail`** (vista, Loop 06, `security_invoker=true`) — saldo pendiente por compra + `status` calculado (`PENDIENTE|PARCIAL|PAGADA|VENCIDA`). Fuente única de verdad, usada por `registrar_pago_proveedor`.

**`supplier_balances`** (vista, Loop 06, `security_invoker=true`) — saldo total y vencido por proveedor.

**`supplier_payments`** — `id`, `tenant_id`, `supplier_id → suppliers`, `status` (`ACTIVE|VOIDED`), `applied_amount` (`>0`), `created_by_user_id`, `created_at`. 0 filas.

**`supplier_payment_tenders`**, **`supplier_payment_allocations`** — desglose de método/asignación del pago a proveedor. 0 filas. **Sin política RLS.**

### Auditoría / infraestructura transaccional

**`audit_events`** — `id`, `tenant_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata (jsonb, default {})`, `created_at`. 42 filas.

**`idempotency_keys`** — PK compuesta `(tenant_id, idempotency_key)`, `request_fingerprint`, `response_body (jsonb)`, `created_at`. 35 filas. **Sin política RLS.**

**`receipt_counters`** — PK `tenant_id`, `next_number (bigint, default 1)`. 0 filas. **Sin política RLS.**

**`receipts`** — `id`, `tenant_id`, `sequential_number`, `obligation_ids (uuid[])`, `amount` (`>0`), `customer_name`, `customer_id_number`, `issued_by_user_id`, `issued_at`. 0 filas.

### RPC operativas de órdenes (Integración paso 1)

`abrir_orden`, `agregar_persona`, `editar_valor_persona`, `liberar_orden` — completan el ciclo de vida de una orden (mesa/llevar/domicilio) que antes solo tenía las RPC de cobro (Loop 03). Ver `docs/context/HANDOFF_INTEGRACION_01_RPC_OPERATIVAS.md`.

### Dashboard (Loop 08)

**`dashboard_resumen(periodo text)`** (función, admin-only) — KPI consolidados de ventas, mesas, crédito, proveedores, caja y operación, filtrables por `hoy|7d|30d`, reutilizando `customer_balances`, `supplier_balances`, `purchase_detail` y `cash_session_detail` como fuente. Ver `docs/context/HANDOFF_LOOP_08.md` para el detalle completo de cada campo devuelto.

### Funciones

Solo existe **`current_tenant_id()`** — `SQL STABLE SECURITY DEFINER`, retorna `uuid`: `select tenant_id from app_users where auth_user_id = auth.uid()`. Es la base de todas las políticas RLS de `SELECT` (`tenant_id = current_tenant_id()`). No existe ninguna función RPC de caso de uso (`cobrar_persona`, `cobrar_mesa`, `registrar_fiado`, `registrar_abono`, `registrar_gasto`, `registrar_pago_proveedor`, `abrir_caja`, `cerrar_caja`) — quedan para Loop 03.

### Políticas RLS existentes

19 tablas tienen exactamente 1 política, de `SELECT`, forma `tenant_id = current_tenant_id()` (o `id = current_tenant_id()` en `restaurants`). **Ninguna tabla tiene política de INSERT/UPDATE/DELETE.** 10 tablas no tienen ninguna política (listadas arriba con la nota "Sin política RLS").

---

---

## C. Modelo OFICIAL — proyecto `Pa Comer POS` (`hqrjbgheclpnfoexyzyj`, schema `public`)

Construido en Loop 02 a la medida, sobre la base validada del modelo objetivo (sección B) pero cerrando sus gaps. 30 tablas, tenant real sembrado: `restaurants` = **"Pa Comer"**.

Diferencias respecto al modelo de la sección B:

- **`app_users.role`**: check limitado a `admin`/`cajero` (2 roles, no 4). Además incluye `nombre` y `activo` para no perder esos campos del modelo legacy.
- **`app_config`** (nueva): `tenant_id`, `key`, `value jsonb`, `updated_at` — pk `(tenant_id, key)`. Cierra el hueco de "config" del modelo legacy.
- **`table_sessions.channel`** (nuevo campo): `'mesa'|'llevar'|'domicilio'`, con constraint `table_session_channel_table_ck` que exige `table_id` solo si `channel='mesa'`. Cierra el hueco de "para llevar"/"domicilio" — ya no son conceptos aparte, son sesiones sin mesa física.
- **`cash_sessions`**: índice único parcial `cash_sessions_one_active_per_tenant` sobre `(tenant_id) WHERE status <> 'CLOSED'` — la regla "solo una apertura activa por caja" (`BUSINESS_RULES.md`) queda enforced por constraint, no solo por convención de la app.
- **RLS**: las 30 tablas tienen política de `SELECT` (incluidas las 9 tablas hijas sin `tenant_id` propio, vía `EXISTS` contra la tabla padre — `tenders`, `payment_allocations`, `changes`, `credit_repayment_tenders/allocations/change`, `supplier_payment_tenders/allocations`). 0 tablas sin política (vs. 10 en el modelo de prueba).
- **Índices**: 52 índices de cobertura sobre foreign keys creados explícitamente. 0 advisories de FK sin índice (vs. 44 en el modelo de prueba).
- **Funciones helper**: `current_tenant_id()` y `current_role()`, ambas `SECURITY DEFINER` con `search_path` fijo explícito y `EXECUTE` revocado a `anon` (solo `authenticated` puede ejecutarlas — necesario para que RLS funcione en queries directas del cliente).
- Todo lo demás (entidades de mesas/cobros/caja/crédito/proveedores/auditoría/idempotencia/recibos) replica 1:1 las tablas y columnas de la sección B — ver esa sección para el detalle completo de columnas, ya que no cambió.

Estado de escritura: igual que en la sección B, **solo hay políticas de SELECT** — las escrituras llegarán vía funciones RPC `SECURITY DEFINER` en Loop 03. Esto es diseño intencional (mismo patrón que ya funcionaba en el proyecto de prueba), no un gap nuevo.

Cero funciones RPC de negocio todavía (solo los dos helpers de lectura). Cero filas de datos operativos — solo el tenant "Pa Comer" y su contador de recibos en 1.

---

## Relación entre los modelos legacy y objetivo/oficial

No hay mapeo 1:1 automático. Equivalencias conceptuales aproximadas para cuando se decida migrar/conectar:

| Legacy (`pos_pacomer`) | Objetivo (`public`) |
|---|---|
| `mesa_personas` | `table_sessions` + `diners` + `consumptions` + `payment_obligations` |
| `llevar` / `domicilios` | Sin equivalente aún — el modelo objetivo no distingue "para llevar"/"domicilio" de una mesa; requiere decisión de diseño en el loop que se ocupe de esto |
| `clientes` | `customers` |
| `cliente_historial` | `customer_credits` + `credit_repayments` |
| `proveedores` | `suppliers` |
| `proveedor_movimientos` | `purchases` + `supplier_payments` |
| `movimientos` | `cash_movements` + `payments` |
| `caja` | `cash_sessions` |
| `caja_gastos` | `cash_movements` (`type='ADJUSTMENT'`, a confirmar) |
| `config` | Sin equivalente — no existe tabla de configuración en el modelo objetivo |
| `usuarios` (PIN texto plano) | `app_users` + Supabase `auth.users` (ya con auth real) |

Este mapeo es una hipótesis de Loop 01, no una decisión tomada — debe confirmarse explícitamente antes de escribir cualquier migración de datos real.
