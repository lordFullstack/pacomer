# LOOP 03 — LÓGICA FINANCIERA TRANSACCIONAL

## Objetivo
Eliminar operaciones financieras parcialmente ejecutadas.

## Crear casos de uso/RPC
- cobrar_persona
- cobrar_mesa
- registrar_fiado
- registrar_abono
- registrar_gasto
- registrar_pago_proveedor
- abrir_caja
- cerrar_caja

## Reglas
Cada operación: validar → ejecutar → movimiento → actualización de saldo/caja → auditoría → commit.
Agregar idempotency key.

## Aceptación
- Doble clic no duplica dinero.
- Retry de red no duplica movimiento.
- Error intermedio hace rollback.
- Cada movimiento queda ligado a usuario y referencia.
