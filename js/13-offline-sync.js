// ════════════════════════════════════════════════════════
// LOOP 10 — OFFLINE-FIRST (cola de sincronizacion)
// ════════════════════════════════════════════════════════
// Alcance: agregar consumo a una mesa (abrir_orden + agregar_persona) Y
// cobrar (individual o mesa completa) se ponen en cola sin conexion, para
// que el cajero pueda seguir operando durante un corte de luz/internet.
// Sigue habiendo una caja registradora fisica de por medio: el dinero ya
// se recibio en efectivo en el momento del "Cobrar", la cola solo difiere
// la confirmacion contable en el servidor. Abrir/cerrar caja, gastos,
// abonos de clientes y pagos a proveedores NO se encolan — esas requieren
// ver el estado real del servidor antes de decidir. Ver
// docs/context/HANDOFF_LOOP_10.md para el detalle de la decision original
// y el por que se amplio (pedido explicito del usuario tras un corte real
// donde no se veia cuanto debia cada mesa).
//
// No toca ninguna funcion de render de Mesas (protegida) — solo
// reutiliza cargarMesas()/renderTodo() ya existentes, igual que el
// resto del codigo online.
var OFFLINE_DB_NAME = 'pacomer_offline';
var OFFLINE_DB_VERSION = 1;
var OFFLINE_STORE = 'ops';
var offlineSincronizando = false;

function offlineDb() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function offlineAdd(op) {
  return offlineDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).add(op);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function offlineUpdate(op) {
  return offlineDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(op);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function offlineDelete(id) {
  return offlineDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

// Lee y escribe una operacion dentro de la MISMA transaccion de IndexedDB
// (get + put atomicos) para evitar que dos escrituras concurrentes sobre la
// misma operacion se pisen entre si — por ejemplo, el sync periodico
// (cada 30s) marcando una operacion como fallida justo mientras el cajero
// la marca para cobrar al sincronizar. mutar(op) modifica el objeto en
// sitio; si la operacion ya no existe (se borro por otro lado), mutar no se
// llama y se resuelve con undefined.
function offlineMutar(id, mutar) {
  return offlineDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_STORE, 'readwrite');
      var store = tx.objectStore(OFFLINE_STORE);
      var req = store.get(id);
      req.onsuccess = function() {
        var op = req.result;
        if (op) { mutar(op); store.put(op); }
        resolve(op);
      };
      req.onerror = function() { reject(req.error); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function offlineGetAll() {
  return offlineDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_STORE, 'readonly');
      var req = tx.objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function esErrorDeRed(err) {
  if (!navigator.onLine) return true;
  if (!err) return false;
  var msg = ((err.message || String(err)) + '').toLowerCase();
  return msg.indexOf('failed to fetch') > -1 || msg.indexOf('network') > -1 ||
         msg.indexOf('load failed') > -1 || msg.indexOf('fetch failed') > -1;
}

function actualizarBadgeSync() {
  var badge = document.getElementById('sync-badge');
  if (!badge) return;
  offlineGetAll().then(function(ops) {
    var pendientes = ops.filter(function(o) { return o.status !== 'synced'; }).length;
    if (pendientes > 0) {
      badge.style.display = '';
      badge.textContent = '🔄 ' + pendientes + ' pendiente' + (pendientes > 1 ? 's' : '') + ' por sincronizar';
    } else {
      badge.style.display = 'none';
    }
  }).catch(function(){ badge.style.display = 'none'; });
}

// Busca una sesion de mesa ya abierta (por si otra operacion encolada la
// creo primero); si no existe, la abre. idemAbrir se reutiliza en reintentos
// para no crear sesiones duplicadas si una respuesta anterior se perdio.
function buscarOAbrirSesion(tableId, idemAbrir) {
  return sb.from('table_sessions').select('id').eq('table_id', tableId).eq('status', 'OPEN').maybeSingle().then(function(rs) {
    if (rs.error) throw rs.error;
    if (rs.data && rs.data.id) return rs.data.id;
    return sb.rpc('abrir_orden', { p_channel: 'mesa', p_table_id: tableId, p_idempotency_key: idemAbrir }).then(function(ra) {
      if (ra.error) throw ra.error;
      return ra.data.table_session_id;
    });
  });
}

function encolarConsumoMesa(tableId, mesaLabel, valor, nombre, nota) {
  var op = {
    id: uid(), tipo: 'agregar_consumo_mesa',
    tableId: tableId, mesaLabel: mesaLabel, valor: valor, nombre: nombre || null, nota: nota || null,
    idemAbrir: uid(), idemAgregar: uid(),
    status: 'pending', intentos: 0, error: null, creadoEn: Date.now()
  };
  return offlineAdd(op).then(function() {
    actualizarBadgeSync();
    return { ok: true, offline: true, opId: op.id };
  });
}

// Punto de entrada usado por Mesas (registrar, canal mesa) y por
// Quick Service (LOOP 08A). Camino en linea: identico en efecto al
// codigo anterior (abrir_orden si hace falta + agregar_persona). Solo
// si falla por red, encola en vez de mostrar error.
function agregarConsumoMesaConCola(tableId, mesaLabel, valor, nombre, nota) {
  if (!navigator.onLine) return encolarConsumoMesa(tableId, mesaLabel, valor, nombre, nota);
  return buscarOAbrirSesion(tableId, uid()).then(function(sessionId) {
    return sb.rpc('agregar_persona', {
      p_table_session_id: sessionId, p_nombre: nombre || null, p_descriptor: null,
      p_valor: valor, p_nota: nota || null, p_idempotency_key: uid()
    }).then(function(rp) {
      if (rp.error) { if (esErrorDeRed(rp.error)) throw rp.error; return { ok: false, error: rp.error.message }; }
      return { ok: true, offline: false, dinerId: rp.data.diner_id, obligationId: rp.data.obligation_id };
    });
  }).catch(function(err) {
    if (esErrorDeRed(err)) return encolarConsumoMesa(tableId, mesaLabel, valor, nombre, nota);
    return { ok: false, error: (err && err.message) || 'Error desconocido' };
  });
}

function encolarCobroPersona(dinerId, valor) {
  return offlineGetAll().then(function(ops) {
    var existente = ops.find(function(o) { return o.tipo === 'cobrar_persona' && o.dinerId === dinerId && o.status !== 'synced'; });
    if (existente) return { ok: true, offline: true, opId: existente.id };
    var op = {
      id: uid(), tipo: 'cobrar_persona',
      dinerId: dinerId, valor: valor, idem: uid(),
      status: 'pending', intentos: 0, error: null, creadoEn: Date.now()
    };
    return offlineAdd(op).then(function() {
      actualizarBadgeSync();
      return { ok: true, offline: true, opId: op.id };
    });
  });
}

// Marca el propio consumo encolado (aun sin diner_id real) para que, apenas
// se cree en el servidor durante la sincronizacion, se cobre de inmediato
// con los mismos tenders. Evita inventar un diner_id que todavia no existe.
// Atomico (offlineMutar) para no perder la marca si el sync automatico esta
// procesando esta misma operacion en paralelo.
function marcarCobroEnConsumoPendiente(opId) {
  return offlineMutar(opId, function(op) {
    if (!op.cobrarAlSincronizar) op.cobrarAlSincronizar = { idem: uid() };
  }).then(function(op) {
    if (!op) return { ok: false, error: 'Ese consumo ya se sincronizó — actualizando la mesa…' };
    actualizarBadgeSync();
    return { ok: true, offline: true };
  });
}

// Punto de entrada usado por cobrarPersona() (js/03-mesas.js). p es la
// persona tal como vive en db.mesas[n].personas.
function cobrarPersonaConCola(p) {
  if (p.offline) return marcarCobroEnConsumoPendiente(p.id);
  if (!navigator.onLine) return encolarCobroPersona(p.id, p.valor);
  return sb.rpc('cobrar_persona', { p_diner_id: p.id, p_tenders: [{method:'efectivo', amount: p.valor}], p_idempotency_key: uid() }).then(function(r) {
    if (r.error) { if (esErrorDeRed(r.error)) return encolarCobroPersona(p.id, p.valor); return { ok: false, error: r.error.message }; }
    return { ok: true, offline: false };
  }).catch(function(err) {
    if (esErrorDeRed(err)) return encolarCobroPersona(p.id, p.valor);
    return { ok: false, error: (err && err.message) || 'Error desconocido' };
  });
}

function encolarCobroMesa(tableId, mesaLabel, montoACobrar) {
  return offlineGetAll().then(function(ops) {
    var existente = ops.find(function(o) { return o.tipo === 'cobrar_mesa' && o.tableId === tableId && o.status !== 'synced'; });
    if (existente) return { ok: true, offline: true, opId: existente.id };
    var op = {
      id: uid(), tipo: 'cobrar_mesa',
      tableId: tableId, mesaLabel: mesaLabel, montoACobrar: montoACobrar,
      idemCobrar: uid(), idemLiberar: uid(),
      status: 'pending', intentos: 0, error: null, creadoEn: Date.now()
    };
    return offlineAdd(op).then(function() {
      actualizarBadgeSync();
      return { ok: true, offline: true, opId: op.id };
    });
  });
}

// Punto de entrada usado por cobrarTodo() (js/03-mesas.js). sessionId puede
// ser null si la mesa entera se abrio sin conexion (aun no hay sesion real
// en el servidor) — en ese caso se encola igual y se resuelve la sesion en
// el momento de sincronizar.
function cobrarMesaConCola(tableId, mesaLabel, sessionId, montoACobrar) {
  if (!navigator.onLine || !sessionId) return encolarCobroMesa(tableId, mesaLabel, montoACobrar);
  var cobroPromise = montoACobrar > 0
    ? sb.rpc('cobrar_mesa', { p_table_session_id: sessionId, p_tenders: [{method:'efectivo', amount: montoACobrar}], p_idempotency_key: uid() })
    : Promise.resolve({ error: null });
  return cobroPromise.then(function(r) {
    if (r.error) { if (esErrorDeRed(r.error)) return encolarCobroMesa(tableId, mesaLabel, montoACobrar); return { ok: false, error: r.error.message }; }
    return sb.rpc('liberar_orden', { p_table_session_id: sessionId, p_confirmar_con_pendiente: false, p_idempotency_key: uid() }).then(function(r2) {
      if (r2.error) { if (esErrorDeRed(r2.error)) return encolarCobroMesa(tableId, mesaLabel, montoACobrar); return { ok: false, error: r2.error.message }; }
      return { ok: true, offline: false };
    });
  }).catch(function(err) {
    if (esErrorDeRed(err)) return encolarCobroMesa(tableId, mesaLabel, montoACobrar);
    return { ok: false, error: (err && err.message) || 'Error desconocido' };
  });
}

// Fusiona en db.mesas lo que sigue en la cola offline (consumos y cobros aun
// no confirmados por el servidor) para que las cards de Mesas muestren el
// valor a cobrar de inmediato, sin esperar a la sincronizacion.
// Idempotente: se puede llamar varias veces seguidas sin duplicar filas —
// primero se quita cualquier fila/mesa sintetica de una pasada anterior y
// se reconstruye desde lo que hay ahora mismo en la cola.
function aplicarPendientesOffline() {
  // Las filas sinteticas (offline:true, sin equivalente real todavia) se
  // quitan y se reconstruyen enteras. Las filas reales (ya vienen de
  // cargarMesas()) NO se borran — solo se les revierte la marca de "pagado
  // localmente" para volver a evaluarla, evitando perder el objeto (y con
  // el, la marca) si esta funcion se llama dos veces seguidas.
  Object.keys(db.mesas).forEach(function(label) {
    var m = db.mesas[label];
    m.personas = m.personas.filter(function(p) { return !p.offline; });
    m.personas.forEach(function(p) {
      if (p.offlinePago) { p.offlinePago = false; p.pagada = false; }
    });
  });
  return offlineGetAll().then(function(ops) {
    ops = ops.filter(function(o) { return o.status !== 'synced'; });

    // Mesas con un "cobrar todo" pendiente de sincronizar: el cliente ya
    // pago y se fue, se muestran libres. Los consumos encolados ANTES de
    // ese cobro quedan incluidos en el (y no se listan aparte); un consumo
    // encolado DESPUES es una mesa nueva y si se muestra.
    var cobroMesaEnPorTabla = {};
    ops.filter(function(o) { return o.tipo === 'cobrar_mesa'; }).forEach(function(o) {
      if (cobroMesaEnPorTabla[o.tableId] === undefined || o.creadoEn > cobroMesaEnPorTabla[o.tableId]) cobroMesaEnPorTabla[o.tableId] = o.creadoEn;
    });
    Object.keys(cobroMesaEnPorTabla).forEach(function(tableId) {
      var label = db.tableIdToLabel && db.tableIdToLabel[tableId];
      if (label && db.mesas[label]) delete db.mesas[label];
    });

    ops.filter(function(o) { return o.tipo === 'agregar_consumo_mesa'; }).forEach(function(op) {
      var cobroEn = cobroMesaEnPorTabla[op.tableId];
      if (cobroEn !== undefined && op.creadoEn <= cobroEn) return;
      var label = op.mesaLabel;
      if (!db.mesas[label]) db.mesas[label] = { personas: [], tableSessionId: null };
      db.mesas[label].personas.push({
        id: op.id, obligationId: null, valor: op.valor, nota: op.nota || '',
        hora: op.creadoEn, pagada: !!op.cobrarAlSincronizar, fiada: false, clienteId: null, offline: true
      });
    });

    // Cobros individuales sobre comensales que ya existen en el servidor:
    // su fila ya viene de cargarMesas(), solo falta marcarla pagada.
    ops.filter(function(o) { return o.tipo === 'cobrar_persona'; }).forEach(function(op) {
      Object.keys(db.mesas).forEach(function(label) {
        var p = db.mesas[label].personas.find(function(x) { return x.id === op.dinerId; });
        if (p) { p.pagada = true; p.offlinePago = true; }
      });
    });

    Object.keys(db.mesas).forEach(function(label) {
      var m = db.mesas[label];
      if (!m.personas.length && !m.tableSessionId) delete db.mesas[label];
    });
  }).catch(function() {});
}

// Marca una operacion como fallida re-leyendola primero (offlineMutar), para
// no pisar con un objeto viejo en memoria una edicion local que haya
// ocurrido mientras la operacion estaba en vuelo hacia el servidor (ej. el
// cajero la marco para cobrar justo mientras el sync automatico ya la
// habia tomado).
function marcarOpFallida(id, err) {
  return offlineMutar(id, function(op) {
    op.status = 'failed';
    op.error = (err && err.message) || 'Error de sincronización';
    op.intentos = (op.intentos || 0) + 1;
  });
}

function sincronizarConsumoMesa(op) {
  return buscarOAbrirSesion(op.tableId, op.idemAbrir).then(function(sessionId) {
    return sb.rpc('agregar_persona', {
      p_table_session_id: sessionId, p_nombre: op.nombre, p_descriptor: null,
      p_valor: op.valor, p_nota: op.nota, p_idempotency_key: op.idemAgregar
    }).then(function(rp) {
      if (rp.error) throw rp.error;
      if (!op.cobrarAlSincronizar) return offlineDelete(op.id);
      return sb.rpc('cobrar_persona', {
        p_diner_id: rp.data.diner_id, p_tenders: [{method:'efectivo', amount: op.valor}],
        p_idempotency_key: op.cobrarAlSincronizar.idem
      }).then(function(rc) {
        if (rc.error) throw rc.error;
        return offlineDelete(op.id);
      });
    });
  }).then(function() {
    toast('✓ Sincronizado: Mesa ' + op.mesaLabel + ' — ' + cop(op.valor));
    return cargarMesas().then(renderTodo);
  }).catch(function(err) {
    return marcarOpFallida(op.id, err);
  });
}

function sincronizarCobroPersona(op) {
  return sb.rpc('cobrar_persona', {
    p_diner_id: op.dinerId, p_tenders: [{method:'efectivo', amount: op.valor}], p_idempotency_key: op.idem
  }).then(function(r) {
    if (r.error) throw r.error;
    return offlineDelete(op.id);
  }).then(function() {
    toast('✓ Sincronizado: cobro — ' + cop(op.valor));
    cargarCajaActual();
    return cargarMesas().then(renderTodo);
  }).catch(function(err) {
    return marcarOpFallida(op.id, err);
  });
}

function sincronizarCobroMesa(op) {
  return sb.from('table_sessions').select('id').eq('table_id', op.tableId).eq('status', 'OPEN').maybeSingle().then(function(rs) {
    if (rs.error) throw rs.error;
    if (!rs.data || !rs.data.id) throw new Error('No hay sesión abierta para esta mesa');
    var sessionId = rs.data.id;
    var cobroPromise = op.montoACobrar > 0
      ? sb.rpc('cobrar_mesa', { p_table_session_id: sessionId, p_tenders: [{method:'efectivo', amount: op.montoACobrar}], p_idempotency_key: op.idemCobrar })
      : Promise.resolve({ error: null });
    return cobroPromise.then(function(rc) {
      if (rc.error) throw rc.error;
      return sb.rpc('liberar_orden', { p_table_session_id: sessionId, p_confirmar_con_pendiente: false, p_idempotency_key: op.idemLiberar });
    }).then(function(rl) {
      if (rl.error) throw rl.error;
      return offlineDelete(op.id);
    });
  }).then(function() {
    toast('✓ Sincronizado: Mesa ' + op.mesaLabel + ' cobrada');
    cargarCajaActual();
    return cargarMesas().then(renderTodo);
  }).catch(function(err) {
    return marcarOpFallida(op.id, err);
  });
}

function sincronizarOperacion(op) {
  // Re-lee la operacion (atomico) justo antes de procesarla, en vez de
  // confiar en la copia que trae la lista del barrido: puede haber cambiado
  // (ej. se marco "cobrar al sincronizar") desde que sincronizarCola() hizo
  // el getAll() inicial.
  return offlineMutar(op.id, function(o) { o.status = 'syncing'; }).then(function(actual) {
    if (!actual) return;
    if (actual.tipo === 'cobrar_persona') return sincronizarCobroPersona(actual);
    if (actual.tipo === 'cobrar_mesa') return sincronizarCobroMesa(actual);
    if (actual.tipo !== 'agregar_consumo_mesa') return offlineDelete(actual.id);
    return sincronizarConsumoMesa(actual);
  });
}

function sincronizarCola() {
  if (offlineSincronizando || !navigator.onLine) return Promise.resolve();
  offlineSincronizando = true;
  return offlineGetAll().then(function(ops) {
    ops = ops.filter(function(o) { return o.status !== 'synced'; }).sort(function(a, b) { return a.creadoEn - b.creadoEn; });
    return ops.reduce(function(prev, op) { return prev.then(function() { return sincronizarOperacion(op); }); }, Promise.resolve());
  }).then(function() {
    offlineSincronizando = false;
    actualizarBadgeSync();
  }).catch(function() {
    offlineSincronizando = false;
    actualizarBadgeSync();
  });
}

window.addEventListener('online', function() {
  toast('Conexión recuperada — sincronizando…');
  sincronizarCola();
});
window.addEventListener('offline', function() {
  toast('Sin conexión — Mesas sigue funcionando, se sincronizará al volver la señal', 'err');
  actualizarBadgeSync();
});
setInterval(function() { sincronizarCola(); }, 30000);
