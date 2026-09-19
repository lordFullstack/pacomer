# HANDOFF LOOP 10 — OFFLINE-FIRST / PWA

## Estado
COMPLETADO — código y despliegue. Publicado en Vercel (plan hobby, cuenta `lordfullstack`, proyecto `pacomer-pos`, vinculado al repo de GitHub `lordFullstack/pacomer`, despliega automáticamente en cada push a `main`).

**URL de producción: https://pacomer-pos.vercel.app**

Verificado directamente contra ese dominio real (no solo `localhost`): HTTPS activo, Service Worker registrado (`https://pacomer-pos.vercel.app/sw.js`, estado `active`), `manifest.json` servido y válido, la app carga y muestra la pantalla de login igual que en local.

## Restricción técnica que definió el alcance
Los **Service Workers** (necesarios para caché offline del "cascarón" de la app e instalación como PWA) solo se registran en un **contexto seguro**: `https://` o `http://localhost`. **Nunca funcionan sobre `file://`**, que es como el usuario abre `index.html` hoy (doble clic). Se le preguntó al usuario antes de empezar; confirmó que la app se puede desplegar en Vercel más adelante. Mientras eso no pase, el Service Worker simplemente no se registra en el flujo `file://` actual (el código detecta esto y no falla, ver `js/14-init.js`) — la app sigue funcionando exactamente igual que antes, solo sin caché offline del cascarón.

La **cola de sincronización** (IndexedDB), en cambio, **sí funciona en `file://`** — IndexedDB no requiere contexto seguro. Por eso el trabajo se dividió así:
- Cola de operaciones pendientes + sincronización automática: funciona ya, incluso sin desplegar nada.
- Manifest + Service Worker + instalación como app: el código está listo, pero solo se activa cuando la app se sirva por HTTPS o localhost.

## Decisión de alcance: qué se pone en cola offline y qué no
Solo se encola **agregar un consumo a una mesa** (`abrir_orden` + `agregar_persona`, canal `mesa` — registrar en Mesas y Quick Service de LOOP 08A). **Ninguna operación que mueva dinero se pone en cola**: cobrar (individual o mesa completa), fiar, editar valor, abrir/cerrar/arquear caja, gastos, abonos de clientes, pagos/facturas de proveedores, configuración, usuarios — todas esas **siguen requiriendo conexión en vivo**, exactamente como antes de este loop.

**Por qué**: un cajero nunca debe creer que cobró algo (y por ejemplo dar cambio) si el servidor no confirmó el cobro en el momento. Registrar lo que pidió una mesa es solo captura de datos, reversible y sin riesgo financiero si se demora unos minutos en sincronizar; cobrar no lo es. Esta es una decisión de producto, no solo técnica — documentada aquí para que quede explícita y se pueda ampliar el alcance más adelante si el usuario lo pide.

## Archivos creados
- `manifest.json` — nombre, iconos, colores, `display:standalone`.
- `sw.js` — Service Worker: cachea el cascarón estático (HTML/CSS/JS/iconos/fuentes) con estrategia cache-first + actualización en segundo plano; **nunca cachea llamadas a Supabase** (dominio excluido explícitamente) — los datos del negocio siempre son en vivo o pasan por la cola.
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-192.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon.png` — generados con un script Node propio (sin dependencias, no había ImageMagick disponible) que codifica PNG a mano; un simple "plato" en el color de acento del tema.
- `js/13-offline-sync.js` — toda la lógica de la cola: helpers de IndexedDB (`pacomer_offline`, store `ops`), heurística de error de red, `agregarConsumoMesaConCola()` (punto de entrada usado por Mesas y Quick Service), `encolarConsumoMesa()`, `sincronizarOperacion()`/`sincronizarCola()` (procesa en orden, reutiliza sesión de mesa si otra operación encolada ya la abrió), badge de estado (`#sync-badge`), listeners de `online`/`offline` + reintento cada 30s como respaldo.
- `docs/context/HANDOFF_LOOP_10.md` — este archivo.

## Archivos modificados
- `index.html`: `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">`; nuevo `<div id="sync-badge">` dentro de `.hstats` (chrome compartido, mismo criterio que el header de LOOP 09 — no es parte de la composición protegida de Mesas); scripts `js/13-offline-sync.js` agregado y `js/13-init.js` renombrado a `js/14-init.js` (debe seguir cargando último).
- `js/14-init.js` (antes `js/13-init.js`): al terminar de cargar, llama `actualizarBadgeSync()` + `sincronizarCola()`; registra el Service Worker solo si `location.protocol==='https:'` o `location.hostname==='localhost'`.
- `js/03-mesas.js`: `registrar()`, rama `mesa` (la única tocada) ahora llama a `agregarConsumoMesaConCola()` en vez de encadenar `sb.rpc('abrir_orden')`+`sb.rpc('agregar_persona')` directo. Comportamiento en línea idéntico al anterior; nuevo comportamiento solo cuando falla por red. Las ramas `llevar`/`domicilio` (que cobran de inmediato) **no se tocaron**.
- `js/04-quick-service.js`: `qsRegistrar()` usa la misma función compartida en vez de su propia lógica de `abrir_orden`/sesión existente — el comportamiento visible (autogenerar "Consumo N", limpiar campos, toasts) es el mismo, solo cambia qué pasa cuando no hay red.
- `css/styles.css`: una regla nueva para `#sync-badge` (color de acento).

## QA ejecutado
Contra el backend real, sirviendo la app por HTTP local (`localhost`, donde el Service Worker sí puede registrarse — a diferencia de `file://`).

- [x] Service Worker se registra correctamente en `localhost` (`navigator.serviceWorker.getRegistration()` → activo, `sw.js`).
- [x] `manifest.json` se sirve, se parsea como JSON válido y el `<link rel="manifest">` apunta a él.
- [x] Cascarón cacheado por el Service Worker: 26 recursos (HTML, CSS, los 14 JS, 5 iconos, 2 fuentes) confirmados dentro de `caches.open('pacomer-shell-v1')`.
- [x] **Registrar sin internet**: con `navigator.onLine` forzado a `false`, `registrar()` en Mesa 7 → la operación queda en IndexedDB con `status:'pending'`, toast "Sin conexión — Mesa 7 guardada...", badge muestra "🔄 1 pendiente por sincronizar", **y `db.mesas[7]` no se modifica** (sin dato optimista falso — se decidió así para no tocar el render protegido de Mesas). Verificado también que el servidor no creó ningún `table_session` mientras estuvo en cola.
- [x] **Recuperar conexión + sincronizar automáticamente**: al restaurar `navigator.onLine=true` y disparar el evento `online`, la cola se vació sola (sin intervención manual), el toast cambió a "✓ Sincronizado: Mesa 7 — $18.000", el badge desapareció, y `db.mesas[7]` quedó con los datos reales del servidor (mismo resultado que si hubiera sido en línea desde el principio).
- [x] **No duplicar operaciones**: dos registros offline seguidos en la misma mesa (Mesa 9, $12.000 y $9.000) → al sincronizar, ambos quedaron en **la misma sesión de mesa** (verificado tanto en `db.mesas[9].tableSessionId` como con una consulta directa a `table_sessions`: exactamente 1 fila para esa mesa, no 2).
- [x] Operaciones de dinero (`cobrarPersona`) no se tocaron ni se encolan — se comportan exactamente igual que antes de este loop (verificado que sigue exigiendo caja abierta antes de intentar cualquier red, sin cambios de código en esa función).
- [x] Limpieza de datos de prueba (sesiones/comensales/consumos/obligaciones de las mesas 7 y 9, usuario admin de prueba con su `auth.users`/`auth.identities`) — mismo procedimiento de siempre, verificado en cero al final.

## Problemas encontrados
1. No hay forma de cortar la conexión de red *real* del navegador con las herramientas disponibles en esta sesión (no hay "modo offline" del DevTools Protocol expuesto) — la prueba de "sin internet" se hizo sobreescribiendo `navigator.onLine` y disparando los eventos `online`/`offline` a mano, que es exactamente la señal que el código de la app observa. No se pudo probar con un corte de red físico/real, pero la lógica que reacciona a esa señal es la misma en ambos casos.
2. No había herramienta de conversión de imágenes disponible (ni ImageMagick ni similar) para generar los iconos PNG del manifest — se resolvió con un script Node que codifica PNG a mano (sin dependencias externas), ver `icons/`.

## Riesgos pendientes
1. **`https://pacomer-pos.vercel.app` es un dominio nuevo, todavía no comunicado a los usuarios finales** — hoy la operación real del restaurante sigue siendo `file://` (doble clic); usar el dominio de Vercel como principal (para que la PWA se pueda instalar de verdad) es una decisión aparte que el usuario debe tomar y comunicar a su equipo.
2. El `CACHE_NAME` (`pacomer-shell-v1`) hay que incrementarlo manualmente cada vez que se publique una versión nueva de los archivos estáticos, si no los usuarios con la PWA instalada seguirían viendo una versión cacheada vieja hasta que el Service Worker note el cambio — no hay un mecanismo de invalidación automática basado en contenido en esta primera versión.
3. Si dos dispositivos distintos quedan offline y ambos registran algo en la **misma mesa** antes de que cualquiera sincronice, cada uno sincronizará por su lado sin verse entre sí hasta que ambos tengan internet — el orden final en el servidor dependerá de quién sincronice primero (no hay conflicto de datos, solo pueden intercalarse en un orden distinto al que ocurrieron en la vida real). Caso límite, no cubierto explícitamente por el spec.

## Siguiente paso
LOOP 11 — Auditoría y seguridad (UI de consulta del `audit_events` ya existente + RPC de anulación de pagos, que hoy no existe).

## Actualización 2026-09-19 — se amplió el alcance offline

Motivo: un corte real de internet dejó las cards de Mesas sin mostrar
cuánto debía cada mesa (aunque el registro sí había quedado guardado en la
cola), y el usuario pidió explícitamente poder seguir cobrando en efectivo
durante el corte, no solo registrar. Dos cambios sobre el diseño original:

1. **Las cards ahora reflejan lo que sigue en la cola offline**, no solo lo
   que ya confirmó el servidor. `aplicarPendientesOffline()`
   (`js/13-offline-sync.js`) fusiona en `db.mesas` los consumos y cobros
   pendientes cada vez que se llama `cargarMesas()`, y también justo
   después de encolar algo nuevo — así la mesa deja de verse "Libre" o con
   el total viejo mientras no hay señal.
2. **Cobrar (individual y mesa completa) ahora también se encola sin
   conexión** — contradice el punto anterior de este documento ("ninguna
   operación que mueva dinero se pone en cola"). La razón del cambio: el
   dinero en efectivo ya lo recibe el cajero en el momento, sin importar si
   el POS tiene señal o no; lo único que se difiere es la confirmación
   contable en el servidor. Abrir/cerrar caja, gastos, abonos de clientes y
   pagos a proveedores siguen sin encolarse — esas sí requieren ver el
   estado real del servidor antes de decidir, no solo confirmar algo que ya
   pasó físicamente.

Salvaguardas que se mantuvieron para no perder la disciplina original:
- Un cobro sobre un consumo que todavía no tiene `diner_id` real (su propio
  registro sigue en la cola) no se encola como operación aparte — se marca
  sobre la MISMA operación pendiente (`cobrarAlSincronizar`) para que, al
  crearse el comensal en el servidor, se cobre en el mismo golpe. Evita
  inventar un id que no existe.
- "Fiar" y "corregir valor" siguen bloqueados sobre filas sin sincronizar
  (necesitan un `obligation_id` real) — el alcance ampliado es solo
  registrar y cobrar en efectivo.
- "Liberar sin cobrar" sigue exigiendo que la mesa esté sincronizada, por
  ser una acción que condona saldo pendiente.
- Se encontró y corrigió una condición de carrera real durante las pruebas:
  el sync automático (cada 30s) podía pisar con una copia vieja del objeto
  una marca de "cobrar al sincronizar" hecha en paralelo por el cajero. Se
  corrigió con lecturas/escrituras atómicas sobre IndexedDB
  (`offlineMutar()`) en vez de leer-modificar-escribir con una copia en
  memoria potencialmente desactualizada.
