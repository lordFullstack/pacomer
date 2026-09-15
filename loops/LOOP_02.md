# LOOP 02 — INTEGRIDAD DEL MODELO DE DATOS

## Objetivo
Normalizar entidades y estados sin romper datos existentes.

## Trabajo
Revisar mesas/personas, clientes/crédito, proveedores, caja, gastos y movimientos. Identificar IDs, foreign keys, timestamps, estados y campos obligatorios. Agregar constraints donde corresponda.

## Aceptación
- No hay relaciones huérfanas conocidas.
- Importes usan tipo numérico adecuado.
- Fechas/timestamps consistentes.
- Reglas críticas tienen constraint o validación backend.
- Migraciones reversibles/documentadas.
