# HANDOFF LOOP 04 — AUTH, USUARIOS Y ROLES

## Loop
LOOP_04 — backend y mecanismo de login real completados y verificados end-to-end. **Falta solo conectar `index.html` a este backend**, lo cual requiere una reescritura de la capa de datos del front-end (ver "Pendientes" — es un esfuerzo grande, no incluido aquí sin confirmación).

## Decisión de UX de login (confirmada por el usuario)
**Opción A: PIN como contraseña real.** Cada empleado tiene una cuenta Supabase Auth con email interno sintético (`staff-<uuid>@pacomer.internal`) y su PIN de 4 dígitos como contraseña real (ya no texto plano ni comparado en cliente). La UX visual sigue siendo "toca tu nombre → marca 4 dígitos".

## Objetivo
Pasar del PIN local a seguridad real: separar identidad/perfil/rol, corregir `db.usuarioActivo` vs `ui.usuarioActual`, y asegurar que el rol se valide en backend, no solo ocultando botones.

## Implementado

### Backend (`hqrjbgheclpnfoexyzyj`)
- **Control de rol dentro de las RPC**: nueva función interna `_require_role(p_allowed text[])`, que lanza excepción si el usuario no está autenticado o su rol no está en la lista permitida.
- Aplicado a `registrar_pago_proveedor`: ahora requiere rol `admin` (regla explícita de `LOOP_CONTEXT.md`: "CAJERO ... Sin administración de proveedores"). Las otras 7 RPC del Loop 03 siguen abiertas a `admin`/`cajero` por igual — ver "Decisiones" para el razonamiento y qué quedó sin resolver.
- Identidad ya estaba separada de perfil/rol desde Loop 02 (`auth.users` = identidad, `app_users` = perfil+rol, vinculados 1:1 por `auth_user_id`). No fue necesario un cambio de modelo, solo faltaba el enforcement.

### Front-end (`index.html`)
- **Corregida la inconsistencia `db.usuarioActivo` vs `ui.usuarioActual`** ([index.html:2318](../../index.html:2318)): al hacer login por PIN solo se asignaba `ui.usuarioActual`, nunca `db.usuarioActivo` — por eso el ticket de venta (`atendidoPor` en `cobrarPersona`/`cobrarTodo`, líneas 1219 y 1271) **nunca mostraba quién atendió**, aunque sí había un usuario logueado. Fix de una línea: ahora `pinPress()` asigna ambas variables. No se tocó nada de Mesas visualmente ni el flujo de login.
- El PIN en texto plano sigue existiendo — deliberadamente no se tocó más que ese fix puntual, ver "Pendientes".

### Mecanismo de login real (nuevo, esta sesión)
- **`list_staff_for_login(p_tenant_id)`**: función pública (ejecutable por `anon`), devuelve `id`, `nombre`, `login_email` del personal activo de un tenant. Reemplaza lo que hoy hace el front-end (traer TODA la fila de `usuarios`, PIN en texto plano incluido) por una lista mínima sin secretos — es una mejora de seguridad respecto al modelo actual, no solo un cambio de mecanismo.
- **`_create_staff_account(...)`** (interna): crea de una vez `auth.users` + `auth.identities` + `app_users` para un empleado nuevo, con el PIN como contraseña (hasheada con `pgcrypto`, nunca en texto plano).
- **`crear_usuario(nombre, pin, rol, idempotency_key)`**: expuesta a `authenticated`, requiere rol `admin` (vía `_require_role`) — para que un admin dé de alta más personal.
- **`bootstrap_admin(tenant_id, nombre, pin)`**: expuesta a `anon` y `authenticated`, pero **solo funciona si el tenant todavía no tiene ningún `app_user`** (primer arranque). Bloquea con `for update` sobre la fila del tenant para evitar condiciones de carrera, y una segunda llamada falla explícitamente ("ya tiene personal registrado").

### Bug real de GoTrue encontrado y corregido durante la prueba
Al crear cuentas de `auth.users` directamente por SQL (necesario porque no hay una API de administración expuesta en este toolset), el primer intento de login real fallaba con `500 Database error querying schema`. Revisando `auth_logs` vía `query_logs` se encontró la causa exacta: `"error finding user: sql: Scan error on column index 3, name \"confirmation_token\": converting NULL to string is unsupported"`. GoTrue escanea varias columnas de `auth.users` (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`) como string no-nulo — deben insertarse como `''`, nunca `NULL`, aunque la columna sea nullable en el schema. Corregido en `_create_staff_account`.

### Verificación end-to-end real (no solo `set_config`/JWT simulado)
Usando el navegador para hacer peticiones HTTP reales contra la API de Supabase (URL y anon key reales del proyecto):
1. `POST /auth/v1/token?grant_type=password` con el email sintético y el PIN `4321` → **200, `access_token` real emitido**.
2. Ese `access_token` usado como `Authorization: Bearer` contra `POST /rest/v1/rpc/current_tenant_id` → devuelve el `tenant_id` correcto de "Pa Comer".
3. La misma llamada usando solo la `anon key` (sin login) → `403 permission denied for function current_tenant_id` (confirma que `anon` sigue sin poder ejecutar las funciones protegidas).

Esto prueba que el mecanismo de login funciona de verdad contra la infraestructura real de Supabase Auth, no solo contra una simulación dentro de la base de datos.

## Archivos modificados
- `index.html` (fix de 1 línea, ver arriba)
- `docs/context/HANDOFF_LOOP_04.md` (nuevo)
- Pendiente en este turno: `docs/architecture/BUSINESS_RULES.md`, `docs/context/PROJECT_STATE.md`.

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`.

## Migraciones
1. `loop04_role_enforcement` — `_require_role()` + `registrar_pago_proveedor` reescrita con el chequeo de rol.
2. `loop04_auth_login_staff_accounts` — `list_staff_for_login`, `_create_staff_account`, `crear_usuario`, `bootstrap_admin`.
3. `loop04_fix_identities_generated_email` — corrige el insert a `auth.identities` (la columna `email` es generada, no se puede insertar directo).
4. `loop04_fix_gotrue_null_token_columns` — corrige `_create_staff_account` para no dejar NULL en las columnas de token que GoTrue escanea como string no-nulo (el bug real descrito arriba).

## QA ejecutado

### Test
- [x] **Usuario no autenticado no accede a datos protegidos**: `current_tenant_id()`/`current_app_user_id()` sin JWT devuelven `null`; `abrir_caja(...)` sin autenticar → rechazado (`No autenticado`).
- [x] **Cajero no puede ejecutar una operación administrativa aunque la invoque directo por RPC** (no solo "aunque manipule la UI" — se probó el caso más fuerte, llamando la función directamente): `registrar_pago_proveedor` como `cajero` → rechazado (`Rol cajero no tiene permiso para esta operacion`).
- [x] La misma operación como `admin` → funciona normalmente.
- [x] **RLS verificada correctamente** (con una corrección de metodología importante, ver más abajo): creado un segundo tenant de prueba ("QA Tenant B") con un proveedor marcado "SECRETO"; un usuario `admin` del tenant "Pa Comer" consultando `suppliers` **bajo el rol `authenticated` real** (`SET LOCAL ROLE authenticated`) solo ve su propio proveedor, nunca el de "QA Tenant B".
- [x] **Auditoría registra usuario**: ya verificado en Loop 03 (`actor_user_id` en cada evento); no se repitió aquí por no ser nueva superficie.
- [x] Todos los datos de prueba (2 usuarios auth, 2 `app_users`, tenant B, proveedor/compra/pago de prueba) eliminados al terminar.
- [x] `bootstrap_admin` crea la cuenta correctamente; una segunda llamada sobre el mismo tenant es rechazada ("ya tiene personal registrado").
- [x] Login real vía HTTP (`grant_type=password`) con el PIN como contraseña → `200` + `access_token` válido.
- [x] Ese token, usado contra la API REST real, resuelve `current_tenant_id()` correctamente; sin login, la misma llamada es rechazada.
- [x] Cuenta de prueba del login real (`auth.users`, `auth.identities`, `app_users`, `audit_events` asociados) eliminada al terminar — el tenant "Pa Comer" quedó otra vez sin personal, listo para que el primer admin real haga su propio `bootstrap_admin`.

### Hallazgo de metodología de QA (importante para loops futuros)
La primera vez que probé el aislamiento entre tenants, **usé `execute_sql` directo sin cambiar de rol**, y el admin del tenant A sí pudo leer el proveedor "secreto" del tenant B. Esto **no era una falla de RLS real**: `execute_sql` corre como el rol `postgres` (dueño de las tablas), y en Postgres el dueño de una tabla **siempre bypassea RLS** salvo que se use `FORCE ROW LEVEL SECURITY` — sin importar el JWT simulado. Repetir la consulta con `SET LOCAL ROLE authenticated` (el rol real que usa PostgREST/el cliente Supabase) mostró el comportamiento correcto. **Cualquier prueba de RLS en loops futuros debe hacerse con `SET LOCAL ROLE authenticated`**, nunca como `postgres` directo, o los resultados no son confiables.

## Evidencia
Resultados de cada llamada capturados en la sesión (ver conversación). Conteo de filas verificado antes/después del cleanup.

## Riesgos

1. **PIN en texto plano sigue activo en el front-end** — el objetivo central de este loop ("pasar del PIN local a seguridad real") no está completo. Requiere una decisión de UX de producto (ver Pendientes) antes de tocar el flujo de login.
2. **`registrar_gasto`, `abrir_caja`, `cerrar_caja` no tienen restricción de rol** — se dejaron abiertas a `admin`/`cajero` por interpretación de `LOOP_CONTEXT.md` ("caja administrativa" se interpretó como reapertura, no como apertura/cierre normal ni gastos operativos). Es una interpretación razonable pero no confirmada explícitamente por el usuario — señalado en Decisiones.
3. Las RPC de Mesas/cobros (`cobrar_persona`, `cobrar_mesa`, `registrar_fiado`, `registrar_abono`) siguen sin `_require_role` porque ambos roles pueden usarlas — correcto según el plan, pero vale la pena confirmarlo cuando se defina el login real.
4. El front-end sigue sin conectarse a `hqrjbgheclpnfoexyzyj` — todo lo de este loop es válido a nivel de base de datos pero invisible para un usuario real hasta el loop de integración.

## Pendientes

**El más importante — decisión de alcance, no de diseño**: `index.html` sigue apuntando al proyecto legacy (`jhuwepkpjjvponryzykp`, schema `pos_pacomer`) y usando el modelo de datos antiguo (`db.mesas`, `sb.from('mesa_personas')`, `sb.from('clientes')`, etc.). **No se cambió la URL/clave de Supabase del front-end** porque el nuevo backend (`hqrjbgheclpnfoexyzyj`) tiene un modelo de datos completamente distinto — ninguna de esas tablas existe ahí. Cambiar solo la URL/clave rompería la app entera de inmediato (todas las pantallas dejarían de cargar datos). Conectar el front-end real requiere reescribir la capa de acceso a datos de las ~2360 líneas de `index.html` para hablar con las 8 RPC financieras y el nuevo modelo normalizado — es un esfuerzo grande, equivalente a un loop propio, no algo para hacer de paso. Se necesita confirmación explícita antes de emprenderlo.

Otros pendientes:
- Confirmar si `abrir_caja`/`cerrar_caja`/`registrar_gasto` deben restringirse a `admin` (hallazgo #2 de riesgos).
- Activar "leaked password protection" en el dashboard de Supabase (pendiente desde Loop 02).
- Crear el primer usuario real (`admin`) del negocio: cuando se conecte el front-end, la pantalla de login debe detectar que el tenant no tiene personal (`list_staff_for_login` vacío) y ofrecer `bootstrap_admin` en vez de la lista de nombres.
- No existe todavía una pantalla/RPC para que un admin desactive/edite personal existente, solo para crear (`crear_usuario`) — alta sin baja ni edición.

## Decisiones
- Solo `registrar_pago_proveedor` quedó restringida a `admin` en este loop; las demás RPC se mantuvieron sin restricción de rol porque `LOOP_CONTEXT.md` las agrupa explícitamente bajo lo que un `cajero` sí puede hacer ("mesas, cobros, clientes y crédito"). Esta interpretación queda documentada para que el usuario la corrija si no es la intención.
- Se corrigió el bug de `usuarioActivo`/`usuarioActual` en el front-end sin esperar la decisión de Auth, porque es un fix aislado, de bajo riesgo, que no depende de qué mecanismo de login se elija a futuro.
- Se implementó la opción A (PIN como contraseña real) confirmada por el usuario. **No se cambió la política de longitud mínima de contraseña de Supabase Auth** — no hizo falta: las cuentas se crean vía SQL directo (`auth.users`/`auth.identities`), no por el endpoint de signup de GoTrue, así que la validación de longitud (que GoTrue aplica en signup, no en login) nunca entra en juego. Verificado con un login real de 4 dígitos exitoso.
- No se conectó `index.html` al backend nuevo — ver "Pendientes", es una decisión de alcance que requiere confirmación por el tamaño del esfuerzo, no una duda de diseño.

## Próximo loop
Por confirmar con el usuario: (a) emprender la reescritura de la capa de datos de `index.html` para conectarlo a `hqrjbgheclpnfoexyzyj` (el trabajo más grande pendiente en todo el proyecto), o (b) continuar el plan de loops en el backend (LOOP_05 — Clientes + crédito) y dejar la integración de front-end para después.
