# HANDOFF LOOP 12 — RESPALDO Y RECUPERACIÓN

## Estado
COMPLETADO, con alcance de restauración acordado explícitamente con el usuario.

## Decisión de alcance (confirmada con el usuario antes de construir)
El "respaldo" que existía antes de este loop era una trampa doble: `exportarRespaldo()` exportaba `JSON.stringify(db)` — solo lo que estuviera cargado en pantalla en ese momento, nunca los datos reales del servidor — y `importarRespaldo()` escribía a `save()`, que apunta a tablas de un schema legacy que ya no existe. En la práctica, **nunca hubo un respaldo real ni una restauración real**.

Se le preguntó al usuario qué tan lejos debía llegar la restauración, dado el riesgo real de escribir datos de un archivo subido por el navegador directo a tablas financieras en producción. Eligió la opción más conservadora: **la restauración solo cubre datos de referencia — clientes, proveedores y configuración del negocio. Nunca mesas, pagos, caja ni obligaciones.** Motivo: un archivo de respaldo corrupto o desactualizado restaurando historial financiero podría corromper dinero real; restaurar solo referencia cubre el caso real ("se me borraron mis clientes") sin ese riesgo.

## Archivos modificados (backend, migración `loop12_backup_evento_restauracion`)
- **`registrar_evento_restauracion(p_resumen jsonb)`** (nueva RPC, admin-only) — dado que la restauración reutiliza `crear_cliente`/`crear_proveedor`/`actualizar_config` (ya auditadas), esta RPC solo agrega un evento resumen (`restaurar_respaldo`) para que quede un marcador único y legible de "aquí pasó una restauración", con el conteo de cuántos clientes/proveedores se crearon y si se actualizó la configuración.

## Archivos modificados (front-end)
- `js/08-respaldo.js` — reescrito por completo:
  - `exportarRespaldo()`: ahora consulta 26 tablas reales del tenant actual directamente contra Supabase (mesas, comensales, consumos, obligaciones, pagos, caja, clientes, crédito, proveedores, compras, config, recibos, auditoría). De `app_users` solo se exportan `id,nombre,role,activo` — nunca `auth_user_id` ni nada de `auth.users`/`auth.identities` (esas tablas ni siquiera son alcanzables desde el cliente). El archivo resultante incluye un manifiesto (`tipo`, `version`, `tenant_id`, `exportado_en`, `exportado_por`).
  - `seleccionarArchivoRespaldo()` + `validarRespaldo()`: valida **toda** la estructura antes de tocar cualquier dato — tipo de archivo, tenant_id (rechaza de plano un respaldo de otro negocio), y que cada cliente/proveedor tenga nombre. Si algo falla, se rechaza el archivo completo y no se escribe nada.
  - `renderPreviewRestauracion()`: muestra cuántos clientes/proveedores hay en el archivo, cuántos se crearían (no existen hoy por nombre) y cuántos se omitirían (ya existen — nunca se sobrescribe uno existente), antes de pedir confirmación.
  - `confirmarRestauracion()`: crea los clientes/proveedores nuevos vía `crear_cliente`/`crear_proveedor` (mismas RPC validadas, idempotentes y auditadas que usa el formulario normal), actualiza la configuración vía `actualizar_config` si el archivo la trae, y cierra con `registrar_evento_restauracion`.
- `js/11-configuracion.js`: nueva tarjeta "🗄️ Restaurar respaldo" en Configuración (input de archivo + contenedor de vista previa).

## Cambios funcionales
- El botón "Exportar respaldo" que ya existía en Caja → Movimientos ahora exporta datos reales (mismo botón, implementación reemplazada por dentro).
- Nueva capacidad: restaurar clientes/proveedores/configuración desde un archivo de respaldo, sin tocar nunca mesas/pagos/caja.

## QA ejecutado
Contra el backend real. Se detectó una fila real de datos (`table_sessions` de la mesa 6, con una obligación pendiente de $15.000) que no era mía — probablemente el usuario probando la app desplegada en Vercel — y se dejó completamente intacta; la exportación solo lee, nunca escribe, así que no hubo riesgo, pero se verificó explícitamente antes de continuar.

- [x] Exportación real: 26 tablas consultadas sin error, conteos correctos, manifiesto con `tipo`/`tenant_id`/fecha.
- [x] **Backup corrupto no altera datos**: `validarRespaldo()` rechaza — JSON no parseable, objeto sin `tipo`, tenant_id de otro negocio, y un cliente/proveedor sin nombre — verificado que las 5 variantes devuelven el mensaje de error esperado y ninguna llega a escribir nada.
- [x] Vista previa: con un archivo válido (2 clientes nuevos, 1 proveedor nuevo, config incluida), la vista previa mostró exactamente esos conteos antes de confirmar.
- [x] Restauración real: al confirmar, se crearon 2 clientes y 1 proveedor reales (verificado en `db.clientes`/`db.proveedores` y directo en la base), y la configuración del negocio se actualizó.
- [x] **Restauración queda auditada**: verificado en `audit_events` — aparecen los eventos individuales (`crear_cliente` × 2, `crear_proveedor`, `actualizar_config`, todos con el actor y metadata correctos) más el evento resumen `restaurar_respaldo` con el conteo exacto.
- [x] **No duplica en una segunda restauración**: se volvió a "restaurar" el mismo archivo (mismos nombres) → la vista previa mostró correctamente 0 para crear y 1 para omitir en ambos casos (cliente y proveedor), confirmando que nunca sobrescribe ni duplica un registro existente por nombre.
- [x] Limpieza de datos de prueba (2 clientes, 1 proveedor, la fila de configuración de prueba, la cuenta admin de prueba con su `auth.users`/`auth.identities`) — verificado que la cuenta real y la orden real de la mesa 6 quedaron intactas.

## Problemas encontrados
Ninguno nuevo — se reutilizó la lección ya conocida de limpiar el Service Worker/caché antes de probar cambios nuevos en `localhost`.

## Riesgos pendientes
1. El emparejamiento de "ya existe" es por **nombre exacto** (insensible a mayúsculas/tildes básicas vía `.toLowerCase()`, pero no a variaciones como "Juan Pérez" vs "Juan Perez" sin tilde) — un cliente real escrito con una tilde distinta a la del respaldo se duplicaría en vez de omitirse. No es un riesgo financiero (solo crea un registro de más, no corrompe nada), pero vale la pena saberlo.
2. Sigue sin existir una restauración real de historial financiero (mesas, pagos, caja) — decisión explícita del usuario en este loop, no un olvido. Si más adelante se necesita recuperación de desastre a nivel de base de datos completa, eso es responsabilidad de los backups nativos de Supabase (point-in-time recovery), no de esta función de la app.

## Siguiente paso
LOOP 13 — QA operativo formal (según el plan original de 14 loops).
