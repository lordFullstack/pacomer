// ════════════════════════════════════════════════════════
// MÓDULO CAJA
// ════════════════════════════════════════════════════════
// db.cajaActual = fila de cash_session_detail (la sesion mas reciente, abierta o no).
// db.cajaMovimientos = cash_movements de esa sesion. db.historialCierres = ultimas 7 cerradas.
function setCajaTab(tab) {
  ui.cajaTab=tab;
  ['apertura','dia','cierre','movimientos'].forEach(function(t){
    document.getElementById('ctab-'+t).classList.toggle('active', t===tab);
    document.getElementById('cview-'+t).classList.toggle('active', t===tab);
  });
  if (tab==='apertura')    renderCajaApertura();
  if (tab==='dia')         renderCajaDia();
  if (tab==='cierre')      renderCajaCierre();
  if (tab==='movimientos') renderMovimientos();
}

function cargarCajaActual() {
  return Promise.all([
    sb.from('cash_session_detail').select('*').order('opened_at',{ascending:false}).limit(1),
    sb.from('cash_sessions').select('id,opening_cash,expected_cash,counted_cash,difference,closed_at').eq('status','CLOSED').order('closed_at',{ascending:false}).limit(7)
  ]).then(function(r){
    if (r[0].error) { sbErr(r[0].error,'cargar caja'); }
    db.cajaActual = (r[0].data && r[0].data[0]) || null;
    db.historialCierres = r[1].data || [];
    return cargarMovimientosCaja();
  });
}

function cargarMovimientosCaja() {
  if (!db.cajaActual) { db.cajaMovimientos = []; return Promise.resolve(); }
  return sb.from('cash_movement_detail').select('type,amount,description,created_at,canal,mesa_label').eq('cash_session_id', db.cajaActual.cash_session_id).order('created_at').then(function(r){
    if (r.error) { sbErr(r.error,'cargar movimientos de caja'); return; }
    db.cajaMovimientos = r.data||[];
  });
}

function renderCajaApertura() {
  var el = document.getElementById('cview-apertura');
  var c = db.cajaActual;
  if (c && c.status !== 'CLOSED') {
    el.innerHTML = '<div class="apertura-center">'+
      '<div class="apertura-icon">'+(c.status==='COUNTING'?'🧮':'✅')+'</div>'+
      '<div class="apertura-confirmada">'+
        '<div class="apertura-conf-val">'+cop(c.opening_cash)+'</div>'+
        '<div class="apertura-conf-label">Caja abierta ('+(c.status==='COUNTING'?'en arqueo':'operando')+')</div>'+
      '</div>'+
    '</div>';
  } else {
    el.innerHTML = '<div class="apertura-center">'+
      '<div class="apertura-icon">💵</div>'+
      '<div class="apertura-title">¿Con cuánto abre la caja?</div>'+
      '<div class="apertura-sub">Registra el efectivo inicial antes de empezar</div>'+
      '<input class="apertura-inp" id="ap-inp" placeholder="Ej: $300.000" type="text" inputmode="numeric" oninput="fmtAp(this)">'+
      '<button class="btn btn-accent" style="min-width:280px;padding:14px;font-size:16px;font-family:\'Space Grotesk\',sans-serif;font-weight:700" onclick="guardarApertura()">Confirmar apertura</button>'+
    '</div>';
  }
}

function fmtAp(inp) { fmtInp(inp, numFmt(inp.value)); }

function guardarApertura() {
  var inp = document.getElementById('ap-inp');
  var val = numFmt(inp?inp.value:'');
  if (!val) { toast('Ingresa el valor de apertura','err'); return; }
  sb.rpc('abrir_caja', { p_opening_cash: val, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Apertura registrada — '+cop(val));
    cargarCajaActual().then(renderCajaApertura);
  });
}

function renderCajaDia() {
  var el = document.getElementById('cview-dia');
  var c = db.cajaActual;
  if (!c) { el.innerHTML = '<div class="empty"><div class="empty-icon">💵</div><div class="empty-title">Abre la caja primero</div></div>'; return; }
  var movs = db.cajaMovimientos||[];
  function sumTipo(t){ return movs.filter(function(m){return m.type===t;}).reduce(function(s,m){return s+Number(m.amount);},0); }
  var ventas=sumTipo('SALE'), abonos=sumTipo('ABONO'), gastos=-sumTipo('GASTO'), pagosProv=-sumTipo('SUPPLIER_PAYMENT');
  var gastosItems = movs.filter(function(m){return m.type==='GASTO';});
  el.innerHTML =
    '<div class="dia-hero">'+
      '<div class="dia-hero-item"><div class="dia-hero-val" style="color:var(--green)">'+cop(c.ingresos)+'</div><div class="dia-hero-label">Ingresos</div></div>'+
      '<div class="dia-hero-item"><div class="dia-hero-val" style="color:var(--red)">'+cop(Math.abs(c.egresos))+'</div><div class="dia-hero-label">Egresos</div></div>'+
      '<div class="dia-hero-item"><div class="dia-hero-val" style="color:var(--accent)">'+cop(c.esperado_actual)+'</div><div class="dia-hero-label">Esperado ahora</div></div>'+
    '</div>'+
    '<div class="saldo-box">'+
      '<div class="saldo-box-left"><div class="saldo-box-label">Efectivo esperado en caja</div><div class="saldo-box-sub">'+cop(c.opening_cash)+' base + '+cop(c.ingresos)+' ing − '+cop(Math.abs(c.egresos))+' eg</div></div>'+
      '<div class="saldo-box-val">'+cop(c.esperado_actual)+'</div>'+
    '</div>'+
    '<div class="dia-grid">'+
      '<div class="card"><div class="card-title">📈 Ingresos (efectivo)</div>'+
        '<div class="kv"><span class="kv-label">Ventas</span><span class="kv-val" style="color:var(--green)">'+cop(ventas)+'</span></div>'+
        '<div class="kv"><span class="kv-label">Abonos crédito</span><span class="kv-val" style="color:var(--green)">'+cop(abonos)+'</span></div>'+
      '</div>'+
      '<div class="card"><div class="card-title">📉 Egresos (efectivo)</div>'+
        '<div class="kv"><span class="kv-label">Gastos manuales</span><span class="kv-val" style="color:var(--red)">'+cop(gastos)+'</span></div>'+
        '<div class="kv"><span class="kv-label">Pagos a proveedores</span><span class="kv-val" style="color:var(--red)">'+cop(pagosProv)+'</span></div>'+
      '</div>'+
    '</div>'+
    '<div class="gasto-manual-box">'+
      '<div class="gasto-manual-title">+ Gasto manual</div>'+
      '<div class="gasto-inp-row">'+
        '<input class="gasto-desc-inp" id="g-desc" placeholder="¿En qué se gastó?" type="text">'+
        '<input class="gasto-val-inp" id="g-val" placeholder="$0" type="text" inputmode="numeric" oninput="fmtGastoVal(this)">'+
        '<button class="btn btn-red-ghost" onclick="agregarGasto()">+ Registrar</button>'+
      '</div>'+
      '<div class="gastos-lista">'+
        (gastosItems.length ? gastosItems.map(function(g){
          return '<div class="gasto-item">'+
            '<div><span style="font-size:13px">'+(g.description||'Gasto')+'</span></div>'+
            '<div class="gasto-item-val">'+cop(Math.abs(g.amount))+'</div></div>';
        }).join('') : '')+
      '</div>'+
    '</div>';
}

function fmtGastoVal(inp) { fmtInp(inp, numFmt(inp.value)); }

function agregarGasto() {
  var desc = document.getElementById('g-desc').value.trim();
  var val  = numFmt(document.getElementById('g-val').value);
  if (!desc) { toast('Escribe en qué se gastó','err'); return; }
  if (!val)  { toast('Ingresa el valor','err'); return; }
  sb.rpc('registrar_gasto', { p_amount: val, p_description: desc, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Gasto registrado — '+cop(val));
    cargarCajaActual().then(renderCajaDia);
  });
}

function renderCajaCierre() {
  var el = document.getElementById('cview-cierre');
  var c = db.cajaActual;
  var histCierres = renderHistCierres();
  if (!c) { el.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Abre la caja primero</div></div>'+histCierres; return; }

  if (c.status === 'CLOSED') {
    var diff = Number(c.difference);
    el.innerHTML = '<div class="cierre-wrap">'+
      '<div class="cerrado-banner"><div class="cerrado-icon">✅</div>'+
        '<div class="cerrado-title">Caja cerrada</div>'+
        '<div class="cerrado-sub">'+new Date(c.closed_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})+'</div>'+
      '</div>'+
      '<div class="cierre-resumen">'+
        '<div class="cr-row"><span class="cr-label">Ingresos</span><span class="cr-val" style="color:var(--green)">'+cop(c.ingresos)+'</span></div>'+
        '<div class="cr-row"><span class="cr-label">Egresos</span><span class="cr-val" style="color:var(--red)">'+cop(Math.abs(c.egresos))+'</span></div>'+
        '<div class="cr-row"><span class="cr-label">Esperado</span><span class="cr-val" style="color:var(--accent)">'+cop(c.expected_cash)+'</span></div>'+
        '<div class="cr-row"><span class="cr-label">Real contado</span><span class="cr-val" style="color:var(--green)">'+cop(c.counted_cash)+'</span></div>'+
        '<div class="cr-row"><span class="cr-label" style="font-weight:600">Diferencia</span><span class="cr-val" style="color:'+(diff>=0?'var(--green)':'var(--red)')+'">'+(diff>=0?'+':'')+cop(diff)+'</span></div>'+
      '</div>'+
      histCierres+
    '</div>';
  } else if (c.status === 'COUNTING') {
    el.innerHTML = '<div class="cierre-wrap">'+
      '<div class="cierre-resumen">'+
        '<div class="cr-row"><span class="cr-label">Base apertura</span><span class="cr-val">'+cop(c.opening_cash)+'</span></div>'+
        '<div class="cr-row"><span class="cr-label">+ Ingresos</span><span class="cr-val" style="color:var(--green)">'+cop(c.ingresos)+'</span></div>'+
        '<div class="cr-row"><span class="cr-label">− Egresos</span><span class="cr-val" style="color:var(--red)">'+cop(Math.abs(c.egresos))+'</span></div>'+
      '</div>'+
      '<div class="esperado-box">'+
        '<div class="esperado-label">Efectivo esperado en caja</div>'+
        '<div class="esperado-val">'+cop(c.esperado_actual)+'</div>'+
      '</div>'+
      '<div class="real-box">'+
        '<div class="real-label">¿Cuánto hay físicamente en caja?</div>'+
        '<input class="real-inp" id="real-inp" placeholder="Cuenta el efectivo" type="text" inputmode="numeric" oninput="fmtReal(this)">'+
        '<div class="diff-box" id="diff-box" style="display:none">'+
          '<span class="diff-label">Diferencia</span>'+
          '<span class="diff-val" id="diff-val">$0</span>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-accent btn-full" onclick="cerrarCaja()">🔒 Cerrar caja del día</button>'+
      histCierres+
    '</div>';
  } else {
    el.innerHTML = '<div class="cierre-wrap">'+
      '<div class="esperado-box">'+
        '<div class="esperado-label">Efectivo esperado en caja</div>'+
        '<div class="esperado-val">'+cop(c.esperado_actual)+'</div>'+
      '</div>'+
      '<button class="btn btn-accent btn-full" onclick="iniciarArqueoCaja()">🧮 Iniciar arqueo</button>'+
      histCierres+
    '</div>';
  }
}

function iniciarArqueoCaja() {
  sb.rpc('iniciar_arqueo', { p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Arqueo iniciado — cuenta el efectivo');
    cargarCajaActual().then(renderCajaCierre);
  });
}

function fmtReal(inp) {
  fmtInp(inp, numFmt(inp.value));
  var c = db.cajaActual;
  if (!c) return;
  var real = numFmt(inp.value);
  var box=document.getElementById('diff-box');
  var val=document.getElementById('diff-val');
  if (box && real>0) {
    var diff=real-c.esperado_actual;
    box.style.display='flex';
    box.style.background=diff===0?'var(--g-dim)':diff>0?'var(--b-dim)':'var(--r-dim)';
    val.textContent=(diff>=0?'+':'')+cop(diff);
    val.style.color=diff===0?'var(--green)':diff>0?'var(--blue)':'var(--red)';
  } else if(box) box.style.display='none';
}

function cerrarCaja() {
  var inp=document.getElementById('real-inp');
  var real=numFmt(inp?inp.value:'');
  if (!real) { toast('Ingresa el efectivo real','err'); return; }
  sb.rpc('cerrar_caja', { p_counted_cash: real, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    var diff = Number(r.data.difference);
    toast('Caja cerrada ✓  Diferencia: '+(diff>=0?'+':'')+cop(diff));
    cargarCajaActual().then(renderCajaCierre);
  });
}

function renderHistCierres() {
  var cierres = db.historialCierres||[];
  if (!cierres.length) return '';
  return '<div>'+
    '<div class="lbl" style="margin-top:4px">Cierres anteriores</div>'+
    '<div style="display:flex;flex-direction:column;gap:7px">'+
    cierres.map(function(c){
      var diff = Number(c.difference);
      return '<div class="hist-cierre-item">'+
        '<div><div class="hci-fecha">'+new Date(c.closed_at).toLocaleDateString('es-CO')+'</div><div class="hci-hora">'+new Date(c.closed_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})+'</div></div>'+
        '<div class="hci-vals">'+
          '<div class="hci-val"><div class="hci-num" style="color:var(--accent)">'+cop(c.expected_cash)+'</div><div class="hci-lbl">Esperado</div></div>'+
          '<div class="hci-val"><div class="hci-num" style="color:var(--green)">'+cop(c.counted_cash)+'</div><div class="hci-lbl">Real</div></div>'+
          '<div class="hci-val"><div class="hci-num" style="color:'+(diff>=0?'var(--green)':'var(--red)')+'">'+(diff>=0?'+':'')+cop(diff)+'</div><div class="hci-lbl">Diferencia</div></div>'+
        '</div>'+
      '</div>';
    }).join('')+
    '</div></div>';
}
