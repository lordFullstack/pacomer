// ════════════════════════════════════════════════════════
// LOOP 10 — OFFLINE-FIRST (cola de sincronizacion)
// ════════════════════════════════════════════════════════
// Alcance deliberado: SOLO se pone en cola "agregar consumo a una mesa"
// (abrir_orden + agregar_persona, canal mesa) — el registro de una orden
// no mueve dinero y es seguro de diferir. Ninguna operacion que cobre,
// abra/cierre caja, o mueva saldo de clientes/proveedores se encola:
// esas SIEMPRE requieren conexion en vivo (un cajero nunca debe creer
// que un cobro se hizo si el servidor no lo confirmo). Ver
// docs/context/HANDOFF_LOOP_10.md para el detalle de esta decision.
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

function sincronizarOperacion(op) {
  op.status = 'syncing';
  return offlineUpdate(op).then(function() {
    if (op.tipo !== 'agregar_consumo_mesa') return offlineDelete(op.id);
    return buscarOAbrirSesion(op.tableId, op.idemAbrir).then(function(sessionId) {
      return sb.rpc('agregar_persona', {
        p_table_session_id: sessionId, p_nombre: op.nombre, p_descriptor: null,
        p_valor: op.valor, p_nota: op.nota, p_idempotency_key: op.idemAgregar
      });
    }).then(function(rp) {
      if (rp.error) throw rp.error;
      return offlineDelete(op.id);
    }).then(function() {
      toast('✓ Sincronizado: Mesa ' + op.mesaLabel + ' — ' + cop(op.valor));
      return cargarMesas().then(renderTodo);
    }).catch(function(err) {
      op.status = 'failed';
      op.error = (err && err.message) || 'Error de sincronizacion';
      op.intentos = (op.intentos || 0) + 1;
      return offlineUpdate(op);
    });
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
  toast('Sin conexión — las nuevas órdenes de mesa se guardarán y sincronizarán después', 'err');
  actualizarBadgeSync();
});
setInterval(function() { sincronizarCola(); }, 30000);
