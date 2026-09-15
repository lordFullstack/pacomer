# HANDOFF LOOP 02 — INTEGRIDAD DEL MODELO DE DATOS (backend nuevo a la medida)

## Loop
LOOP_02 (adelantado a pedido explícito del usuario: "crea uno a la medida en Pa Comer" → proyecto Supabase nuevo desde cero)

## Objetivo
Normalizar entidades y estados en un backend construido a la medida de Pa'Comer, incorporando los hallazgos del Loop 01 (en vez de seguir arrastrando el modelo legacy ni reutilizar el proyecto de prueba `kxgusnavshomweqddwvo` tal cual).

## Implementado

- **Proyecto Supabase nuevo**: `Pa Comer POS` (id `hqrjbgheclpnfoexyzyj`, org `pacomer`, región `us-east-1`, plan gratuito $0/mes, confirmado con el usuario antes de crear).
- Schema `public` completo: 30 tablas, replicando el modelo objetivo validado en Loop 01 pero corrigiendo sus gaps conocidos:
  - **Roles**: `app_users.role` limitado a `admin`/`cajero` (2 roles), siguiendo la decisión explícita de `docs/context/LOOP_CONTEXT.md`, en vez de los 4 roles (`servidor/cajero/supervisor/admin`) del proyecto de prueba anterior.
  - **Canal de orden**: `table_sessions.channel` (`mesa`/`llevar`/`domicilio`) con constraint que exige `table_id` solo cuando `channel='mesa'` — cierra el hueco de "para llevar"/"domicilio" que el modelo anterior no contemplaba.
  - **Configuración**: tabla `app_config` (`tenant_id`, `key`, `value jsonb`) — no existía en el modelo anterior.
  - **Una sola caja activa por tenant**: índice único parcial `cash_sessions_one_active_per_tenant` sobre `(tenant_id) WHERE status <> 'CLOSED'` — regla de `BUSINESS_RULES.md` ahora enforced a nivel de base de datos, no solo de intención.
  - **RLS completo**: las 30 tablas tienen RLS habilitado y **todas** tienen al menos política de `SELECT` tenant-aislada (incluidas las 9 tablas hijas sin `tenant_id` propio — `tenders`, `payment_allocations`, `changes`, `credit_repayment_tenders/allocations/change`, `supplier_payment_tenders/allocations` — vía `EXISTS` contra su tabla padre). El proyecto anterior tenía 10 tablas sin ninguna política.
  - **Índices de cobertura en todas las FK** (52 índices nuevos) — cero advisories de "unindexed foreign key" (vs. 44 en el proyecto anterior).
  - **Funciones helper endurecidas**: `current_tenant_id()` y `current_role()` con `search_path` fijo explícito (cierra el warning `function_search_path_mutable`) y `EXECUTE` revocado a `anon` (cierra el warning de `anon_security_definer_function_executable`). Queda un WARN esperado/aceptado: `authenticated` sí puede ejecutarlas (es necesario para que las políticas RLS funcionen cuando un usuario logueado hace SELECT directo).
- Tenant real sembrado: `restaurants` = **"Pa Comer"** (no "Pa Comer - Prueba"), con su fila inicial en `receipt_counters`.
- Escritura vía API pública sigue intencionalmente cerrada (solo políticas de SELECT) — las escrituras llegarán en Loop 03 mediante funciones RPC `SECURITY DEFINER` que validan reglas de negocio y generan auditoría/idempotencia, replicando el patrón ya usado (y correcto) en el proyecto de prueba anterior.

## Archivos modificados
- `docs/context/HANDOFF_LOOP_02.md` (este archivo, nuevo)
- Pendiente de actualizar en este mismo loop: `docs/context/PROJECT_STATE.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/DATA_MODEL.md` (para apuntar al proyecto nuevo como backend oficial).

No se tocó `index.html` (Mesas sigue protegida; la conexión del front-end a este backend es trabajo de un loop de integración posterior, no de este).

## Base de datos

Proyecto: `hqrjbgheclpnfoexyzyj` ("Pa Comer POS"). Ver migraciones abajo.

## Migraciones

Aplicadas en orden sobre `hqrjbgheclpnfoexyzyj`:
1. `loop02_core_tenant_mesas` — extensión pgcrypto, `restaurants`, `app_users`, `app_config`, `tables`, `table_sessions`, `diners`, `consumptions`.
2. `loop02_payments_cash` — `payment_obligations`, `payments`, `tenders`, `payment_allocations`, `changes`, `payment_void_requests`, `cash_sessions` (+ índice único de caja activa), `cash_movements`.
3. `loop02_credit_suppliers` — `customers`, `customer_credits`, `credit_repayments`, `credit_repayment_tenders/allocations/change`, `suppliers`, `purchases`, `supplier_payments`, `supplier_payment_tenders/allocations`.
4. `loop02_audit_idempotency_receipts` — `audit_events`, `idempotency_keys`, `receipt_counters`, `receipts`.
5. `loop02_functions_rls_select_policies` — `current_tenant_id()`, `current_role()`, RLS habilitado + políticas SELECT en las 30 tablas.
6. `loop02_fk_indexes` — 52 índices de cobertura sobre foreign keys.
7. `loop02_seed_tenant` — inserta el tenant real "Pa Comer" y su `receipt_counters`.
8. `loop02_harden_helper_functions` — revoca `EXECUTE` de `anon` sobre las funciones helper.

## QA ejecutado

### Test
- [x] `list_tables(verbose)` post-migración: 30 tablas, todas con `rls_enabled=true`.
- [x] `get_advisors(security)`: 0 hallazgos de RLS sin política (vs. 10 en el proyecto anterior); 0 hallazgos de `anon` ejecutando funciones `SECURITY DEFINER` (vs. 1 en el anterior); queda 1 WARN esperado (`authenticated` puede ejecutar las funciones helper — necesario para RLS).
- [x] `get_advisors(performance)`: 0 hallazgos de foreign key sin índice (vs. 44 en el anterior); solo quedan INFO de "índice sin uso todavía" (esperado, base recién creada sin tráfico).
- [x] Confirmado 1 fila en `restaurants` ("Pa Comer") y 1 fila en `receipt_counters` ligada a ese tenant.
- [ ] Pendiente (Loop 03+): probar que un `INSERT` directo vía API con rol `authenticated` sin RPC es efectivamente rechazado por RLS (comportamiento esperado, no verificado end-to-end todavía).

## Evidencia

Ver salidas de `list_tables`, `get_advisors(security)` y `get_advisors(performance)` ejecutadas en esta sesión inmediatamente después de aplicar las migraciones.

## Riesgos

1. **Leaked password protection sigue desactivada** en Auth para este proyecto — es una configuración de plataforma (Auth settings), no se puede fijar por SQL/migración; requiere acción manual en el dashboard de Supabase o vía Management API con credenciales del usuario. P2.
2. El WARN de `authenticated` ejecutando `current_tenant_id()`/`current_role()` se acepta como diseño intencional (necesario para RLS), no como bug — pero debe revisarse si en algún loop futuro se decide exponerlas de forma distinta.
3. Cero funciones RPC de negocio todavía — el backend no puede recibir escrituras reales hasta Loop 03. Mismo hallazgo que en Loop 01, ahora sobre el proyecto correcto.
4. El proyecto de prueba anterior (`kxgusnavshomweqddwvo`) y el proyecto legacy real del front-end (`jhuwepkpjjvponryzykp`) siguen sin resolverse — quedan como historial/referencia, no como backend activo.

## Pendientes

- Actualizar `PROJECT_STATE.md`, `SYSTEM_ARCHITECTURE.md` y `DATA_MODEL.md` para que `hqrjbgheclpnfoexyzyj` sea el backend de referencia (en curso, mismo turno).
- Activar leaked password protection manualmente en el dashboard.
- Definir si/cuándo se migran o descartan los datos de `kxgusnavshomweqddwvo` y `jhuwepkpjjvponryzykp`.
- Loop 03: construir las funciones RPC transaccionales/idempotentes (`cobrar_persona`, `cobrar_mesa`, `registrar_fiado`, `registrar_abono`, `registrar_gasto`, `registrar_pago_proveedor`, `abrir_caja`, `cerrar_caja`) sobre este schema.
- Loop 04: conectar Supabase Auth real (crear el primer usuario admin) y, eventualmente, el front-end a este proyecto — reemplazando el PIN en texto plano.

## Decisiones

- Se descarta reutilizar `kxgusnavshomweqddwvo` como backend activo; ese proyecto queda como referencia histórica.
- El modelo de roles oficial es **admin/cajero** (2 roles), no los 4 roles del proyecto de prueba.
- Las claves publicables (anon key / URL) de este proyecto nuevo se compartirán con el usuario cuando se conecte el front-end (loop de integración), no antes, para no dejar código apuntando a un proyecto a medio construir.

## Próximo loop

LOOP_03 — Lógica financiera transaccional, sobre `hqrjbgheclpnfoexyzyj`.
