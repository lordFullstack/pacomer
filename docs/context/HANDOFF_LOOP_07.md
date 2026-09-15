# HANDOFF LOOP 07 — CAJA PROFESIONAL

## Loop
LOOP_07 (backend). Sin cambios en `index.html`.

## Objetivo
Convertir Caja en control operativo confiable: flujo explícito Apertura → operación → arqueo → cierre, separar ingresos/egresos, registrar usuario en cada paso, impedir operaciones tras el cierre salvo reapertura admin, y que la diferencia sea reproducible desde los movimientos.

## Implementado

- **Flujo de 4 pasos real, no solo 2**: hasta este loop, `cerrar_caja` pasaba directo de `OPEN`/`OPERATING` a `CLOSED`. El estado `COUNTING` ya existía en el `check` de `cash_sessions.status` desde Loop 02 pero nada lo usaba. Ahora:
  1. `abrir_caja` (sin cambios de comportamiento).
  2. operación normal (`cobrar_persona`, `registrar_gasto`, etc. — sin cambios).
  3. **`iniciar_arqueo(idempotency_key)`** (nueva): pasa la caja a `COUNTING`. **A partir de ahí, ningún RPC de operación acepta más movimientos** (todos buscan caja en `OPEN`/`OPERATING`, no `COUNTING`) — probado: un gasto durante el arqueo fue rechazado con el mismo mensaje que "no hay caja abierta".
  4. **`cerrar_caja`** ahora **exige** que la caja esté en `COUNTING` (antes aceptaba `OPEN`/`OPERATING`/`COUNTING` indistintamente) — probado: cerrar sin haber iniciado arqueo es rechazado explícitamente ("Debe iniciar arqueo antes de cerrar la caja").
- **`reabrir_caja(cash_session_id, motivo, idempotency_key)`** (nueva, admin-only): la reapertura que quedaba pendiente desde Loop 03. Reutiliza la misma fila de `cash_sessions` (no crea una nueva) para conservar la continuidad de movimientos; limpia `closed_at`/`counted_cash`/`expected_cash`/`difference` (quedan obsoletos al reabrir) y dobla el índice único de "una sola caja activa" para impedir reabrir si ya hay otra caja activa. Probado: rechazada para `cajero`, aceptada para `admin`, con motivo obligatorio.
- **Rastro de usuario en cada paso**: `cash_sessions` ganó `counted_by_user_id`, `closed_by_user_id`, `reopened_by_user_id`/`reopened_at`/`reopen_reason` — antes solo existía `opened_by_user_id`. Ahora se puede saber quién abrió, quién hizo el arqueo, quién cerró y quién reabrió (y por qué) sin tener que reconstruirlo desde `audit_events`.
- **`cash_session_detail`** (vista, `security_invoker=true`): recalcula `ingresos`, `egresos` y `esperado_actual` **en vivo** desde `cash_movements`, no solo desde el valor congelado al cerrar — para que la diferencia sea siempre reproducible, incluso antes de cerrar (útil para mostrar el esperado durante el arqueo). Probado: `esperado_actual` coincidió exacto con `opening_cash + Σ movimientos` tanto antes como después de una reapertura.

## Archivos modificados
- `docs/context/HANDOFF_LOOP_07.md` (nuevo)
- Pendiente en este turno: `docs/architecture/BUSINESS_RULES.md`, `docs/architecture/DATA_MODEL.md`, `docs/context/PROJECT_STATE.md`.

No se tocó `index.html`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop07_cash_session_trail_and_detail_view` — columnas nuevas en `cash_sessions`, vista `cash_session_detail`.
2. `loop07_arqueo_cierre_reapertura` — `iniciar_arqueo` (nueva), `cerrar_caja` (reescrita, exige `COUNTING`), `reabrir_caja` (nueva, admin-only).

## QA ejecutado

### Test
- [x] Apertura ($100.000) → gasto ($3.000) → `cerrar_caja` sin arqueo previo → **rechazado**.
- [x] `iniciar_arqueo` → `esperado_actual = 97000` (100.000 − 3.000), correcto.
- [x] Gasto **durante** el arqueo (`COUNTING`) → rechazado, igual que si no hubiera caja abierta.
- [x] `cerrar_caja(97000)` → `expected_cash=97000`, `counted_cash=97000`, `difference=0`.
- [x] `reabrir_caja` como `cajero` → rechazado (`Rol cajero no tiene permiso`).
- [x] `reabrir_caja` como `admin` con motivo → caja vuelve a `OPEN`, mismo `cash_session_id`, `reopen_reason` guardado.
- [x] `cash_session_detail` tras la reapertura: `esperado_actual` recalculado correctamente en vivo (97000), `egresos=-3000`, `ingresos=0`, `fue_reabierta=true`.
- [x] **Auditoría**: exactamente 5 eventos para las 5 operaciones que sí se ejecutaron (`abrir_caja`, `registrar_gasto`, `iniciar_arqueo`, `cerrar_caja`, `reabrir_caja`) — los 2 intentos rechazados (gasto durante arqueo, reapertura como cajero) no generaron auditoría, correcto porque nunca llegaron a ejecutarse.
- [x] Todos los datos de prueba (2 usuarios auth, `app_users`, sesión de caja, movimientos, auditoría) eliminados — `list_tables` confirma 0 filas en todas las tablas de negocio.

## Evidencia
Resultados de cada llamada capturados en la sesión.

## Riesgos
1. **Cambio de comportamiento de `cerrar_caja`**: antes aceptaba cerrar directo desde `OPEN`/`OPERATING`; ahora exige pasar por `iniciar_arqueo` primero. No rompe nada real porque el front-end todavía no está conectado a este backend, pero cualquier integración futura debe usar el flujo de 3 llamadas (`iniciar_arqueo` → `cerrar_caja`), no 2.
2. `OPERATING` sigue sin ningún trigger que lo distinga de `OPEN` (ninguna función lo asigna) — se mantiene en el `check` por compatibilidad con el modelo original, pero en la práctica todas las cajas abiertas quedan en `OPEN` hasta pasar a `COUNTING`. No se consideró necesario forzar una transición intermedia sin una regla de negocio que la exija.
3. `reabrir_caja` no tiene límite de cuántas veces se puede reabrir una misma caja — cada reapertura sobrescribe el rastro de la reapertura anterior (`reopened_at`/`reopened_by_user_id`/`reopen_reason` son un solo valor, no un historial). El historial completo sí queda en `audit_events` (cada reapertura genera su propio evento), pero no en la fila de `cash_sessions` misma.

## Pendientes
- Decidir si vale la pena limitar reaperturas múltiples o si el rastro en `audit_events` es suficiente (riesgo #3).
- Loop 08: KPI de caja (apertura, ingresos, egresos, esperado, real, diferencia) ya están cubiertos por `cash_session_detail`, solo falta que el dashboard los consuma.

## Decisiones
- Se optó por reutilizar la misma fila de `cash_sessions` al reabrir (en vez de crear una sesión nueva encadenada a la anterior) para no romper la relación `cash_movements.cash_session_id` existente ni duplicar el historial de una misma jornada de caja.
- `iniciar_arqueo` y `cerrar_caja` se mantuvieron sin restricción de rol (igual que `abrir_caja`), consistente con la interpretación de Loop 04 de que la operación normal de caja no es "administración de caja" — solo la reapertura lo es, por regla explícita de `BUSINESS_RULES.md`.

## Próximo loop
LOOP_08 — Dashboard gerencial (ya hay bastante terreno ganado: `customer_balances`, `supplier_balances`, `purchase_detail`, `cash_session_detail` cubren buena parte de los KPI necesarios; falta diseñar los agregados por fecha con los filtros Hoy/7 días/30 días).
