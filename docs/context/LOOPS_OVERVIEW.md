# PA' COMER POS — LOOPS + CONTEXTO

Paquete de handoff para continuar el desarrollo en Claude sin perder contexto.

## Objetivo

Evolucionar el POS actual de Pa' Comer desde un prototipo funcional avanzado hacia un POS/PWA robusto para operación real de restaurante.

## Regla principal

**MESAS queda protegida.**

La pantalla principal Mesas debe mantenerse visual y funcionalmente igual en concepto. Solo se permiten correcciones, accesibilidad, rendimiento y mejoras responsive que no cambien su composición ni su flujo base sin autorización explícita.

## Punto de partida auditado

- Pa' Comer POS v3.0.0.
- Archivo de referencia: `reference/PA_COMER_POS_v3_0_0_AUDIT_SOURCE.html`.
- Módulos actuales: Mesas, Clientes, Proveedores, Caja, Configuración.
- Backend actual: Supabase, schema `pos_pacomer`.
- Persistencia local actual: `localStorage` como respaldo.

## Orden de ejecución

01 Base y contrato
02 Integridad de datos
03 Lógica financiera transaccional
04 Login, usuarios y roles
05 Clientes + crédito
06 Proveedores
07 Caja profesional
08 Dashboard gerencial
09 Responsive sin tocar Mesas
10 Offline-first / PWA
11 Auditoría y seguridad
12 Respaldo y recuperación
13 QA operativo
14 Optimización y entrega

## Flujo de trabajo por Loop

Cada loop debe:

1. Leer `docs/context/LOOP_CONTEXT.md` y el loop específico.
2. Auditar el estado real del repositorio antes de modificar.
3. Implementar únicamente el alcance del loop.
4. Ejecutar QA medible.
5. Documentar cambios.
6. Crear `HANDOFF_LOOP_XX.md`.
7. Declarar riesgos y pendientes.
8. No romper loops anteriores.

## QA final del producto

El POS debe permitir responder rápidamente:

- ¿Cuánto vendimos?
- ¿Cuántas mesas atendimos?
- ¿Cuál es el ticket promedio?
- ¿Cuánto hay en caja?
- ¿Cuánto nos deben?
- ¿Cuánto debemos a proveedores?
- ¿Hay diferencia de caja?
- ¿Quién hizo cada operación?
- ¿Qué operaciones están pendientes de sincronizar?

