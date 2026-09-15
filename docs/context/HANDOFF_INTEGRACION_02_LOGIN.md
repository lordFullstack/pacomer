# HANDOFF — INTEGRACIÓN PASO 2: Login real en `index.html`

## Contexto
Paso 2 del orden de integración acordado: (1) RPC operativas ✅, **(2) login real ✅**, (3) módulos secundarios, (4) Mesas. Este es el primer paso que toca `index.html` en producción y el primero que apunta el front-end al backend nuevo.

## Objetivo
Reemplazar el PIN en texto plano comparado en cliente por el login real (Supabase Auth) construido y verificado en Loop 04, manteniendo la misma UX (tocar nombre → marcar 4 dígitos), y conectar por fin `aplicarPermisosPorRol()` — función que existía desde antes pero nunca se invocaba.

## Implementado

### `index.html`
- **`SUPABASE_URL`/`SUPABASE_KEY`/schema** ([index.html:872-875](../../index.html#L872)): ahora apuntan al proyecto `hqrjbgheclpnfoexyzyj` (`public`), no al proyecto legacy. **Este es el cambio de mayor impacto de todo el proyecto hasta ahora**: a partir de este commit, la app habla con el backend nuevo. Los módulos que todavía no fueron migrados (Mesas, Clientes, Proveedores, Caja, Config) van a fallar sus llamadas a Supabase contra tablas que no existen ahí — **esto es esperado** y se degrada sin romper la app (ver "Comportamiento verificado").
- **`PACOMER_TENANT_ID`** (nueva constante): el front-end necesita saber su propio tenant antes de autenticar a nadie (la pantalla de login es pre-auth). Se hardcodea porque cada instalación de `index.html` sirve a un solo restaurante.
- **Pantalla de login reescrita** (antes `renderPinUsers`/`selUsuario`/`pinPress`/`pinCancel` sobre `db.usuarios`; ahora sobre el backend real):
  - `cargarPantallaLogin()` (nueva): llama a `list_staff_for_login(PACOMER_TENANT_ID)` (pública, sin autenticar). Si no hay personal, muestra el formulario de arranque; si hay, la lista de nombres — igual que antes, pero con datos reales y **sin PIN viajando al cliente en ningún momento**.
  - `pinPress()`: ya no compara el PIN localmente. Llama a `sb.auth.signInWithPassword({email: <login_email del usuario>, password: <pin>})` real. Si falla, mismo mensaje "PIN incorrecto" de siempre. Si funciona, busca el `app_user` real (`nombre`, `role`) y **ahora sí llama a `aplicarPermisosPorRol(rol)`** — función que existía en el código desde antes (línea ~2060) pero nunca se invocaba, según el hallazgo de auditoría del Loop 01.
  - `mostrarBootstrap()` / `crearAdminBootstrap()` (nuevas): si el restaurante no tiene ningún usuario todavía, un formulario simple (nombre + PIN) llama a `bootstrap_admin`. Nunca se expone si ya existe personal (esa RPC ya lo bloquea en backend, ver Loop 04).
- **HTML del PIN gate** ([index.html:570-591](../../index.html#L570)): se agregó el formulario de arranque (`#pg-bootstrap`), oculto por defecto. No se tocó la composición visual de Mesas (esta pantalla es previa/separada de Mesas, no está protegida).
- **Flujo de inicio** ([index.html final](../../index.html)): ya no decide mostrar el PIN gate según `db.usuarios.some(activo)` (que ahora siempre estaría vacío) — llama a `cargarPantallaLogin()` directamente, que decide por sí sola (lista vacía → arranque; lista con datos → selección).

## Comportamiento verificado en navegador real (no solo revisión de código)

Se cargó `index.html` en un navegador real y se probó el flujo completo de punta a punta:

1. **Con el tenant sin personal**: la app mostró el formulario de arranque automáticamente (0 llamadas simuladas — `list_staff_for_login` real devolvió `[]`).
2. Se creó un administrador real ("Jorge Luis", PIN de prueba) desde el formulario → verificado directamente en la base de datos que la cuenta se creó de verdad (`auth.users` + `auth.identities` + `app_users`, rol `admin`).
3. La pantalla se refrescó sola mostrando el nombre nuevo en la lista de login.
4. **PIN incorrecto** → rechazado (llamada real a `signInWithPassword`, sin mensajes de error de JS, los puntos del PIN se limpiaron como espera la UX).
5. **PIN correcto** → toast "Hola, Jorge Luis 👋", pantalla de login se ocultó, la app cargó Mesas — y la barra de navegación mostró **Proveedores/Caja/Config visibles** (correcto, es admin).
6. Se creó un segundo usuario con rol `cajero` (vía `crear_usuario`, ejecutada como el admin real recién logueado — no fue necesario hacerlo por SQL directo, confirma que el flujo admin→crear personal funciona).
7. Se cerró sesión y se inició con el cajero → toast "Hola, QA Cajero Prueba 👋", y la barra de navegación mostró **solo Mesas y Clientes** — Proveedores/Caja/Config correctamente ocultos. `aplicarPermisosPorRol` funciona en el navegador real, no solo en teoría.
8. La consola del navegador mostró los errores esperados (404 en tablas legacy como `mesa_personas`, `caja`, etc.) — confirma que el resto de módulos efectivamente no funcionan todavía **sin romper la carga de la página ni el login**, tal como se previó al acordar este orden de integración.

## Hallazgo colateral: bug de limpieza de datos de prueba (Loop 04)

Verificando la limpieza de esta sesión se encontraron **2 cuentas de `auth.users` huérfanas desde el Loop 04**: al limpiar, se había borrado `public.app_users` primero y luego se intentaba buscar el `auth_user_id` correspondiente consultando esa misma tabla ya vacía — el `DELETE` no encontraba nada y no fallaba (0 filas afectadas, sin error). Quedaron 2 usuarios de prueba reales en `auth.users` desde el Loop 04 sin que se notara. Corregido en esta sesión (se identificaron por su email sintético y se eliminaron directamente por `id`). **Lección para limpiezas futuras**: siempre capturar el `auth_user_id` en una variable/valor conocido *antes* de borrar `app_users`, nunca depender de una subconsulta a una tabla que se borra en el mismo bloque.

## Archivos modificados
- `index.html` (login real, permisos conectados, backend nuevo)
- `docs/context/HANDOFF_INTEGRACION_02_LOGIN.md` (nuevo)

## Base de datos
Proyecto `hqrjbgheclpnfoexyzyj`. Sin migraciones nuevas — se usaron las RPC ya construidas en Loop 04 (`list_staff_for_login`, `bootstrap_admin`, `crear_usuario`).

## Riesgos
1. **A partir de este cambio, Mesas/Clientes/Proveedores/Caja/Config no funcionan** (llamadas a tablas legacy inexistentes) hasta completar los pasos 3 y 4. Es el estado intermedio esperado, pero si alguien abre la app real en este momento verá esas pantallas vacías/con errores de red en consola.
2. El tenant "Pa Comer" quedó **sin ningún usuario** (se limpiaron las cuentas de prueba) — la primera persona en abrir la app real verá el formulario de arranque y deberá crear el administrador real con su propio nombre y PIN. No se dejó ninguna cuenta de prueba ni real configurada a propósito.
3. `crear_usuario`/`bootstrap_admin` no validan que el PIN elegido no sea trivial (`0000`, `1234`, etc.) — no había ninguna regla de negocio documentada al respecto.

## Pendientes
- Paso 3: reconectar Clientes, Proveedores, Caja, Configuración a las RPC/vistas ya construidas (Loops 05-08).
- Paso 4: Mesas — la pantalla protegida, usando `abrir_orden`/`agregar_persona`/`editar_valor_persona`/`liberar_orden` (integración paso 1) + `cobrar_persona`/`cobrar_mesa`/`registrar_fiado` (Loop 03).
- Revisar si hay más limpiezas de QA de loops anteriores con el mismo bug de orden de borrado (no se auditaron todas retroactivamente, solo se corrigió lo encontrado en esta sesión).

## Decisiones
- El formulario de arranque no reutiliza el teclado numérico del PIN gate (para no complicar ese componente con un modo dual) — es un formulario simple aparte, más fácil de mantener.
- No se dejó ninguna cuenta creada al terminar esta sesión de pruebas — el arranque real queda para que el dueño del negocio lo haga con su propio nombre y PIN, no con datos elegidos por Claude.

## Próximo paso
Paso 3 del plan de integración: módulos secundarios (Clientes, Proveedores, Caja, Configuración).
