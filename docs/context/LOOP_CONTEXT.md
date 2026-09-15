# LOOP CONTEXT — PA' COMER POS

## Identidad del producto

**Nombre:** Pa' Comer POS
**Versión base auditada:** v3.0.0
**Tipo:** POS/PWA de operación para restaurante

## Principio del proyecto

El sistema debe priorizar velocidad operativa, claridad y seguridad contable.

No convertirlo en un ERP innecesariamente complejo.

## Pantalla protegida

### MESAS

Mantener:
- grid de 20 mesas
- estados libre/ocupada
- total visible
- filtros Todas/Ocupadas/Libres
- órdenes sin mesa: Para llevar y Domicilio
- panel lateral de registro
- modal de mesa
- agregar persona
- cobrar individual
- fiar
- editar valor
- cobrar todo
- liberar mesa

La implementación puede corregir bugs y reforzar lógica, pero no debe rediseñarse sin autorización.

## Estado actual observado

La base ya contiene estructuras para:
- mesas
- personas por mesa
- órdenes para llevar
- domicilios
- clientes
- historial de clientes
- proveedores
- movimientos de proveedores
- movimientos generales
- caja
- gastos de caja
- configuración
- usuarios

## Hallazgos críticos de auditoría

1. El PIN actual está validado en cliente y no equivale a autenticación real.
2. La función de permisos por rol existe, pero debe integrarse de forma consistente y respaldarse en backend/RLS.
3. Existe inconsistencia entre `db.usuarioActivo` y `ui.usuarioActual`.
4. Las operaciones financieras usan llamadas separadas y requieren transacciones atómicas/RPC.
5. No hay una PWA completa en el archivo auditado: falta manifest/service worker/estrategia offline robusta.
6. No existen media queries en el archivo auditado.
7. El backup actual serializa el objeto completo y debe excluir secretos/credenciales.
8. El importador de backup necesita validación y merge/restore seguro.

## Arquitectura objetivo

```text
UI
 ↓
Application Service Layer
 ↓
Validation / Business Rules
 ↓
Postgres RPC / Transactions
 ↓
Supabase + RLS
 ↓
Audit Log
 ↓
Dashboard / KPIs
```

Offline:

```text
UI
 ↓
Local domain store / IndexedDB
 ↓
Pending operation queue
 ↓
Sync engine
 ↓
Supabase
```

## Roles objetivo

### ADMIN
Acceso total.

### CAJERO
Mesas, cobros, clientes, crédito. Sin administración de proveedores, caja administrativa, configuración ni usuarios.

La ocultación visual nunca sustituye a la autorización backend.

## Definición de terminado

Un loop está terminado solo si:
- funciona en el flujo real
- tiene validaciones
- tiene manejo de errores
- tiene QA ejecutado
- tiene documentación
- no rompe el alcance protegido
- deja handoff para el siguiente loop

