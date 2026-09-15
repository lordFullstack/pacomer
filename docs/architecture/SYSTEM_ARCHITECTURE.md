# SYSTEM ARCHITECTURE — ESTADO REAL (Loop 01 + Loop 02)

_Auditado contra código real (`index.html`) y backend real (Supabase MCP) el 2026-09-15._

> **Actualización Loop 02**: el backend oficial es ahora el proyecto Supabase **`Pa Comer POS` (`hqrjbgheclpnfoexyzyj`)**, construido desde cero a la medida (ver `docs/context/HANDOFF_LOOP_02.md`). Todo lo que sigue en este documento describe el estado encontrado en Loop 01 sobre el proyecto de prueba `kxgusnavshomweqddwvo` — se conserva como diagnóstico histórico que justificó las decisiones de diseño del Loop 02 (roles admin/cajero, canal mesa/llevar/domicilio, `app_config`, una sola caja activa, RLS completo en todas las tablas, índices en todas las FK, funciones helper endurecidas). `kxgusnavshomweqddwvo` y `jhuwepkpjjvponryzykp` ya no son backends activos.

## Resumen ejecutivo

Existen **dos sistemas paralelos no conectados**:

1. **Front-end desplegado** (`index.html`, 2360 líneas, monolito HTML+CSS+JS sin build step) — habla con un proyecto Supabase (`jhuwepkpjjvponryzykp`) al que esta sesión no tiene acceso, usando un modelo de datos plano y ad-hoc (schema `pos_pacomer`).
2. **Backend objetivo** (proyecto Supabase `kxgusnavshomweqddwvo`) — modelo normalizado, multi-tenant, con soporte de auditoría e idempotencia ya modelado en el schema, pero **sin las funciones RPC de negocio ni las políticas de escritura** que lo harían funcional, y al que el front-end no apunta.

Ningún loop de integridad/lógica/UI puede considerarse "hecho" hasta que se decida y ejecute cómo estos dos mundos se convierten en uno. Ese es el hallazgo P0 de este loop.

## 1. UI (front-end actual)

- Un único archivo `index.html`, sin bundler, sin dependencias npm. Carga `@supabase/supabase-js@2.45.4` desde CDN.
- Estado global en un objeto `db` (mutado directamente) + un objeto `ui` para estado de sesión/interfaz. **Inconsistencia confirmada**: `db.usuarioActivo` (línea 839, inicializado `null`) coexiste con `ui.usuarioActual` (asignado en el login, línea 2318) y se usan en sitios distintos del código (líneas 1219, 1271 usan `db.usuarioActivo`; el login solo setea `ui.usuarioActual`) — riesgo real de leer un usuario "activo" desactualizado o nulo en operaciones que sí deberían tener el usuario logueado.
- Persistencia local: `localStorage.setItem('pacomer_v20', JSON.stringify(db))` (línea 883) — vuelca el objeto `db` completo, sin filtrar campos sensibles (PINs incluidos).
- No hay `manifest.json` ni `serviceWorker` en el archivo auditado — no es una PWA instalable ni funciona offline hoy.
- No se encontraron `@media` queries — el layout no es responsive; esto es consistente con lo que exige proteger Mesas (Loop 09 es el único autorizado a tocar responsive, y no debe tocar Mesas).

## 2. Application layer (front-end)

No existe una capa de "casos de uso" separada. Las funciones de módulo llaman directo a `sb.from(...)` disperso por el archivo (ver `DATA_MODEL.md` para el listado completo de tablas referenciadas). Operaciones financieras como cobrar una mesa hacen múltiples llamadas a Supabase encadenadas sin transacción — si una falla a mitad de camino, el estado queda parcialmente aplicado (dinero cobrado sin liberar mesa, o viceversa). Esto es el hallazgo central que motiva el Loop 03.

## 3. Domain rules

Reglas de negocio hoy viven implícitas en el código de UI (validaciones inline, alguna función de permisos por rol). No hay un módulo centralizado de reglas. `docs/architecture/BUSINESS_RULES.md` documenta las reglas ya confirmadas por auditoría; el resto son deducidas del comportamiento esperado y deben verificarse loop a loop.

## 4. Persistence — backend real ya construido (`kxgusnavshomweqddwvo`, schema `public`)

Modelo normalizado multi-tenant. Todas las tablas cuelgan de `restaurants(id)` vía `tenant_id`, con 1 tenant de prueba ("Pa Comer - Prueba").

Entidades principales (ver `DATA_MODEL.md` para columnas completas):

- **Identidad/tenant**: `restaurants`, `app_users` (roles: `servidor`, `cajero`, `supervisor`, `admin` — 4 roles, no 2 como plantea `LOOP_CONTEXT.md` originalmente; a resolver en Loop 04).
- **Mesas**: `tables`, `table_sessions` (`OPEN`/`CLOSING`/`CLOSED`), `diners`, `consumptions`.
- **Cobros**: `payment_obligations` (`PENDING`/`PARTIAL`/`PAID`/`CREDIT`/`SETTLED`), `payments` (`ACTIVE`/`VOIDED`), `tenders` (`efectivo`/`transferencia`), `payment_allocations`, `changes` (vueltos), `payment_void_requests` (flujo de anulación con autorización).
- **Caja**: `cash_sessions` (`OPEN`/`OPERATING`/`COUNTING`/`CLOSED`, con `opening_cash`/`counted_cash`/`expected_cash`/`difference`), `cash_movements` (`SALE`/`ADJUSTMENT`/`REVERSAL`/`SUPPLIER_PAYMENT`).
- **Clientes/crédito**: `customers`, `customer_credits`, `credit_repayments`, `credit_repayment_tenders`, `credit_repayment_allocations`, `credit_repayment_change`.
- **Proveedores**: `suppliers`, `purchases`, `supplier_payments`, `supplier_payment_tenders`, `supplier_payment_allocations`.
- **Auditoría/infra**: `audit_events` (actor, acción, entidad, metadata jsonb), `idempotency_keys` (PK compuesta `tenant_id`+`idempotency_key`, guarda `response_body`), `receipt_counters`, `receipts`.

Esto ya modela correctamente los conceptos de Loop 02 (integridad) y deja la superficie lista para Loop 03 (idempotencia) y Loop 11 (auditoría) — falta la lógica, no el modelo.

## 5. Security — estado real del backend objetivo

- Supabase Auth **sí está activo**: 1 usuario real (`pacomer.mtb@gmail.com`) vinculado a `app_users` con rol `admin`.
- RLS habilitado en las 29 tablas, pero:
  - Solo hay políticas de `SELECT`, todas con la forma `tenant_id = current_tenant_id()`. **No existe ninguna política de INSERT/UPDATE/DELETE** — hoy la API pública no puede escribir nada; los datos de prueba se insertaron por otra vía.
  - 10 tablas no tienen ninguna política (ni de lectura) — inaccesibles vía API hoy: `changes`, `credit_repayment_allocations`, `credit_repayment_change`, `credit_repayment_tenders`, `idempotency_keys`, `payment_allocations`, `receipt_counters`, `supplier_payment_allocations`, `supplier_payment_tenders`, `tenders`.
  - `current_tenant_id()` (`SECURITY DEFINER`, resuelve `tenant_id` desde `auth.uid()`) es ejecutable por los roles `anon` y `authenticated` sin restricción, y tiene `search_path` mutable — 2 advertencias de seguridad del linter de Supabase.
  - Protección de contraseñas filtradas (HaveIBeenPwned) desactivada.
- El front-end actual no usa Supabase Auth en absoluto (usa PIN en texto plano comparado en cliente) — es decir, el mecanismo de seguridad real ya existe en el backend pero el front-end ni lo conoce.

## 6. Audit

`audit_events` ya existe como tabla (42 filas de prueba) con columnas `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at` — coincide con lo que pide `BUSINESS_RULES.md`/Loop 11. Falta: (a) las políticas de escritura, (b) que alguna función RPC realmente la alimente, (c) UI para consultarla.

## 7. Sync / offline

No implementado en ningún lado (ni front-end ni backend). Loop 10 completo por hacer.

## Riesgos (P0/P1/P2)

| # | Riesgo | Prioridad | Loop responsable |
|---|---|---|---|
| 1 | Front-end apunta a un proyecto Supabase (`jhuwepkpjjvponryzykp`) inaccesible desde esta sesión; no se puede auditar su estado real ni saber si tiene datos de producción reales | P0 | Decisión de producto antes de Loop 02 |
| 2 | Backend objetivo (`kxgusnavshomweqddwvo`) y front-end no están conectados — todo lo construido en el backend es invisible para el usuario final hoy | P0 | Loop de integración (no numerado explícitamente en el plan; debe decidirse) |
| 3 | PIN en texto plano, validado en cliente, sin relación con Supabase Auth | P0 | Loop 04 |
| 4 | Cero funciones RPC de negocio en el backend objetivo — ninguna operación financiera es transaccional/idempotente todavía pese a que el modelo ya soporta idempotencia | P0 | Loop 03 |
| 5 | RLS sin políticas de escritura en ninguna tabla del backend objetivo; 10 tablas sin ninguna política | P0 | Loop 02/04 |
| 6 | `current_tenant_id()` ejecutable por `anon`, `search_path` mutable | P1 | Loop 04/11 |
| 7 | `db.usuarioActivo` vs `ui.usuarioActual` inconsistente en el front-end | P1 | Loop 04 |
| 8 | Backup actual (`localStorage`/exportación futura) no filtra PINs/secretos | P1 | Loop 12 |
| 9 | Sin manifest/service worker — no hay PWA ni offline | P1 | Loop 10 |
| 10 | Sin media queries — módulos secundarios no responsive | P2 | Loop 09 |
| 11 | 44 foreign keys sin índice de cobertura en el backend objetivo | P2 | Loop 02/14 |
| 12 | HaveIBeenPwned check desactivado en Auth | P2 | Loop 04 |

## App ejecuta sin regresiones

Confirmado: Loop 01 fue auditoría y documentación pura. No se modificó `index.html` ni se ejecutó ningún DDL/escritura sobre el backend objetivo — solo lecturas (`list_tables`, `get_advisors`, `execute_sql` con `SELECT`). Cero riesgo de regresión introducido en este loop.
