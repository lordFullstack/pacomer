# HANDOFF LOOP 01 — BASE Y CONTRATO

## Loop
LOOP_01

## Objetivo
Estabilizar el contexto del proyecto antes de tocar lógica: auditar repositorio, estructura, Supabase, dependencias y flujo actual; documentar arquitectura real; identificar divergencias entre UI, estado local y BD.

## Implementado

- Auditoría completa del front-end (`index.html`, 2360 líneas): modelo de estado, persistencia local, auth por PIN, tablas Supabase referenciadas, ausencia de PWA/responsive.
- Auditoría completa del backend Supabase conectado vía MCP (proyecto `kxgusnavshomweqddwvo`): 29 tablas, columnas, PKs/FKs, políticas RLS, funciones, advisories de seguridad y performance, migraciones aplicadas, datos de auth reales.
- **Hallazgo central**: el front-end del repo y el backend accesible vía MCP son dos sistemas desconectados — el front-end apunta a otro proyecto Supabase (`jhuwepkpjjvponryzykp`) inaccesible desde esta sesión, y el backend accesible ya tiene construida (parcialmente) la arquitectura objetivo de este mismo plan de loops, con una numeración de loops previa y distinta.
- Documentación creada/actualizada con datos verificados (no supuestos).

## Archivos modificados

Creados:
- `docs/architecture/SYSTEM_ARCHITECTURE.md` (reescrito con hallazgos reales)
- `docs/architecture/DATA_MODEL.md` (nuevo — no existía en el paquete original)
- `docs/architecture/BUSINESS_RULES.md` (reescrito con verificación línea por línea)
- `docs/context/PROJECT_STATE.md` (reescrito con el hallazgo de los dos backends)
- `docs/context/HANDOFF_LOOP_01.md` (este archivo)
- `docs/context/LOOPS_OVERVIEW.md`, `docs/context/LOOP_CONTEXT.md`, `docs/context/DECISIONS.md`, `docs/context/LOOP_INDEX.md`, `docs/context/CLAUDE_HANDOFF_TEMPLATE.md`, `docs/architecture/KPI_DEFINITIONS.md`, `loops/LOOP_01.md`…`LOOP_14.md`, `MASTER_PROMPT_CLAUDE.md`, `reference/PA_COMER_POS_v3_0_0_AUDIT_SOURCE.html` — copiados del paquete de planificación entregado por el usuario para que el contexto persista en el repositorio.

No se modificó `index.html` (regla protegida respetada: cero cambios visuales o funcionales a Mesas).

## Base de datos

Sin cambios. Solo lecturas: `list_tables` (verbose), `get_advisors` (security + performance), `list_migrations`, y `SELECT` puros vía `execute_sql` (políticas RLS, definición de `current_tenant_id()`, conteo de filas en `restaurants` y `app_users`).

## Migraciones

Ninguna creada en este loop. Las migraciones ya existentes en el backend objetivo quedaron documentadas en `PROJECT_STATE.md`.

## QA ejecutado

### Test
- [x] `index.html` del repo coincide byte a byte con `reference/PA_COMER_POS_v3_0_0_AUDIT_SOURCE.html` (diff sin diferencias tras normalizar fin de línea).
- [x] Listado de tablas `sb.from(...)` extraído del código cliente sin omisiones (12 tablas legacy identificadas).
- [x] Estructura completa del schema `public` del proyecto `kxgusnavshomweqddwvo` verificada vía MCP (29 tablas, columnas, constraints, FKs).
- [x] Políticas RLS de las 29 tablas listadas y clasificadas (con/sin política).
- [x] Advisories de seguridad y performance del proyecto revisados íntegramente.
- [x] Confirmado que no se ejecutó ninguna escritura sobre el backend durante la auditoría.

## Evidencia

- `diff` entre `index.html` y el archivo de referencia: sin diferencias.
- `list_tables(verbose=true)` sobre `kxgusnavshomweqddwvo.public`: 29 tablas, detalladas en `DATA_MODEL.md`.
- `get_advisors(security)`: 10 tablas con RLS sin política, 1 función con search_path mutable y ejecutable por anon, leaked-password-protection desactivado.
- `get_advisors(performance)`: 44 foreign keys sin índice de cobertura.
- `list_migrations`: 7 migraciones fechadas 2026-09-12/13 con nombres `loop05_backend_core`, `loop08_payments_cash`, `loop09_customer_credit`, `loop10_suppliers_purchases`, `loop11_receipts`, `loop13_security_roles`, `0001_loop05_backend_core`.

## Riesgos

Ver tabla completa en `docs/architecture/SYSTEM_ARCHITECTURE.md` → "Riesgos (P0/P1/P2)". Resumen P0:
1. Backend real del front-end (`jhuwepkpjjvponryzykp`) no auditable desde esta sesión.
2. Front-end y backend objetivo (`kxgusnavshomweqddwvo`) desconectados — todo lo ya construido en el backend es invisible al usuario final.
3. PIN en texto plano, sin relación con Supabase Auth (que ya existe y funciona en el backend objetivo).
4. Cero funciones RPC de negocio pese a que el modelo de datos ya soporta transacciones idempotentes.
5. RLS sin políticas de escritura en ninguna tabla; 10 tablas totalmente inaccesibles vía API (ni lectura).

## Pendientes

- Confirmar oficialmente que `kxgusnavshomweqddwvo` reemplaza a `jhuwepkpjjvponryzykp` como backend único (el usuario ya indicó "funciona para este" en esta sesión, pero no se ha tocado `index.html` todavía).
- Investigar si `jhuwepkpjjvponryzykp` tiene datos de producción reales que deban migrarse antes de abandonarlo, o si es descartable.
- Decidir el mapeo definitivo legacy→objetivo propuesto en `DATA_MODEL.md` (en particular: cómo modelar "para llevar"/"domicilio" y "config" en el esquema objetivo, que hoy no los contempla).
- Resolver la discrepancia de roles: el plan original asume 2 roles (ADMIN/CAJERO), el backend ya construido tiene 4 (`servidor/cajero/supervisor/admin`) — definir cuál es el modelo correcto antes de Loop 04.

## Decisiones

- Se usa `kxgusnavshomweqddwvo` como backend de trabajo para los loops siguientes (confirmado por el usuario en esta sesión).
- No se crea un schema nuevo adicional: el schema `public` de ese proyecto ya contiene la arquitectura objetivo y se sigue construyendo sobre él.
- El paquete de planificación (loops, docs de arquitectura base, master prompt) se incorporó al repositorio bajo `docs/`, `loops/`, `reference/` y `MASTER_PROMPT_CLAUDE.md` para que el contexto persista entre sesiones, tal como exige el flujo de handoff del propio plan.

## Próximo loop

LOOP_02 — Integridad de datos. Antes de normalizar, debe resolverse el pendiente #1 de esta lista (confirmación del backend único) porque Loop 02 trabaja sobre el modelo real; si `kxgusnavshomweqddwvo` es el definitivo, Loop 02 debe enfocarse en cerrar los gaps ya identificados aquí (políticas RLS faltantes, mapeo "para llevar"/"domicilio"/"config", constraint de una sola caja abierta por tenant) en vez de re-diseñar desde cero.
