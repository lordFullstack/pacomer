# BUSINESS RULES

_Base del paquete de loops + verificación Loop 01 contra código y backend real + implementación Loop 03._

> **Actualización Loop 03**: las reglas de Mesas, Crédito, Caja y Auditoría descritas abajo ya están **implementadas y probadas** como funciones RPC en el proyecto `hqrjbgheclpnfoexyzyj` (`cobrar_persona`, `cobrar_mesa`, `registrar_fiado`, `registrar_abono`, `registrar_gasto`, `registrar_pago_proveedor`, `abrir_caja`, `cerrar_caja` — ver `docs/context/HANDOFF_LOOP_03.md`). Las notas "_Verificado Loop 01: ... pero ninguna función RPC los aplica todavía_" de abajo ya no aplican para esas reglas; se dejan tachadas conceptualmente como historial y se agrega el estado real al final de cada sección.

## Mesas

- Mesa libre = no tiene personas activas.
- Mesa ocupada = tiene al menos una persona activa.
- Persona pagada no puede volver a cobrarse.
- Persona fiada no puede cobrarse nuevamente.
- Cobrar mesa solo liquida pendientes.
- Liberar sin cobrar requiere confirmación explícita.

_Verificado Loop 01: el modelo objetivo (`payment_obligations.status`) ya soporta estos estados (`PENDING|PARTIAL|PAID|CREDIT|SETTLED`)._
_Implementado Loop 03: `cobrar_persona`/`cobrar_mesa` solo cobran obligaciones `PENDING`/`PARTIAL`, las marcan `PAID` (o `PARTIAL` si el pago no las cubre del todo), y una obligación `PAID`/`CREDIT` queda automáticamente excluida de futuros cobros — probado con doble intento de cobro sobre el mismo comensal (rechazado)._

## Crédito

- Abono no puede superar saldo.
- Cargo aumenta saldo.
- Cada cargo/abono crea historial.
- Los movimientos no deben borrarse físicamente en operación normal.

_Verificado Loop 01: el modelo objetivo separa cargo (`customer_credits`) de abono (`credit_repayments`) en tablas distintas, sin borrado físico por diseño (no hay operación DELETE expuesta)._
_Implementado Loop 03: `registrar_abono` valida `abono <= saldo pendiente` (probado: abono de $100.000 sobre saldo de $30.000 fue rechazado); `registrar_fiado` crea el cargo. Ninguna de las dos funciones borra filas._
_Implementado Loop 05: además del saldo, `registrar_fiado` ahora valida el **cupo de crédito** (`customers.credit_limit`) — probado: fiar más allá del cupo disponible es rechazado con el saldo actual y el cupo en el mensaje. El saldo se calcula desde una única vista (`customer_credit_detail`), compartida por `registrar_abono` y `registrar_fiado`, para que nunca diverja entre ambas. Se agregó `customers.credit_term_days` y la vista `customer_balances` (`saldo`, `saldo_vencido`) para poder responder "cartera vencida" — probado con un cargo retrocedido más allá del plazo._

## Caja

- Solo una apertura activa por fecha/caja.
- Caja cerrada no recibe movimientos normales.
- Todo cierre guarda esperado, real y diferencia.
- Reapertura requiere permiso administrativo y auditoría.

_Verificado Loop 01: `cash_sessions` ya tiene columnas `expected_cash`/`counted_cash`/`difference` y estados `OPEN|OPERATING|COUNTING|CLOSED`._
_Implementado Loop 02: índice único parcial `cash_sessions_one_active_per_tenant` impide dos sesiones no-`CLOSED` simultáneas a nivel de constraint._
_Implementado Loop 03: `abrir_caja` y `cerrar_caja` (probadas: segunda apertura con caja activa rechazada; `cerrar_caja` calcula `expected_cash` correctamente sumando los movimientos reales); `registrar_gasto` rechaza operar sin caja abierta._
_Implementado Loop 07: flujo completo de 4 pasos (`abrir_caja` → operación → `iniciar_arqueo` → `cerrar_caja`), con `COUNTING` bloqueando nuevas operaciones desde que empieza el arqueo, no solo desde el cierre. **`reabrir_caja` ya existe** (admin-only, motivo obligatorio, genera auditoría) — probado: rechazada para `cajero`, aceptada para `admin`. `cash_session_detail` recalcula el esperado en vivo desde los movimientos reales, en cualquier momento, no solo al cerrar._

## Proveedores

Estados:
- PENDIENTE
- PARCIAL
- PAGADA
- VENCIDA

_Verificado Loop 01: el modelo objetivo no tiene estos 4 estados explícitos en `purchases`/`supplier_payments` (solo `status ACTIVE|VOIDED` en `supplier_payments`); el estado de cuenta por pagar (pendiente/parcial/pagada/vencida) debe derivarse de comparar `purchases.amount` vs. suma de `supplier_payment_allocations`._
_Implementado Loop 03: `registrar_pago_proveedor` calcula el saldo pendiente por proveedor exactamente así (suma de compras menos asignaciones de pagos `ACTIVE`) y valida `pago <= saldo`._
_Implementado Loop 06: los 4 estados ya son consultables vía la vista `purchase_detail.status` (`PENDIENTE|PARCIAL|PAGADA|VENCIDA`, calculado, no guardado). Se agregaron `order_date`/`invoice_date`/`invoice_number`/`due_date` a `purchases` y la RPC `registrar_compra` (antes no existía forma de crear una compra vía API). `registrar_pago_proveedor` paga primero lo más próximo a vencer, no lo más antiguo — probado: una compra vencida se liquida antes que una pendiente más nueva._

## Auditoría

Operaciones críticas registran actor, acción, entidad, referencia, timestamp y metadata.

_Verificado Loop 01: `audit_events` ya tiene exactamente estas columnas (`actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`)._
_Implementado Loop 03: las 8 funciones RPC financieras escriben a `audit_events` en cada ejecución exitosa (vía helper interno `_audit`), nunca en un reintento idempotente repetido — probado: 7 operaciones distintas → exactamente 7 filas de auditoría, pese a que una de ellas se invocó 2 veces. Sigue sin existir una pantalla de consulta de auditoría (Loop 11)._

## Hallazgos de auditoría del front-end (Loop 01, ya conocidos del paquete original, re-confirmados contra el código)

1. El PIN actual se guarda en texto plano en `usuarios.pin` y se valida en cliente (`index.html:2317`) — no equivale a autenticación real. _Confirmado._
2. La función de permisos por rol existe en el front-end pero no está respaldada en backend/RLS — y de hecho el backend objetivo tiene un modelo de roles distinto (4 roles: `servidor/cajero/supervisor/admin`) al que asume el front-end (2 roles: admin/cajero). _Confirmado y ampliado._
3. Inconsistencia entre `db.usuarioActivo` (línea 839) y `ui.usuarioActual` (línea 2318). _Confirmado con líneas exactas._
4. Las operaciones financieras del front-end usan llamadas Supabase separadas sin transacción — riesgo de estado parcial. _Confirmado; el backend objetivo no tiene aún ninguna RPC transaccional para reemplazarlas._
5. No hay PWA (`manifest`/`serviceWorker`) en el `index.html` auditado. _Confirmado, cero coincidencias._
6. No existen `@media` queries en el archivo auditado. _Confirmado, cero coincidencias._
7. El backup actual (`localStorage['pacomer_v20']`) serializa el objeto `db` completo incluyendo PINs — debe excluir secretos/credenciales. _Confirmado._
8. El importador de backup necesita validación y merge/restore seguro (no revisado en detalle en Loop 01, pendiente para Loop 12).
