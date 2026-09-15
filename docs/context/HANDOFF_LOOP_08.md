# HANDOFF LOOP 08 — DASHBOARD GERENCIAL

## Loop
LOOP_08 (backend). Sin cambios en `index.html` — la UI del dashboard queda para la integración de front-end; este loop entrega la RPC que la alimentará.

## Objetivo
Centro de control para ADMIN con todos los KPI obligatorios, filtrable Hoy/7 días/30 días, sin inventar métricas que no tengan datos reales detrás.

## Implementado

**`dashboard_resumen(periodo text default 'hoy')`** — una sola RPC, admin-only (`_require_role(['admin'])`), que devuelve un JSON con todas las secciones del loop:

- **Ventas**: total del período, operaciones, total del período anterior equivalente (para comparar), ticket promedio, desglose por canal (`mesa`/`llevar`/`domicilio`, vía `table_sessions.channel`), desglose por usuario.
- **Mesas**: ocupadas/libres (estado actual, no depende del período), mesas atendidas en el período, tiempo promedio de mesa (`closed_at - opened_at`).
- **Crédito**: cartera total y vencida (de `customer_balances`, Loop 05), clientes con deuda, abonos y nuevos cargos del período.
- **Proveedores**: total por pagar y vencido (de `supplier_balances`, Loop 06), vencimientos a 7 y 15 días (de `purchase_detail`), pagado hoy.
- **Caja**: la sesión de caja más reciente completa (`cash_session_detail`, Loop 07) — apertura, ingresos, egresos, esperado, real, diferencia.
- **Operación**: operaciones por hora, hora pico, anulaciones del período (cuenta `payments.status='VOIDED'`, hoy siempre 0 porque todavía no existe ninguna RPC que anule un pago — ver Riesgos).

**Períodos**: `hoy` (1 día), `7d` (últimos 7 días incluyendo hoy), `30d` (últimos 30 días). Cualquier otro valor es rechazado explícitamente. El "período anterior" para comparar ventas es la misma cantidad de días inmediatamente antes del rango actual.

**Regla "no inventar KPI sin datos" aplicada literalmente**: `correcciones_periodo` se devuelve como `null` (no `0`) porque no existe ningún mecanismo en el backend que registre correcciones todavía — un `0` sugeriría "se midió y dio cero", que sería falso. El resultado incluye un array `kpis_sin_datos_aun` explicando por qué, y un campo `nota_catalogo` aclarando que no hay KPI por producto porque no existe catálogo de productos.

Todo el cálculo reutiliza las vistas ya construidas en loops anteriores (`customer_balances`, `supplier_balances`, `purchase_detail`, `cash_session_detail`) en vez de recalcular saldo/vencido con lógica propia — mismo principio de fuente única aplicado en Loops 05-07.

## Archivos modificados
- `docs/context/HANDOFF_LOOP_08.md` (nuevo)
- Pendiente en este turno: `docs/architecture/BUSINESS_RULES.md` (no aplica cambios de regla, se documenta en `DATA_MODEL.md`), `docs/architecture/DATA_MODEL.md`, `docs/context/PROJECT_STATE.md`.

No se tocó `index.html`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop08_dashboard_resumen` — función `dashboard_resumen(periodo)`.

## QA ejecutado

Se construyó un escenario completo (no aislado por tabla como en loops anteriores) para poder verificar los KPI cruzados: caja abierta con $50.000, una venta de mesa ($25.000 efectivo), una venta "para llevar" ($15.000 transferencia), un proveedor con dos compras (una vence en 5 días, otra en 20), un cliente fiado por $10.000 con un abono de $4.000, y un pago a proveedor de $15.000 por transferencia.

### Test
- [x] `ventas.total = 40000`, `operaciones = 2`, `ticket_promedio = 20000` — coincide exacto con lo esperado a mano.
- [x] `ventas.por_tipo = {"mesa": 25000, "llevar": 15000}` — el desglose por canal via `table_sessions.channel` funciona.
- [x] `ventas.por_usuario` = 1 usuario, $40.000, 2 operaciones — correcto, ambas ventas las hizo el mismo cajero.
- [x] `mesas.ocupadas = 1`, `libres = 0` (1 sola mesa creada, ocupada) — correcto.
- [x] `credito.cartera_total = 6000` ($10.000 fiado − $4.000 abonado), `abonos_periodo = 4000`, `nuevos_cargos_periodo = 10000` — correcto.
- [x] `proveedores.total_por_pagar = 85000` ($25.000 pendiente de la compra pagada parcialmente + $60.000 de la otra), `vence_7_dias = vence_15_dias = 25000` (solo la compra a 5 días cae en ambas ventanas), `pagado_hoy = 15000` — correcto.
- [x] `caja.ingresos = 29000` (solo las 2 operaciones en efectivo: venta $25.000 + abono $4.000; la venta "llevar" y el pago a proveedor fueron por transferencia, correctamente **no** aparecen en caja), `egresos = 0`, `esperado_actual = 79000` — correcto.
- [x] `operacion.hora_pico` y `operaciones_por_hora` reflejan las 2 ventas en la hora real en que se ejecutaron.
- [x] `cajero` llamando `dashboard_resumen` → rechazado (`Rol cajero no tiene permiso`) — el dashboard es admin-only según el objetivo del loop.
- [x] Período inválido (`'periodo-invalido'`) → rechazado explícitamente, no falla en silencio ni devuelve datos vacíos.
- [x] `7d` y `30d` devuelven el mismo total que `hoy` (correcto, no hay datos más antiguos en este escenario de prueba) pero con `desde` calculado correctamente (`7d` = 2026-09-09, `30d` = 2026-08-17 respecto a "hoy" 2026-09-15).
- [x] Todos los datos de prueba (2 usuarios auth, `app_users`, mesas/comensales/consumos/obligaciones/pagos, cliente, proveedor/compras/pago, caja/movimientos, auditoría) eliminados — `list_tables` confirma 0 filas en todas las tablas de negocio.

## Evidencia
Salida completa de `dashboard_resumen('hoy')` capturada y verificada campo por campo contra el escenario armado a mano en esta sesión.

## Riesgos
1. **`anulaciones_periodo` siempre será 0** hasta que exista una RPC que anule pagos (`payment_void_requests` ya tiene el modelo completo desde Loop 02, pero ninguna función lo usa todavía). No es un bug — es honesto (cuenta datos reales que hoy son cero) — pero el dashboard mostrará "0 anulaciones" indefinidamente hasta que se construya esa pieza (probablemente Loop 11, Auditoría y seguridad).
2. `correcciones_periodo` queda `null` indefinidamente por la misma razón — no hay ninguna tabla/columna que represente una "corrección" en el modelo actual.
3. La sección `caja` siempre devuelve la sesión más reciente del tenant, sin filtrar por período — si el período es "30d" pero la última caja se cerró hace una semana, igual se muestra esa. Es la interpretación más razonable (la caja es un concepto de "ahora mismo", no acumulable por rango de fechas) pero no está explícitamente aclarado en `KPI_DEFINITIONS.md`.

## Pendientes
- Loop 11: construir la RPC de anulación de pagos (activaría `anulaciones_periodo` con datos reales) y decidir cómo registrar "correcciones" para que ese KPI deje de ser `null`.
- Cuando exista un catálogo de productos (fuera del alcance de los 14 loops actuales), extender `dashboard_resumen` con KPI de ventas por producto — el campo `nota_catalogo` ya deja la intención documentada.

## Decisiones
- Se implementó como **una sola función** que devuelve todo el JSON de una vez, en vez de varias funciones pequeñas por sección — para que el front-end (cuando se conecte) haga una sola llamada por cambio de filtro de período, no seis.
- `null` explícito en vez de `0` para KPIs sin mecanismo de datos real (`correcciones_periodo`) — decisión deliberada para no violar "no mostrar métricas falsas por falta de datos".
- La comparación "vs. período anterior" se calculó como el mismo número de días inmediatamente antes del rango actual (no el mismo período del mes/año anterior) — interpretación más simple y más útil para un negocio que recién está empezando a acumular historial.

## Próximo loop
LOOP_09 — Responsive secundario (Clientes, Proveedores, Caja, Configuración, Dashboard para móvil) — es un loop de front-end puro; recomendable abordarlo junto con la integración de `index.html`, no antes.
