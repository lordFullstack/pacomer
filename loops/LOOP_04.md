# LOOP 04 — AUTH, USUARIOS Y ROLES

## Objetivo
Pasar del PIN local a seguridad real.

## Trabajo
Implementar Supabase Auth o mecanismo equivalente seguro sin eliminar la UX rápida del operador. Separar identidad, perfil y rol. Corregir inconsistencia `db.usuarioActivo` vs `ui.usuarioActual`.

## Roles
ADMIN: todo.
CAJERO: mesas, cobros, clientes y crédito.

## Aceptación
- Usuario no autenticado no accede a datos protegidos.
- Cajero no puede consultar/escribir módulos administrativos aunque manipule UI.
- RLS verificada.
- Auditoría registra usuario.
