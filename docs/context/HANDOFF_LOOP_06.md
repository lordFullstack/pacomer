# HANDOFF LOOP 06 — PROVEEDORES Y CUENTAS POR PAGAR

## Loop
LOOP_06 (backend). Sin cambios en `index.html`.

## Objetivo
Controlar compromisos y vencimientos: pedido/factura/pago con sus fechas, y estados PENDIENTE/PARCIAL/PAGADA/VENCIDA, aplicando el mismo patrón de saldo-consistente que Loop 05 usó para Clientes.

## Implementado

- **`purchases` ampliada** con `order_date` (default hoy), `invoice_date`, `invoice_number`, `due_date` — antes solo tenía `amount`. Sin estas fechas era imposible calcular vencimientos.
- **`registrar_compra(supplier_id, amount, order_date, invoice_date, invoice_number, due_date, idempotency_key)`** (nueva RPC, admin-only): **antes de este loop no existía ninguna forma de crear una compra vía API** — `purchases` solo tenía política RLS de `SELECT`, así que nadie podía insertar una compra ni siquiera autenticado. Este era un hueco real, no solo una mejora.
  - Si no se especifica `due_date`, se calcula automáticamente desde `suppliers.payment_terms`: `contado` → mismo día del pedido, `semanal` → +7 días, `quincenal` → +15 días. Probado con un proveedor `semanal`: due_date calculado exactamente `order_date + 7`.
- **`purchase_detail`** (vista, `security_invoker=true`): saldo pendiente por compra + `status` categorizado (`PENDIENTE|PARCIAL|PAGADA|VENCIDA`), calculado igual que el saldo vencido de clientes en Loop 05 — no es una columna guardada (evita que quede desactualizada con el paso del tiempo), se deriva en el momento de la consulta.
- **`supplier_balances`** (vista, `security_invoker=true`): saldo total y vencido por proveedor — cubre los KPI "total por pagar" y "vencido".
- **`registrar_pago_proveedor` reescrita**: ahora lee saldo desde `purchase_detail` (antes lo calculaba inline, duplicando la lógica igual que `registrar_abono` antes de Loop 05) y **cambia el orden de aplicación del pago**: antes pagaba las compras más antiguas por fecha de creación; ahora paga primero las que tienen `due_date`/`order_date` más próximo a vencer — más correcto para "controlar compromisos y vencimientos", que es literalmente el objetivo del loop.

## Archivos modificados
- `docs/context/HANDOFF_LOOP_06.md` (nuevo)
- Pendiente en este turno: `docs/architecture/BUSINESS_RULES.md`, `docs/architecture/DATA_MODEL.md`, `docs/context/PROJECT_STATE.md`.

No se tocó `index.html`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop06_purchase_dates_and_balance_views` — columnas nuevas en `purchases`, vistas `purchase_detail` y `supplier_balances`.
2. `loop06_registrar_compra_and_pago_shared_view` — `registrar_compra` (nueva), `registrar_pago_proveedor` reescrita sobre `purchase_detail` con orden de pago por vencimiento.

## QA ejecutado

### Test
- [x] `registrar_compra` como `cajero` → rechazado (`Rol cajero no tiene permiso`), confirma que dar de alta una compra es "administración de proveedores".
- [x] `registrar_compra` como `admin`, proveedor con `payment_terms='semanal'`, sin `due_date` → calculado correctamente `order_date + 7 días`.
- [x] Segunda compra con `due_date` explícito en el pasado → `purchase_detail.status = 'VENCIDA'`, `pending = amount` (sin pagos).
- [x] `supplier_balances`: con una compra de $30.000 (pendiente, futura) y otra de $20.000 (vencida) → `saldo=50000`, `saldo_vencido=20000`.
- [x] `registrar_pago_proveedor` de $25.000: aplicó primero los $20.000 de la compra **vencida** (quedó `PAGADA`), y los $5.000 restantes a la otra compra (quedó `PARCIAL` con `pending=25000`) — confirma el orden "más próximo a vencer primero".
- [x] **Idempotencia de `registrar_compra`**: reintento con la misma `idempotency_key` devolvió el mismo `purchase_id`; conteo de `purchases` para ese proveedor se mantuvo en 2 (no 3).
- [x] **RLS de `purchase_detail`/`supplier_balances` verificada como rol `authenticated` real**: proveedor "secreto" de un segundo tenant no apareció al consultar como el tenant "Pa Comer".
- [x] Todos los datos de prueba (2 usuarios auth, `app_users`, tenant B, proveedor/compras/pago) eliminados — `list_tables` confirma 0 filas en todas las tablas de negocio.

## Evidencia
Resultados de cada llamada capturados en la sesión.

## Riesgos
1. Igual que en Loop 05 con clientes: no existe forma de registrar una compra retroactiva/histórica que no pase por `registrar_compra` con fecha de hoy en adelante — sí se puede fijar `order_date`/`invoice_date`/`due_date` en el pasado explícitamente (probado), así que importar historial es posible, solo no hay una herramienta masiva de importación (fuera de alcance de este loop).
2. "Pagado hoy" (KPI de `KPI_DEFINITIONS.md`) no se construyó como vista — se puede derivar de `cash_movements` (`type='SUPPLIER_PAYMENT'`, `created_at::date = hoy`) o de `supplier_payments.created_at`, pero se deja para Loop 08 (Dashboard) junto con el resto de agregados por fecha, mismo criterio que Loop 05.
3. `registrar_compra` no valida que `invoice_number` sea único por proveedor (podría cargarse la misma factura dos veces con distinta `idempotency_key`) — no estaba en las reglas de negocio documentadas; señalado por si el negocio lo requiere.

## Pendientes
- Loop 08: KPI "pagado hoy" y agregados por fecha, reutilizando `purchase_detail`/`supplier_balances`.
- Evaluar si se necesita unicidad de `invoice_number` por proveedor (riesgo #3).
- Mismo patrón de "cargo/compra manual histórico" que quedó pendiente en Loop 05 para clientes — aquí ya está parcialmente resuelto porque `registrar_compra` sí acepta fechas pasadas explícitas.

## Decisiones
- Estado (`PENDIENTE/PARCIAL/PAGADA/VENCIDA`) se dejó como columna **calculada** en la vista, no como columna guardada en `purchases` — mismo criterio que `customer_balances.saldo_vencido` en Loop 05, para no necesitar un job en segundo plano que la vaya actualizando a medida que pasan los días.
- El orden de aplicación de pagos a proveedor cambió de "más antigua primero" a "vence más pronto primero" porque coincide mejor con el objetivo explícito del loop ("controlar... vencimientos") — antes de este loop ese matiz no existía porque no había fechas de vencimiento en absoluto.
- `registrar_compra` quedó admin-only, igual que `registrar_pago_proveedor`, siguiendo la misma lectura de `LOOP_CONTEXT.md` ("CAJERO ... Sin administración de proveedores") aplicada en Loop 04.

## Próximo loop
LOOP_07 — Caja profesional (separar ingresos/egresos con más detalle, impedir operaciones tras el cierre salvo reapertura admin — la reapertura sigue sin implementarse desde que se señaló en Loop 03).
