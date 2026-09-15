# LOOP 08A — MOBILE QUICK SERVICE

Registro móvil compacto para atención de mesa.

## Contexto
Se implementa sobre Pa' Comer POS con Loop 08 ya desarrollado. Agrega una experiencia móvil específica para registrar consumos de mesa rápidamente, sin mostrar la vista general de Mesas.

## Regla innegociable
No modificar visualmente la pantalla principal de Mesas. La pantalla desktop de Mesas continúa funcionando como antes. La nueva pantalla es una experiencia complementaria **exclusiva para móvil**.

## Objetivo
Mesa → Nombre/Referencia → Valor → Nota → Registrar, sin scroll, con la menor cantidad posible de errores, usable con una mano.

## Alcance
- Selector de 20 mesas (grid 5×4), sin Mesa/Llevar/Domicilio, sin montos rápidos, sin grid/resumen general, sin dashboard, sin sidebar, sin modal intermedio.
- Nombre/Referencia opcional — si está vacío, se autogenera `Consumo N`.
- Valor con teclado numérico, formato colombiano inmediato.
- Nota compacta (una línea), opcional.
- Botón Registrar inmediatamente debajo de Nota, mostrando el resumen de la operación antes de confirmar.
- Prevención de doble registro (bandera en memoria + idempotencia real en backend).
- Enter en Valor → foco a Nota. Enter en Nota → ejecuta Registrar si es válido.
- Validaciones: mesa=ninguna → "Selecciona una mesa" (bloquea). valor≤0 → "Ingresa el valor" (bloquea).
- Tras registrar, la mesa queda seleccionada y los campos se limpian, para encadenar varios consumos sin volver a tocar la mesa.
- Reutiliza el modelo de datos y la lógica de consumo/cobro individual ya existente (`agregar_persona`, `abrir_orden`, `cobrar_persona` — Integración paso 1 y Loop 03). No crea entidades nuevas.
- Responsive sin scroll vertical en 360×800, 375×812, 390×844, 412×915.

## Entrada a la pantalla
No especificado en el spec original. Se implementó como un botón flotante (FAB, `⚡`) fijo en la esquina inferior derecha, visible únicamente vía `@media (max-width: 600px)` — nunca aparece en desktop, consistente con "exclusiva para móvil" sin tocar la composición de Mesas.

## QA definido
Casos A-H: registro simple, tres consumos independientes con total de mesa, sin nombre (autogenera referencia), sin mesa (bloquea), valor 0 (bloquea), doble toque (un solo consumo), 360×800 sin scroll, cobro individual posterior sin afectar a los demás.

Ver `docs/context/HANDOFF_LOOP_08A.md` para el resultado de cada caso.

## Siguiente loop
LOOP 09 — Caja Profesional (nota: en el plan de 14 loops original ya construido en esta sesión, "Caja Profesional" corresponde a LOOP 07, completado; ver `docs/context/PROJECT_STATE.md` para el estado real de la numeración de loops de este proyecto).
