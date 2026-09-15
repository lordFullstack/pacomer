# LOOP 01 — BASE Y CONTRATO

## Objetivo
Estabilizar el contexto del proyecto antes de tocar lógica.

## Instrucciones a Claude
Audita repositorio, estructura, Supabase, dependencias y flujo actual. Documenta arquitectura real. Identifica divergencias entre UI, estado local y BD.

Crear/actualizar:
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/BUSINESS_RULES.md`
- `docs/context/PROJECT_STATE.md`

## Prohibido
Modificar visualmente Mesas.

## Aceptación
- Documento de arquitectura basado en código real.
- Lista de tablas/relaciones verificadas.
- Lista de riesgos P0/P1/P2.
- App ejecuta sin regresiones.
