# HANDOFF — INTEGRACIÓN PASO 1: RPC operativas de órdenes (Mesas/Llevar/Domicilio)

## Contexto
No es uno de los 14 loops del plan original — es el primer paso del orden de integración de front-end acordado con el usuario: (1) RPC operativas que faltan, (2) login real, (3) módulos secundarios, (4) Mesas al final. Este documento cubre el paso 1.

## Objetivo
Hasta ahora el backend (Loops 02-08) solo tenía RPC para **cerrar** una operación (`cobrar_persona`, `cobrar_mesa`, `registrar_fiado`). No existía ninguna forma de **abrir** una mesa, agregar un comensal, corregir un valor o liberar una mesa vía API — sin esto, `index.html` no podría funcionar contra el backend nuevo sin importar cómo se conectara.

## Implementado

4 funciones nuevas, todas con idempotencia y auditoría, abiertas a `admin`/`cajero` (son operación normal de Mesas, no administración):

- **`abrir_orden(channel, table_id, idempotency_key)`**: crea la sesión de orden. `channel` = `mesa|llevar|domicilio`. Para `mesa` exige `table_id` y rechaza si esa mesa ya tiene una orden activa (`La mesa ya tiene una orden activa`). Para `llevar`/`domicilio`, `table_id` debe ir nulo (sin restricción de unicidad, pueden coexistir varias).
- **`agregar_persona(table_session_id, nombre, valor, idempotency_key)`**: crea comensal + consumo + obligación de pago en un solo paso — replica la UX legacy donde "agregar persona" ya pide el valor de una vez.
- **`editar_valor_persona(obligation_id, nuevo_valor, idempotency_key)`**: solo permite corregir mientras la obligación sigue `PENDING` — igual regla que el front-end legacy ("Solo se puede corregir mientras está pendiente"), pero ahora validada en backend, no solo ocultando el botón.
- **`liberar_orden(table_session_id, confirmar_con_pendiente, idempotency_key)`**: cierra la orden. Si queda saldo pendiente por cobrar, **exige** `confirmar_con_pendiente=true` explícito o rechaza — lleva a backend la regla `BUSINESS_RULES.md` "Liberar sin cobrar requiere confirmación explícita", que en el front-end legacy solo existía (si acaso) como un `confirm()` de JavaScript fácilmente evitable.

## Archivos modificados
- `docs/context/HANDOFF_INTEGRACION_01_RPC_OPERATIVAS.md` (nuevo)
- Pendiente: `docs/architecture/DATA_MODEL.md`, `docs/architecture/BUSINESS_RULES.md`, `docs/context/PROJECT_STATE.md`.

No se tocó `index.html` todavía — este paso es solo backend.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop_integracion_abrir_orden_agregar_persona` — `abrir_orden`, `agregar_persona`.
2. `loop_integracion_editar_liberar` — `editar_valor_persona`, `liberar_orden`.

## QA ejecutado

Flujo completo simulando exactamente el uso real de Mesas:

### Test
- [x] `abrir_orden('mesa', ...)` → crea la sesión. Segundo intento sobre la misma mesa → rechazado (`La mesa ya tiene una orden activa`).
- [x] `agregar_persona` × 2 (Juan $20.000, Ana $15.000) → ambos comensales, consumos y obligaciones creados correctamente.
- [x] `editar_valor_persona` sobre Juan (20.000 → 22.000) → actualizado en `consumptions` y `payment_obligations` a la vez.
- [x] `liberar_orden` sin confirmar, con $37.000 pendiente (Juan+Ana) → rechazado con el monto exacto en el mensaje.
- [x] `cobrar_persona` a Juan (vía `transferencia`, $22.000) → pagado.
- [x] `liberar_orden` sin confirmar, ahora con $15.000 pendiente (solo Ana) → **sigue rechazado**, confirma que la validación es sobre el saldo real restante, no un flag fijo.
- [x] `liberar_orden` **con** `confirmar_con_pendiente=true` → acepta, cierra la orden, registra `pendiente_al_liberar=15000` en el resultado y en la auditoría (la deuda de Ana queda documentada, no simplemente desaparece).
- [x] Mesa liberada puede volver a abrirse (`abrir_orden` nuevamente sobre la misma mesa) → funciona, confirma que "mesa libre" es real tras liberar.
- [x] **Reutilizar una `idempotency_key` con parámetros distintos** (mismo key, nombre/valor diferentes) → rechazado explícitamente (`ya fue usada con parametros distintos`), no crea una fila ni devuelve datos incorrectos.
- [x] **Retry exacto** (misma key, mismos parámetros) → devuelve el mismo `diner_id`, sin duplicar la fila.
- [x] Todos los datos de prueba (usuario auth, `app_users`, mesa, 2 órdenes, comensales/consumos/obligaciones/pagos, auditoría) eliminados — `list_tables` confirma 0 filas en todas las tablas de negocio.

## Evidencia
Resultados de cada llamada capturados en la sesión.

## Riesgos
1. Estas 4 RPC no tienen restricción de rol (igual que `cobrar_persona`/`cobrar_mesa`/`registrar_fiado`) — cualquier `cajero` puede usarlas, consistente con que Mesas es su área de trabajo principal.
2. `agregar_persona` no valida un tope máximo de comensales por mesa ni de valor por persona — no había ninguna regla de negocio documentada al respecto; se deja abierto.
3. `liberar_orden` con pendiente confirmado no crea ningún registro de "cuenta incobrable" o similar — el pendiente queda registrado en `audit_events.metadata` y en la respuesta de la función, pero no hay una tabla dedicada a rastrear pérdidas por mesas liberadas sin cobrar. Si el negocio necesita reportar esto, falta una pieza.

## Pendientes (dentro del plan de integración acordado)
- **Paso 2**: migrar el login del front-end (PIN texto plano → `bootstrap_admin`/`list_staff_for_login`/`signInWithPassword`, ya construidos y verificados en Loop 04).
- **Paso 3**: reconectar módulos secundarios (Clientes, Proveedores, Caja, Configuración) — su backend ya está completo (Loops 05-08).
- **Paso 4**: Mesas — la pantalla protegida, al final, reutilizando estas 4 RPC nuevas más `cobrar_persona`/`cobrar_mesa`/`registrar_fiado` de Loop 03.
- Sembrar las mesas reales de Pa'Comer en `public.tables` (hoy la tabla está vacía; se limpiaron incluso las de prueba) — se hará como parte del Paso 4, cuando se sepa el número real de mesas del negocio.

## Decisiones
- `agregar_persona` colapsa comensal+consumo+obligación en una sola llamada (en vez de 3 RPC separadas) porque así es como ya funciona la UX legacy (agregar persona siempre pide el valor de una vez) — no había motivo para fragmentar la operación en el backend si el front-end nunca la va a partir en pasos separados.
- `liberar_orden` valida el pendiente en backend (no solo confía en que el front-end muestre un `confirm()`) porque la regla de negocio lo exige explícitamente y porque ya se estableció en este proyecto que los permisos/validaciones críticas no deben depender solo de la UI.

## Próximo paso
Paso 2 del plan de integración: migrar el login de `index.html`.
