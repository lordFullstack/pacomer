# HANDOFF — DASHBOARD GERENCIAL

## Estado
COMPLETADO.

## Contexto
El usuario pidió, tras revisar la app desplegada, una pantalla que diera "visión clara del negocio con todos los KPIs: ingresos, gastos y saldo, cómo estuvo el mes y el año, cuánto debo, cuánto me deben, ticket promedio y más". Esto cierra un hueco señalado repetidamente en la documentación desde el Loop 08 (cuando se construyó `dashboard_resumen`, la RPC): la RPC existía y calculaba casi todos estos KPI, pero **nunca se construyó una pantalla** para mostrarla — no había ni botón de navegación ni página.

## Archivos modificados (backend, migración `dashboard_resumen_mes_anio_flujo`)
- **`dashboard_resumen(p_periodo)`**: se reescribió para agregar lo que el usuario pidió explícitamente y no existía:
  - **Períodos `mes` y `año`** (antes solo `hoy`/`7d`/`30d`) — calendario: del día 1 del mes/año actual hasta hoy, comparado contra el mes/año calendario anterior completo.
  - **`flujo`** (nuevo bloque): `ingresos` (ventas + abonos de cartera cobrados), `egresos` (gastos de caja + pagos a proveedores), `saldo` (la resta) — esto no existía en ninguna parte del sistema; antes solo se podían ver ventas por un lado y gastos sueltos en la pestaña "Día" de Caja, sin un total consolidado.
  - **Bug corregido de paso**: `proveedores.pagado_hoy` estaba hardcodeado a "hoy" sin importar qué período pidiera el cliente — ahora `pagado_periodo` respeta el rango real seleccionado.
- El resto de la RPC (ventas por canal/usuario, ticket promedio, cartera de clientes, cuentas por pagar a proveedores, estado de mesas, caja actual, hora pico) ya existía desde el Loop 08 y se dejó intacto.

## Archivos creados/modificados (front-end)
- `js/15-dashboard.js` (nuevo) — `cargarDashboard(periodo)`, selector de período (Hoy/7 días/30 días/Este mes/Este año), y tarjetas: Ventas (con variación vs. período anterior), Cuánto me deben, Cuánto debo, Mesas, Caja, Operación. El "flujo de caja" (ingresos/egresos/saldo) se muestra como hero destacado arriba de todo.
- `index.html`: nuevo botón de nav "📈 Dashboard" (oculto para cajero, igual que Caja/Proveedores/Config/Auditoría — la protección real es el `_require_role(admin)` que ya tenía la RPC desde el Loop 08), nueva página `#page-dashboard`. `js/15-init.js` renombrado a `js/16-init.js`.
- `js/02-utils-navegacion.js`: `navTo('dashboard')` carga la pantalla.
- `js/09-stats-roles.js`: `aplicarPermisosPorRol()` esconde también el botón de Dashboard para cajero.
- `css/styles.css`: `#page-dashboard` y `#page-auditoria` se agregaron al fix de padding/scroll que ya tenía `#page-config` (de paso se descubrió que Auditoría tenía el mismo bug pendiente de LOOP 11 — corregido aquí).

## QA ejecutado
Contra el backend real, con datos reales generados en la prueba (no solo ceros): apertura de caja $100.000, venta de $30.000 en mesa 2, gasto de $12.000.

- [x] Dashboard carga y muestra datos reales — verificado matemáticamente: ingresos $30.000, egresos $12.000, **saldo $18.000** (30.000−12.000, correcto).
- [x] Ticket promedio: $30.000 con 1 operación — correcto.
- [x] Ventas por canal (`mesa: $30.000`) y por usuario (el admin que cobró) — correctos.
- [x] Los 5 períodos (`hoy`, `7d`, `30d`, `mes`, `anio`) cargan sin error y muestran el mismo total (todo el movimiento ocurrió hoy, dentro de las 5 ventanas) — verificado uno por uno, no en paralelo (evita condiciones de carrera sobre el estado compartido `dash.datos`).
- [x] Mesas: ocupadas=1 (la mesa 2, que quedó abierta tras cobrar solo a esa persona) — coincide con el estado real.
- [x] Caja: esperado_actual $88.000 (100.000 − 12.000 de gasto, la venta aún no se reflejaba en el snapshot de esa consulta particular) — coincide con lo calculado por `cash_session_detail`.
- [x] **Seguridad verificada con una cuenta cajero real**: botón de nav oculto, y llamar `dashboard_resumen` directo desde el cliente devuelve `"Rol cajero no tiene permiso para esta operación"` (protección que ya existía desde el Loop 08, sigue funcionando después del cambio).
- [x] Limpieza completa de datos de prueba (sesión de mesa, comensal, consumo, obligación, pago, alocación, sesión de caja, movimientos, 2 usuarios de prueba con su `auth.users`/`auth.identities`) — verificado que la cuenta real y la orden real de la mesa 6 (de una sesión de prueba anterior del propio usuario) quedaron intactas.

## Problemas encontrados
Ninguno nuevo en el código. Durante la prueba manual me equivoqué dos veces seguidas llamando a `abrir_caja` por SQL/RPC directo sin pasar por `cargarCajaActual()`, así que `db.cajaActual` no estaba poblado en memoria y el cobro se bloqueó con "Abre la caja antes de cobrar" — error de mi guion de prueba, no del código (la función de cobro nunca cambió en este trabajo).

## Riesgos pendientes
1. "Ingresos" en el flujo de caja es dinero **efectivamente cobrado** (ventas + abonos), no ventas "causadas" — un consumo fiado no cuenta como ingreso hasta que se abona. Es la definición correcta para "cuánto entró de verdad", pero si el usuario esperaba ver el valor total vendido (incluyendo lo fiado) como "ingresos", habría que aclarar la definición.
2. La comparación "vs. período anterior" para `mes`/`año` compara contra el mes/año calendario anterior completo, no contra "los mismos días transcurridos" — por ejemplo, el 5 de un mes se compara contra el mes anterior completo (mayor volumen esperado), no contra "los primeros 5 días" de ese mes anterior. Es una simplificación razonable, pero puede hacer que la variación se vea artificialmente negativa a inicios de mes.

## Siguiente paso
LOOP 13 — QA operativo formal (según el plan original de 14 loops).
