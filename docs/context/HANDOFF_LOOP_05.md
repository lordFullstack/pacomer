# HANDOFF LOOP 05 — CLIENTES Y CRÉDITO

## Loop
LOOP_05 (backend). La parte de UI ("ficha, historial, WhatsApp, búsqueda") queda para cuando se aborde la integración de front-end — no se tocó `index.html` en este loop.

## Objetivo
Convertir Clientes en una cartera confiable: saldo consistente en todas partes, cargos con origen/referencia, historial inmutable, y las reglas de crédito (abono ≤ saldo, cupo de crédito) realmente aplicadas.

## Implementado

- **`customers.credit_term_days`** (nuevo, default 30, `check > 0`): plazo en días para considerar un cargo vencido. No existía ningún concepto de plazo antes de este loop, y sin él era imposible calcular la "cartera vencida" que pide `KPI_DEFINITIONS.md`.
- **`customer_credit_detail`** (vista, `security_invoker = true`): calcula el saldo pendiente por cada cargo individual (`amount - asignado en abonos activos`). Es la **fuente única de verdad** del saldo — tanto `registrar_abono` como `registrar_fiado` (límite de crédito) como cualquier reporte futuro la consultan, en vez de repetir la misma lógica de join tres veces con riesgo de que diverjan.
- **`customer_balances`** (vista, `security_invoker = true`): un renglón por cliente con `saldo` total y `saldo_vencido` (cargos con más de `credit_term_days` de antigüedad). Cubre los KPI "cartera total", "clientes con deuda" (`saldo > 0`) y "cartera vencida".
- **`registrar_fiado` ahora valida el cupo de crédito**: si `customers.credit_limit` no es nulo, rechaza la operación cuando `saldo actual + nuevo cargo > credit_limit`. Este era un hallazgo pendiente explícito desde el Loop 04 (`HANDOFF_LOOP_04.md`, riesgo #2).
- **`registrar_abono` reescrita** para leer saldo y repartir abonos desde `customer_credit_detail` en vez de repetir el cálculo inline — mismo comportamiento, una sola fuente de verdad.

Ambas vistas se crearon con `security_invoker = true` deliberadamente: sin esa opción, una vista en Postgres se ejecuta con los privilegios de su dueño (aquí, el rol `postgres`, dueño de todas las tablas), lo cual **saltearía RLS por completo** para cualquiera que consultara la vista — un hueco de seguridad real, no solo teórico. Se verificó explícitamente que esto no ocurre (ver QA).

## Archivos modificados
- `docs/context/HANDOFF_LOOP_05.md` (nuevo)
- Pendiente en este turno: `docs/architecture/BUSINESS_RULES.md`, `docs/architecture/DATA_MODEL.md`, `docs/context/PROJECT_STATE.md`.

No se tocó `index.html`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop05_credit_term_and_balance_views` — `customers.credit_term_days`, vistas `customer_credit_detail` y `customer_balances`.
2. `loop05_fiado_credit_limit_and_abono_shared_view` — `registrar_fiado` con validación de cupo, `registrar_abono` reescrita sobre la vista compartida.

## QA ejecutado

### Test
- [x] Cliente con `credit_limit=50000`, `credit_term_days=10`: fiar $30.000 → aceptado. Fiar $40.000 adicionales (superaría el cupo) → **rechazado** con el saldo actual y el cupo en el mensaje de error.
- [x] Cargo de $30.000 con fecha retrocedida a 15 días (plazo de 10 días): `customer_balances.saldo_vencido` = $30.000, igual al saldo total (correcto, todo el saldo está vencido).
- [x] Abono de $10.000 vía transferencia: `saldo` y `saldo_vencido` bajan a $20.000 en la misma consulta — confirma que el saldo se mantiene consistente entre lo que ve `registrar_abono` y lo que muestra la vista, porque ambos leen la misma fuente.
- [x] **RLS de las vistas nuevas verificada como el rol `authenticated` real** (no `postgres` — lección aprendida y documentada en el Loop 04): creado un segundo tenant con un cliente "SECRETO"; consultando `customer_balances` autenticado como el usuario del tenant "Pa Comer" solo aparece su propio cliente.
- [x] Todos los datos de prueba (usuario auth, `app_users`, tenant B, mesa/comensal/consumos/obligaciones, cliente, cargos, abonos, auditoría) eliminados al terminar — `list_tables` confirma 0 filas en todas las tablas de negocio salvo `restaurants`/`receipt_counters`.
- [x] `get_advisors(security)` sin hallazgos nuevos inesperados tras los cambios (los WARN restantes son los mismos ya aceptados: `anon` en `bootstrap_admin`/`list_staff_for_login` por diseño, `authenticated` en todas las RPC por ser necesario, y leaked-password-protection pendiente de activar manualmente).

## Evidencia
Resultados de cada llamada y consulta capturados en la sesión.

## Riesgos
1. `credit_term_days` se agregó con default 30 para todos los clientes — es un valor razonable pero no confirmado por el usuario/negocio real; ajustar por cliente cuando exista UI de Configuración.
2. Sigue sin existir una forma de cargar una deuda a un cliente que **no** venga de una obligación de mesa (ej. una deuda inicial importada, o un cargo manual). Toda la cartera hoy nace exclusivamente de `registrar_fiado`. Si el negocio necesita cargos manuales, falta una RPC nueva (fuera del alcance original de los 8 RPC de Loop 03).
3. Las KPI de "abonos del día" y "nuevos cargos" (agregados por fecha) no se construyeron todavía — se dejaron deliberadamente para Loop 08 (Dashboard), que las diseñará junto con el resto de KPIs y sus filtros de periodo (Hoy/7 días/30 días) de forma coherente, en vez de piezas sueltas ahora.

## Pendientes
- Loop 06: mismo patrón de saldo/vencido para proveedores (hoy `registrar_pago_proveedor` ya calcula saldo inline, sin vista compartida ni estados PENDIENTE/PARCIAL/PAGADA/VENCIDA categorizados).
- Loop 08: vistas/consultas de KPIs agregados por fecha (abonos del día, nuevos cargos del día, etc.), reutilizando `customer_credit_detail`/`customer_balances` como base.
- Decidir si se necesita una RPC de "cargo manual" a cliente (riesgo #2).

## Decisiones
- Se implementó el cálculo de vencido con un plazo por cliente (`credit_term_days`) en vez de un plazo global fijo, para que cada cliente pueda tener condiciones distintas (igual que `suppliers.payment_terms`) — más flexible y consistente con el patrón ya usado en Proveedores.
- Se priorizó extraer la lógica de saldo a una vista compartida en vez de dejarla duplicada en dos RPC, específicamente porque el criterio de aceptación del loop ("saldo consistente entre detalle, lista, BD y dashboard") es exactamente el tipo de bug que la duplicación de lógica produce con el tiempo.

## Próximo loop
LOOP_06 — Proveedores y cuentas por pagar (aplicar el mismo patrón de saldo consistente + estados categorizados que aquí se aplicó a Clientes).
