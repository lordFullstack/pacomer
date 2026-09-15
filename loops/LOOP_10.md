# LOOP 10 — OFFLINE-FIRST / PWA

## Objetivo
Permitir operación con Internet inestable.

## Trabajo
Agregar manifest, service worker, caché, IndexedDB/local domain store, cola de operaciones y sincronización.

## Estados de sync
pending / syncing / synced / failed.

## Aceptación
- Registrar operación sin Internet.
- Recuperar conexión.
- Sincronizar automáticamente.
- No duplicar operaciones.
- Mostrar estado de sincronización al usuario.
