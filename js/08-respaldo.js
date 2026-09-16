// ════════════════════════════════════════════════════════
// LOOP 12 — RESPALDO Y RECUPERACIÓN
// ════════════════════════════════════════════════════════
// Exportación: trae los datos reales del servidor (tenant actual), no
// una copia de lo que está cargado en pantalla. Excluye credenciales
// (auth.users/auth.identities no son alcanzables desde el cliente; de
// app_users solo se exportan columnas no sensibles, sin auth_user_id).
//
// Restauración: alcance acordado explícitamente con el usuario — SOLO
// datos de referencia (clientes, proveedores, configuración del
// negocio). Nunca se restaura historial financiero (mesas, pagos,
// caja, obligaciones) desde un archivo — demasiado riesgo de corromper
// dinero real con un archivo inconsistente. La restauración reutiliza
// las RPC ya existentes y validadas (crear_cliente/crear_proveedor/
// actualizar_config) en vez de escribir directo a las tablas, así que
// queda auditada gratis además del marcador propio de restauración.
var RESPALDO_TABLAS = {
  app_users: 'id,nombre,role,activo',
  tables: '*',
  table_sessions: '*',
  diners: '*',
  consumptions: '*',
  payment_obligations: '*',
  payments: '*',
  tenders: '*',
  payment_allocations: '*',
  changes: '*',
  cash_sessions: '*',
  cash_movements: '*',
  customers: '*',
  customer_credits: '*',
  credit_repayments: '*',
  credit_repayment_tenders: '*',
  credit_repayment_allocations: '*',
  credit_repayment_change: '*',
  suppliers: '*',
  purchases: '*',
  supplier_payments: '*',
  supplier_payment_tenders: '*',
  supplier_payment_allocations: '*',
  app_config: '*',
  receipts: '*',
  receipt_counters: '*',
  audit_events: '*'
};

function exportarRespaldo(silencioso) {
  var nombres = Object.keys(RESPALDO_TABLAS);
  if (!silencioso) toast('Generando respaldo…');
  return Promise.all(nombres.map(function(t) { return sb.from(t).select(RESPALDO_TABLAS[t]); })).then(function(resultados) {
    var data = {
      tipo: 'pacomer_respaldo', version: 1, tenant_id: PACOMER_TENANT_ID,
      exportado_en: new Date().toISOString(),
      exportado_por: db.usuarioActivo ? db.usuarioActivo.nombre : null,
      tablas: {}
    };
    var huboError = false;
    resultados.forEach(function(r, i) {
      var t = nombres[i];
      if (r.error) { huboError = true; sbErr(r.error, 'respaldo: ' + t); data.tablas[t] = []; return; }
      data.tablas[t] = r.data || [];
    });
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var fecha = fechaHoy();
    var a = document.createElement('a');
    a.href = url; a.download = 'pacomer-respaldo-' + fecha + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    if (!silencioso) toast(huboError ? 'Respaldo descargado con advertencias — revisa la consola' : 'Respaldo descargado — pacomer-respaldo-' + fecha + '.json', huboError ? 'err' : 'ok');
    return data;
  });
}

// ── Restauración (solo referencia: clientes, proveedores, config) ──
var restoreArchivo = null;

function seleccionarArchivoRespaldo(input) {
  var file = input.files[0];
  input.value = '';
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var data;
    try { data = JSON.parse(e.target.result); }
    catch (err) { toast('El archivo no es un JSON válido', 'err'); return; }
    var error = validarRespaldo(data);
    if (error) { toast(error, 'err'); return; }
    restoreArchivo = data;
    renderPreviewRestauracion();
  };
  reader.onerror = function() { toast('No se pudo leer el archivo', 'err'); };
  reader.readAsText(file);
}

// Valida TODA la estructura antes de tocar cualquier dato — un
// respaldo corrupto o de otro tenant se rechaza por completo, nada
// se escribe.
function validarRespaldo(data) {
  if (!data || typeof data !== 'object') return 'Archivo de respaldo inválido';
  if (data.tipo !== 'pacomer_respaldo') return 'Este archivo no es un respaldo de Pa\' Comer POS';
  if (!data.tenant_id) return 'El respaldo no indica a qué negocio pertenece';
  if (data.tenant_id !== PACOMER_TENANT_ID) return 'Este respaldo es de otro negocio — no se puede restaurar aquí';
  if (!data.tablas || typeof data.tablas !== 'object') return 'El respaldo no tiene datos de tablas';
  var clientes = data.tablas.customers || [];
  var proveedores = data.tablas.suppliers || [];
  if (!Array.isArray(clientes) || !Array.isArray(proveedores)) return 'El respaldo tiene un formato inválido en clientes/proveedores';
  for (var i = 0; i < clientes.length; i++) {
    if (!clientes[i] || typeof clientes[i].name !== 'string' || !clientes[i].name.trim()) return 'Hay un cliente sin nombre en el respaldo (fila ' + (i + 1) + ') — archivo rechazado';
  }
  for (var j = 0; j < proveedores.length; j++) {
    if (!proveedores[j] || typeof proveedores[j].name !== 'string' || !proveedores[j].name.trim()) return 'Hay un proveedor sin nombre en el respaldo (fila ' + (j + 1) + ') — archivo rechazado';
  }
  return null;
}

function renderPreviewRestauracion() {
  var el = document.getElementById('restore-preview');
  if (!el || !restoreArchivo) return;
  var clientesArchivo = restoreArchivo.tablas.customers || [];
  var proveedoresArchivo = restoreArchivo.tablas.suppliers || [];
  var configArchivo = (restoreArchivo.tablas.app_config || []).find(function(c) { return c.key === 'negocio'; });

  var nombresClientesActuales = (db.clientes || []).map(function(c) { return c.nombre.trim().toLowerCase(); });
  var nombresProveedoresActuales = (db.proveedores || []).map(function(p) { return p.nombre.trim().toLowerCase(); });
  var clientesNuevos = clientesArchivo.filter(function(c) { return nombresClientesActuales.indexOf(c.name.trim().toLowerCase()) === -1; });
  var proveedoresNuevos = proveedoresArchivo.filter(function(p) { return nombresProveedoresActuales.indexOf(p.name.trim().toLowerCase()) === -1; });

  el.innerHTML =
    '<div class="card" style="border-color:var(--accent);border-style:solid;margin-top:10px">' +
      '<div class="card-title">👁️ Vista previa de la restauración</div>' +
      '<div style="font-size:12px;color:var(--t2);margin-bottom:10px">Exportado: ' + fechaCorta(new Date(restoreArchivo.exportado_en).getTime()) + (restoreArchivo.exportado_por ? ' por ' + restoreArchivo.exportado_por : '') + '</div>' +
      '<div class="kv"><span class="kv-label">Clientes en el archivo</span><span class="kv-val">' + clientesArchivo.length + '</span></div>' +
      '<div class="kv"><span class="kv-label">→ se crearán (no existen hoy)</span><span class="kv-val" style="color:var(--green)">' + clientesNuevos.length + '</span></div>' +
      '<div class="kv"><span class="kv-label">→ se omiten (ya existen por nombre)</span><span class="kv-val" style="color:var(--t3)">' + (clientesArchivo.length - clientesNuevos.length) + '</span></div>' +
      '<div class="kv"><span class="kv-label">Proveedores en el archivo</span><span class="kv-val">' + proveedoresArchivo.length + '</span></div>' +
      '<div class="kv"><span class="kv-label">→ se crearán (no existen hoy)</span><span class="kv-val" style="color:var(--green)">' + proveedoresNuevos.length + '</span></div>' +
      '<div class="kv"><span class="kv-label">→ se omiten (ya existen por nombre)</span><span class="kv-val" style="color:var(--t3)">' + (proveedoresArchivo.length - proveedoresNuevos.length) + '</span></div>' +
      '<div class="kv"><span class="kv-label">Configuración del negocio</span><span class="kv-val">' + (configArchivo ? 'Se sobrescribirá' : 'No incluida') + '</span></div>' +
      '<div style="font-size:11px;color:var(--t3);margin:10px 0">Nunca se toca el historial financiero (mesas, pagos, caja) desde una restauración — solo clientes, proveedores y configuración.</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-accent" onclick="confirmarRestauracion()">Confirmar restauración</button>' +
        '<button class="btn btn-ghost" onclick="cancelarRestauracion()">Cancelar</button>' +
      '</div>' +
    '</div>';
}

function cancelarRestauracion() {
  restoreArchivo = null;
  var el = document.getElementById('restore-preview');
  if (el) el.innerHTML = '';
}

function confirmarRestauracion() {
  if (!restoreArchivo) return;
  var clientesArchivo = restoreArchivo.tablas.customers || [];
  var proveedoresArchivo = restoreArchivo.tablas.suppliers || [];
  var configArchivo = (restoreArchivo.tablas.app_config || []).find(function(c) { return c.key === 'negocio'; });

  var nombresClientesActuales = (db.clientes || []).map(function(c) { return c.nombre.trim().toLowerCase(); });
  var nombresProveedoresActuales = (db.proveedores || []).map(function(p) { return p.nombre.trim().toLowerCase(); });
  var clientesNuevos = clientesArchivo.filter(function(c) { return nombresClientesActuales.indexOf(c.name.trim().toLowerCase()) === -1; });
  var proveedoresNuevos = proveedoresArchivo.filter(function(p) { return nombresProveedoresActuales.indexOf(p.name.trim().toLowerCase()) === -1; });

  toast('Restaurando…');
  var creados = { clientes: 0, proveedores: 0, config: false, errores: 0 };

  var cadena = clientesNuevos.reduce(function(prev, c) {
    return prev.then(function() {
      return sb.rpc('crear_cliente', { p_nombre: c.name, p_telefono: c.phone || '', p_nota: c.notes || '', p_idempotency_key: uid() }).then(function(r) {
        if (r.error) { creados.errores++; console.warn('restaurar cliente', c.name, r.error); } else { creados.clientes++; }
      });
    });
  }, Promise.resolve());

  cadena = proveedoresNuevos.reduce(function(prev, p) {
    return prev.then(function() {
      return sb.rpc('crear_proveedor', { p_nombre: p.name, p_telefono: p.phone || '', p_categoria: p.category || '', p_nota: p.notes || '', p_payment_terms: 'contado', p_idempotency_key: uid() }).then(function(r) {
        if (r.error) { creados.errores++; console.warn('restaurar proveedor', p.name, r.error); } else { creados.proveedores++; }
      });
    });
  }, cadena);

  if (configArchivo && configArchivo.value) {
    var v = configArchivo.value;
    cadena = cadena.then(function() {
      return sb.rpc('actualizar_config', {
        p_valores: {
          nombre_negocio: v.nombre_negocio || "Pa' Comer", direccion: v.direccion || '', cedula: v.cedula || '',
          ciudad: v.ciudad || '', departamento: v.departamento || '', servicio: v.servicio || '', logo_url: v.logo_url || ''
        },
        p_idempotency_key: uid()
      }).then(function(r) {
        if (r.error) { creados.errores++; console.warn('restaurar config', r.error); } else { creados.config = true; }
      });
    });
  }

  cadena.then(function() {
    return sb.rpc('registrar_evento_restauracion', { p_resumen: creados });
  }).then(function() {
    toast('Restauración completa — ' + creados.clientes + ' clientes, ' + creados.proveedores + ' proveedores' + (creados.config ? ', config actualizada' : '') + (creados.errores ? (' — ' + creados.errores + ' con error') : ''), creados.errores ? 'err' : 'ok');
    restoreArchivo = null;
    document.getElementById('restore-preview').innerHTML = '';
    cargarClientes();
    cargarProveedores();
    cargarConfigNegocio();
  });
}

function renderMovimientos() {
  var el = document.getElementById('cview-movimientos');
  var movs = db.cajaMovimientos||[];
  var labelPorTipo = {SALE:'Venta', ABONO:'Abono crédito', SUPPLIER_PAYMENT:'Pago a proveedor', ADJUSTMENT:'Ajuste', REVERSAL:'Reversión'};
  var labelPorCanal = {mesa:'Mesa', llevar:'Para llevar', domicilio:'Domicilio'};
  function labelVenta(m) {
    if (!m.canal) return 'Venta';
    if (m.canal==='mesa') return 'Venta — '+(m.mesa_label?('Mesa '+m.mesa_label):'Mesa');
    return 'Venta — '+(labelPorCanal[m.canal]||m.canal);
  }
  var items = movs.map(function(m){
    var esIngreso = Number(m.amount) >= 0;
    return {
      ts: new Date(m.created_at).getTime(),
      tipo: esIngreso?'ingreso':'egreso',
      label: m.type==='GASTO' ? (m.description||'Gasto') : m.type==='SALE' ? labelVenta(m) : (labelPorTipo[m.type]||m.type),
      valor: Math.abs(Number(m.amount)),
      badge: esIngreso?'badge-green':'badge-red',
      badgeLabel: esIngreso?'Ingreso':'Egreso'
    };
  }).sort(function(a,b){ return b.ts-a.ts; });

  var ingTotal  = items.filter(function(i){return i.tipo==='ingreso';}).reduce(function(s,i){return s+i.valor;},0);
  var egTotal   = items.filter(function(i){return i.tipo==='egreso';}).reduce(function(s,i){return s+i.valor;},0);

  el.innerHTML =
    '<div class="page-wrap">'+

    // Resumen rápido
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
      '<div class="sstrip-item"><div class="sstrip-val" style="color:var(--green)">'+cop(ingTotal)+'</div><div class="sstrip-label">Ingresos</div></div>'+
      '<div class="sstrip-item"><div class="sstrip-val" style="color:var(--red)">'+cop(egTotal)+'</div><div class="sstrip-label">Egresos</div></div>'+
      '<div class="sstrip-item"><div class="sstrip-val" style="color:var(--accent)">'+items.length+'</div><div class="sstrip-label">Movimientos</div></div>'+
    '</div>'+

    // Lista
    (items.length ?
      items.map(function(item){
        var colorVal = item.tipo==='ingreso'?'var(--green)':'var(--red)';
        var signo    = item.tipo==='ingreso'?'+':'-';
        return '<div class="pago-item" style="background:var(--s1);border:1px solid var(--border);border-radius:var(--r-sm)">'+
          '<div>'+
            '<div class="pago-item-desc">'+item.label+'</div>'+
            '<div class="pago-item-meta">'+
              '<span class="badge '+item.badge+'">'+item.badgeLabel+'</span>'+
              '<span class="pago-item-fecha">'+new Date(item.ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})+'</span>'+
            '</div>'+
          '</div>'+
          '<div class="pago-item-val" style="color:'+colorVal+'">'+signo+cop(item.valor)+'</div>'+
        '</div>';
      }).join('') :
      '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Sin movimientos en esta caja</div><div>Los movimientos aparecen aquí al registrar ventas, pagos y gastos</div></div>'
    )+

    // Respaldo
    '<div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:10px">'+
      '<div class="lbl" style="margin:0">Respaldo de datos</div>'+
      '<div style="font-size:12px;color:var(--t2)">Exporta todos los datos operativos reales del negocio (sin credenciales). Restaurar clientes/proveedores/config está en Configuración.</div>'+
      '<button class="btn btn-accent" onclick="exportarRespaldo(false)">Exportar respaldo</button>'+
    '</div>'+

    '</div>';
}
