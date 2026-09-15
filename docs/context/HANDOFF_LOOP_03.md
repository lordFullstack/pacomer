# HANDOFF LOOP 03 — LÓGICA FINANCIERA TRANSACCIONAL

## Loop
LOOP_03

## Objetivo
Eliminar operaciones financieras parcialmente ejecutadas: crear las 8 funciones RPC de negocio sobre el backend `Pa Comer POS` (`hqrjbgheclpnfoexyzyj`), cada una validar → ejecutar → movimiento → actualización de saldo/caja → auditoría → commit, con idempotencia.

## Implementado

8 funciones RPC `SECURITY DEFINER`, `search_path` fijo, ejecutables solo por `authenticated` (nunca `anon`):

1. **`abrir_caja(p_opening_cash, p_idempotency_key)`** — abre caja si no hay ninguna activa (además del índice único parcial del Loop 02, valida con un mensaje de error legible antes de chocar contra el constraint).
2. **`cerrar_caja(p_counted_cash, p_idempotency_key)`** — calcula `expected_cash = opening_cash + Σ cash_movements`, guarda `counted_cash` y `difference`, cierra la sesión.
3. **`cobrar_persona(p_diner_id, p_tenders, p_idempotency_key)`** — cobra todas las obligaciones `PENDING`/`PARTIAL` de un comensal. Valida que lo recibido cubra la deuda, calcula vuelto, reparte el pago entre las obligaciones (`payment_allocations`), marca `PAID`, registra `tenders`, `changes` si hay vuelto, y el movimiento de caja neto (solo si hubo efectivo).
4. **`cobrar_mesa(p_table_session_id, p_tenders, p_idempotency_key)`** — igual que `cobrar_persona` pero sobre todas las obligaciones pendientes de todos los comensales de una sesión de mesa.
5. **`registrar_fiado(p_obligation_id, p_customer_id, p_idempotency_key)`** — convierte el saldo pendiente de una obligación en `customer_credits` y marca la obligación como `CREDIT` (deja de poder cobrarse o volver a fiarse).
6. **`registrar_abono(p_customer_id, p_tenders, p_idempotency_key)`** — valida `abono <= saldo pendiente del cliente` (regla de `BUSINESS_RULES.md`), crea `credit_repayments`, reparte contra los `customer_credits` más antiguos primero, registra movimiento de caja si hay efectivo.
7. **`registrar_gasto(p_amount, p_description, p_idempotency_key)`** — requiere caja abierta, registra `cash_movements` tipo `GASTO` (monto negativo) con descripción.
8. **`registrar_pago_proveedor(p_supplier_id, p_tenders, p_idempotency_key)`** — valida `pago <= deuda pendiente del proveedor`, crea `supplier_payments`, reparte contra `purchases` más antiguas primero, movimiento de caja si hay efectivo.

Cada función:
- Verifica `idempotency_keys(tenant_id, idempotency_key)` **antes** de tocar cualquier estado de negocio. Si la clave ya existe con el mismo `request_fingerprint` (hash de los parámetros de entrada), devuelve la respuesta guardada sin re-ejecutar nada. Si existe con un fingerprint distinto, lanza error (evita reusar una clave para una operación distinta).
- Es atómica por construcción: al ser una única función PL/pgSQL, cualquier `raise exception` a mitad de camino revierte automáticamente todo lo hecho dentro de esa invocación (sin estados parciales).
- Escribe en `audit_events` con `actor_user_id`, `action`, `entity_type`, `entity_id` y `metadata` antes de retornar.
- Queda ligada a usuario (vía `created_by_user_id`/`actor_user_id`, resuelto con `current_app_user_id()`) y a referencia (IDs de las filas creadas/afectadas devueltos en el resultado).

### Cambios de esquema adicionales (para que "ligado a usuario y referencia" sea real)

`cash_movements` no tenía cómo referenciar un abono o un pago a proveedor (solo `payment_id`), ni quién lo generó, ni descripción. Se agregó:
- `credit_repayment_id`, `supplier_payment_id` (nullable, FK) — referencia explícita según el tipo de movimiento.
- `created_by_user_id` (nullable, FK a `app_users`) — trazabilidad directa sin necesitar join.
- `description` (nullable, text) — para gastos/ajustes.
- El dominio de `type` se amplió de `SALE/ADJUSTMENT/REVERSAL/SUPPLIER_PAYMENT` a `SALE/ABONO/GASTO/SUPPLIER_PAYMENT/ADJUSTMENT/REVERSAL`, uno por caso de uso, en vez de forzar `SALE`/`ADJUSTMENT` a significar cosas distintas.

## Archivos modificados
- `docs/context/HANDOFF_LOOP_03.md` (nuevo, este archivo)
- Pendiente en este mismo turno: actualizar `docs/architecture/BUSINESS_RULES.md` y `docs/architecture/DATA_MODEL.md`.

No se tocó `index.html`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop03_cash_movements_traceability` — ALTER a `cash_movements` (columnas + dominio de `type`).
2. `loop03_helpers_caja_rpc` — `current_app_user_id()`, `_idem_get`, `_idem_store`, `_audit` (internas, sin grant a nadie salvo el propio owner), `abrir_caja`, `cerrar_caja`.
3. `loop03_cobrar_persona_mesa_fiado` — `cobrar_persona`, `cobrar_mesa`, `registrar_fiado`.
4. `loop03_abono_gasto_pago_proveedor` — `registrar_abono`, `registrar_gasto`, `registrar_pago_proveedor`.

## QA ejecutado

Se probaron las 8 funciones **en vivo** contra la base real, simulando un usuario autenticado (`set_config('request.jwt.claim.sub', ...)` con un usuario de prueba `cajero` creado y luego eliminado) — no fue una revisión solo de sintaxis.

### Test
- [x] `abrir_caja` abre correctamente; reintentar con la **misma** `idempotency_key` devuelve el mismo `cash_session_id` sin crear una segunda caja (`cash_sessions` seguía en 1 fila).
- [x] `abrir_caja` con una clave **distinta** mientras hay una caja activa: rechazado (`Ya hay una caja abierta para este restaurante`).
- [x] `cobrar_persona`: comensal con obligación de $50.000, pagado con $60.000 en efectivo → `amount=50000`, `change=10000`, obligación pasó a `PAID`, se creó 1 `payments`, 1 `tenders`, 1 `changes` ($10.000), 1 `cash_movements` de $50.000 (neto de vuelto).
- [x] **Doble clic**: reinvocar `cobrar_persona` con la misma `idempotency_key` devuelve el mismo `payment_id`; conteos de `payments`/`tenders`/`changes`/`cash_movements` siguieron en 1 — cero duplicación.
- [x] **Persona pagada no puede volver a cobrarse**: reintentar con una `idempotency_key` nueva sobre el mismo comensal ya pagado → rechazado (`El comensal no tiene saldo pendiente por cobrar`).
- [x] `registrar_fiado`: convierte una obligación pendiente de $30.000 en `customer_credits`, la obligación pasa a `CREDIT`.
- [x] **Abono no puede superar saldo**: intentar abonar $100.000 sobre un saldo de $30.000 → rechazado (`El abono (100000) no puede superar el saldo pendiente (30000)`).
- [x] `registrar_abono` válido de $30.000: crea `credit_repayments` + reparte contra el `customer_credits` correcto.
- [x] `registrar_gasto` con caja abierta: crea movimiento `GASTO` de -$5.000 con descripción.
- [x] `registrar_gasto` **sin** caja abierta: rechazado (`No hay una caja abierta para registrar el gasto`) — confirma que "caja cerrada no recibe movimientos normales".
- [x] `registrar_pago_proveedor` de $80.000 por transferencia: no generó movimiento de caja (correcto, la transferencia no toca el efectivo del cajón).
- [x] `cobrar_mesa` sobre una sesión con 2 comensales ($20.000 + $15.000) pagada por transferencia: liquidó ambas obligaciones en un solo pago de $35.000, sin necesitar caja abierta (sin efectivo de por medio).
- [x] `cerrar_caja`: con `opening_cash=100000` y movimientos netos de +$75.000 (venta +50.000, abono +30.000, gasto -5.000), `expected_cash=175000`; se contó `175000` → `difference=0`.
- [x] `audit_events`: exactamente 7 filas para las 7 operaciones distintas ejecutadas (no 8/9, pese a que `cobrar_persona` se invocó 2 veces por la prueba de doble clic) — confirma que los reintentos idempotentes no generan auditoría duplicada.
- [x] `get_advisors(security)` tras crear las funciones: 0 hallazgos de `anon` ejecutando `SECURITY DEFINER` (todas revocadas a `anon`); solo quedan los WARN esperados de `authenticated` (necesario, es el rol que debe poder invocarlas).
- [x] Todos los datos de prueba (usuario de auth, `app_users`, mesas, sesiones, comensales, consumos, obligaciones, pagos, clientes, proveedores, compras, `audit_events`, `idempotency_keys`) fueron **eliminados** al terminar — el tenant "Pa Comer" quedó limpio, solo con su fila en `restaurants` y `receipt_counters` en 1.

## Evidencia
Resultados JSON de cada llamada RPC capturados en esta sesión (ver conversación). Conteos de filas antes/después de cada prueba y del cleanup final verificados con `list_tables`/`execute_sql`.

## Riesgos

1. Las funciones son ejecutables por cualquier usuario `authenticated` del proyecto sin importar su rol (`admin`/`cajero`) — **no hay control de permisos por rol todavía dentro de las RPC**. Por ejemplo, un `cajero` puede ejecutar `registrar_pago_proveedor`, que según `LOOP_CONTEXT.md` debería ser exclusivo de `admin`. Esto es P0 y corresponde resolverse en Loop 04 (Auth/roles), donde se agregarán chequeos `if current_role() <> 'admin' then raise exception ...` en las funciones que lo requieran.
2. `registrar_fiado` no valida `customer_credit_limit` (el límite de crédito del cliente) contra su cartera total — solo mueve el monto de la obligación puntual. Falta como regla explícita en Loop 05 (Clientes + crédito).
3. No existe todavía una función para "liberar mesa" ni para crear diners/consumptions/obligations (fuera del alcance de este loop) — el flujo completo de mesas seguirá sin poder probarse end-to-end hasta que esas piezas existan (probablemente Loop 02/05 de integración, o un loop de "operación diaria" no listado explícitamente en el índice de 14).
4. Reapertura de caja (`reabrir_caja`, mencionada en `BUSINESS_RULES.md` como "requiere permiso administrativo y auditoría") no se implementó — no estaba en la lista de 8 RPC de este loop.

## Pendientes
- Loop 04: agregar control de rol dentro de las RPC (no solo ocultar botones en UI), y conectar Auth real reemplazando el PIN.
- Loop 05/06: `reabrir_caja`, límite de crédito de clientes, estados PENDIENTE/PARCIAL/PAGADA/VENCIDA de proveedores derivados (hoy solo existe el saldo crudo, no el estado categorizado).
- Diseñar y construir las funciones de creación de mesas/comensales/consumos (no cubiertas por Loop 03) para poder probar el flujo completo sin insertar filas manualmente.

## Decisiones
- Idempotencia implementada como patrón común (`_idem_get`/`_idem_store`) reutilizado por las 8 funciones, en vez de duplicar la lógica — reduce riesgo de que una función "se olvide" de chequear la clave.
- `cash_movements.type` se amplió a un valor por caso de uso (`SALE/ABONO/GASTO/SUPPLIER_PAYMENT`) en vez de reusar `SALE`/`ADJUSTMENT` genéricamente, porque la trazabilidad por tipo es más clara para el futuro dashboard (Loop 08) y para el reporte de caja.
- Las funciones internas (`_idem_get`, `_idem_store`, `_audit`, y el propio `current_app_user_id`) están revocadas para `anon`; `current_app_user_id`/`current_role`/`current_tenant_id` se mantienen ejecutables por `authenticated` porque son necesarias para que RLS evalúe correctamente en consultas directas del cliente.

## Próximo loop
LOOP_04 — Auth, usuarios y roles: reemplazar el PIN del front-end, conectar Supabase Auth real, y (crítico) agregar control de rol dentro de las funciones RPC de Loop 03 que hoy no lo tienen.
