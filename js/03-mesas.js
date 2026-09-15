// ════════════════════════════════════════════════════════
// MÓDULO MESAS (pantalla protegida — ver docs/context/LOOP_CONTEXT.md)
// ════════════════════════════════════════════════════════
function totalMesa(n) {
  return (db.mesas[n]||{personas:[]}).personas.reduce(function(s,p){return s+p.valor;},0);
}
function pendienteMesa(n) {
  return (db.mesas[n]||{personas:[]}).personas.filter(function(p){return !p.pagada&&!p.fiada;}).reduce(function(s,p){return s+p.valor;},0);
}

// db.mesas[n] = {personas:[{id(=diner_id), obligationId, valor, nota, hora, pagada, fiada, clienteId}], tableSessionId}
// Se mantiene la misma forma que el modelo legacy para no tocar renderGrid/renderMesaModal/etc.
function cargarMesas() {
  return sb.from('tables').select('id,label').then(function(rt){
    if (rt.error) { sbErr(rt.error,'cargar mesas'); return; }
    db.tablesByLabel = {}; db.tableIdToLabel = {};
    (rt.data||[]).forEach(function(t){ db.tablesByLabel[t.label]=t.id; db.tableIdToLabel[t.id]=t.label; });

    return sb.from('table_sessions').select('id,table_id').eq('channel','mesa').eq('status','OPEN').then(function(rs){
      if (rs.error) { sbErr(rs.error,'cargar sesiones de mesa'); return; }
      var sessions = rs.data||[];
      db.mesaSessionByNum = {};
      sessions.forEach(function(s){
        var label = db.tableIdToLabel[s.table_id];
        if (label) db.mesaSessionByNum[label] = s.id;
      });

      return sb.from('diners').select('id,name,table_session_id,created_at').in('table_session_id', sessions.length?sessions.map(function(s){return s.id;}):['00000000-0000-0000-0000-000000000000']).then(function(rd){
        if (rd.error) { sbErr(rd.error,'cargar comensales'); return; }
        var diners = rd.data||[];
        var dinerIds = diners.map(function(d){return d.id;});
        if (!dinerIds.length) { db.mesas = {}; return; }

        return Promise.all([
          sb.from('consumptions').select('id,diner_id,amount,notes').in('diner_id', dinerIds),
          sb.from('payment_obligations').select('id,diner_id,amount,status').in('diner_id', dinerIds)
        ]).then(function(r2){
          var consumptions = r2[0].data||[];
          var obligations = r2[1].data||[];
          var creditObligationIds = obligations.filter(function(o){return o.status==='CREDIT';}).map(function(o){return o.id;});
          var creditsPromise = creditObligationIds.length
            ? sb.from('customer_credits').select('obligation_id,customer_id').in('obligation_id', creditObligationIds)
            : Promise.resolve({data:[]});
          return creditsPromise.then(function(rc){
            var clientePorObligacion = {};
            (rc.data||[]).forEach(function(c){ clientePorObligacion[c.obligation_id]=c.customer_id; });

            var mesasNuevo = {};
            sessions.forEach(function(s){
              var label = db.tableIdToLabel[s.table_id];
              if (!label) return;
              var dinersSesion = diners.filter(function(d){return d.table_session_id===s.id;});
              if (!dinersSesion.length) return;
              var personas = dinersSesion.map(function(d){
                var cons = consumptions.find(function(c){return c.diner_id===d.id;});
                var ob = obligations.find(function(o){return o.diner_id===d.id;});
                return {
                  id: d.id,
                  obligationId: ob?ob.id:null,
                  valor: cons?Number(cons.amount):(ob?Number(ob.amount):0),
                  nota: cons?(cons.notes||''):'',
                  hora: new Date(d.created_at).getTime(),
                  pagada: ob?ob.status==='PAID':false,
                  fiada: ob?ob.status==='CREDIT':false,
                  clienteId: ob?(clientePorObligacion[ob.id]||null):null
                };
              });
              mesasNuevo[label] = {personas: personas, tableSessionId: s.id};
            });
            db.mesas = mesasNuevo;
          });
        });
      });
    });
  });
}

// Ordenes "para llevar"/"domicilio" de las ultimas 24h, solo para los contadores del header.
function cargarOrdenesRecientes() {
  var desde = new Date(Date.now()-86400000).toISOString();
  return sb.from('table_sessions').select('id,channel,opened_at').in('channel',['llevar','domicilio']).gte('opened_at',desde).then(function(rs){
    if (rs.error) { sbErr(rs.error,'cargar ordenes recientes'); return; }
    var sessions = rs.data||[];
    db.llevar = sessions.filter(function(s){return s.channel==='llevar';}).map(function(s){ return {id:s.id, hora:new Date(s.opened_at).getTime()}; });
    db.domicilios = sessions.filter(function(s){return s.channel==='domicilio';}).map(function(s){ return {id:s.id, hora:new Date(s.opened_at).getTime()}; });
  });
}

function filtrar(f, btn) {
  ui.filtro = f;
  document.querySelectorAll('.ftab').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  renderGrid();
}

function renderGrid() {
  var g = document.getElementById('mesas-grid');
  g.innerHTML = '';
  for (var i=1; i<=MESAS; i++) {
    var m = db.mesas[i];
    var ocu = !!m;
    if (ui.filtro==='ocupadas' && !ocu) continue;
    if (ui.filtro==='libres'   &&  ocu) continue;
    var card = document.createElement('div');
    card.className = 'mesa-card ' + (ocu?'ocu':'libre');
    var num = i;
    card.onclick = (function(n,o){ return function(){ o ? openMesaModal(n) : selMesa(n); }; })(i, ocu);
    if (ocu) {
      var tot = totalMesa(i);
      var np  = m.personas.length;
      var res = m.personas.filter(function(p){return p.pagada||p.fiada;}).length;
      var pHora = Math.min.apply(null, m.personas.map(function(p){return p.hora;}));
      card.innerHTML = '<div><div class="mesa-n">'+i+'</div><div class="mesa-lbl">Mesa</div></div>' +
        '<div><div class="mesa-val">'+cop(tot)+'</div>' +
        '<div class="mesa-meta">👥 '+np+' persona'+(np>1?'s':'')+(res?' · '+res+' lista'+(res>1?'s':''):'')+'</div>' +
        '<div class="mesa-time">'+elapsed(pHora)+'</div></div>';
    } else {
      card.innerHTML = '<div><div class="mesa-n">'+i+'</div><div class="mesa-lbl">Mesa</div></div>' +
        '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--green);font-weight:500"><span class="dot dot-green"></span>Libre</div>';
    }
    g.appendChild(card);
  }
}

function renderMesaSel() {
  var c = document.getElementById('mesa-sel');
  c.innerHTML = '';
  for (var i=1; i<=MESAS; i++) {
    var ocu = !!db.mesas[i];
    var btn = document.createElement('button');
    btn.className = 'ms-btn' + (ocu?' ocu':'') + (ui.regMesa===i?' active':'');
    btn.textContent = i;
    var n = i;
    btn.onclick = (function(num, isOcu){ return function(){
      if (isOcu) { toast('Mesa '+num+' ocupada','err'); return; }
      ui.regMesa = num; renderMesaSel(); updateRegHead();
    };})(i, ocu);
    c.appendChild(btn);
  }
}

function setTipo(tipo) {
  ui.regTipo = tipo; ui.regMesa = null;
  ['mesa','llevar','domicilio'].forEach(function(t){
    document.getElementById('ts-'+t).classList.toggle('active', t===tipo);
  });
  document.getElementById('g-mesa').style.display   = tipo==='mesa'      ? '' : 'none';
  document.getElementById('g-dir').style.display    = tipo==='domicilio'  ? '' : 'none';
  updateRegHead(); renderMesaSel();
}

function initOrden(tipo) { setTipo(tipo); }
function selMesa(n) { setTipo('mesa'); ui.regMesa=n; renderMesaSel(); updateRegHead(); }

function updateRegHead() {
  var t = document.getElementById('reg-title');
  var s = document.getElementById('reg-sub');
  if (ui.regTipo==='mesa') {
    t.textContent = ui.regMesa ? 'Mesa '+ui.regMesa : 'Nueva orden — Mesa';
    s.textContent = ui.regMesa ? 'Ingresa el valor' : 'Selecciona la mesa';
  } else if (ui.regTipo==='llevar') {
    t.textContent='Para llevar'; s.textContent='Cobro inmediato';
  } else {
    t.textContent='Domicilio'; s.textContent='Dirección y valor';
  }
}

function registrar() {
  if (ui.regTipo==='mesa' && !ui.regMesa) { toast('Selecciona una mesa','err'); return; }
  if (!ui.regValor || ui.regValor<=0)    { toast('Ingresa el valor','err'); return; }
  var nota = document.getElementById('inp-nota').value.trim();

  if (ui.regTipo==='mesa') {
    var tableId = db.tablesByLabel[String(ui.regMesa)];
    if (!tableId) { toast('Mesa no configurada en el sistema','err'); return; }
    var mesaNumReg = ui.regMesa, valorReg = ui.regValor;
    agregarConsumoMesaConCola(tableId, mesaNumReg, valorReg, null, nota||null).then(function(r){
      if (!r.ok) { toast('Error: '+r.error,'err'); return; }
      if (r.offline) {
        toast('Sin conexión — Mesa '+mesaNumReg+' guardada, se sincronizará automáticamente');
        limpiarReg();
        return;
      }
      toast('Mesa '+mesaNumReg+' — '+cop(valorReg)+' registrado');
      limpiarReg(); cargarMesas().then(renderTodo);
    });
    return;
  }

  if (!db.cajaActual || db.cajaActual.status==='CLOSED') { toast('Abre la caja antes de registrar '+(ui.regTipo==='llevar'?'para llevar':'domicilios'),'err'); return; }
  var dir = ui.regTipo==='domicilio' ? document.getElementById('inp-dir').value.trim() : null;
  sb.rpc('abrir_orden', { p_channel: ui.regTipo, p_table_id: null, p_idempotency_key: uid() }).then(function(ra){
    if (ra.error) { toast('Error: '+ra.error.message,'err'); return; }
    sb.rpc('agregar_persona', { p_table_session_id: ra.data.table_session_id, p_nombre: null, p_descriptor: dir, p_valor: ui.regValor, p_nota: nota||null, p_idempotency_key: uid() }).then(function(rp){
      if (rp.error) { toast('Error: '+rp.error.message,'err'); return; }
      sb.rpc('cobrar_persona', { p_diner_id: rp.data.diner_id, p_tenders: [{method:'efectivo', amount: ui.regValor}], p_idempotency_key: uid() }).then(function(rc){
        if (rc.error) { toast('Error: '+rc.error.message,'err'); return; }
        toast((ui.regTipo==='llevar'?'Para llevar':'Domicilio')+' — '+cop(ui.regValor));
        limpiarReg(); cargarOrdenesRecientes().then(renderStats); cargarCajaActual();
      });
    });
  });
}

function limpiarReg() {
  ui.regValor=0; ui.regMesa=null;
  document.getElementById('inp-val').value='';
  document.getElementById('inp-nota').value='';
  document.getElementById('inp-dir').value='';
  setTipo('mesa');
}

// ── MODAL MESA ──
function openMesaModal(n) {
  ui.modalMesa = n;
  renderMesaModal();
  openOverlay('ov-mesa');
}

function renderMesaModal() {
  var n = ui.modalMesa;
  var m = db.mesas[n];
  if (!m) return;
  var tot = totalMesa(n);
  var pend = pendienteMesa(n);
  var res  = m.personas.filter(function(p){return p.pagada||p.fiada;}).length;
  var pHora = Math.min.apply(null, m.personas.map(function(p){return p.hora;}));
  document.getElementById('mm-title').textContent = 'Mesa '+n;
  document.getElementById('mm-sub').textContent   = m.personas.length+' persona'+(m.personas.length>1?'s':'');
  document.getElementById('mm-time').textContent  = elapsed(pHora);
  document.getElementById('mm-total').textContent = cop(tot);
  document.getElementById('mm-info').textContent  = res>0 ? res+' lista'+(res>1?'s':'')+' · Pendiente '+cop(pend) : 'Todo pendiente';
  var btn = document.getElementById('mm-btn-cobrar');
  btn.textContent = pend===0 ? '✓ Liberar (todo cobrado)' : '💵 Cobrar todo — '+cop(pend);
  btn.style.background = pend===0 ? 'var(--t3)' : '';
  var list = document.getElementById('mm-personas');
  list.innerHTML = '';
  m.personas.forEach(function(p, idx){
    var div = document.createElement('div');
    var resuelta = p.pagada||p.fiada;
    div.className = 'p-row'+(p.fiada?' fiada':p.pagada?' resuelta':'');
    var badge = '';
    if (p.fiada) {
      var cli = db.clientes.find(function(c){return c.id===p.clienteId;});
      badge = '<span class="badge badge-blue">📋 '+(cli?cli.nombre:'Fiado')+'</span>';
    } else if (p.pagada) {
      badge = '<span class="badge badge-green">✓ Pagó</span>';
    } else {
      badge = '<div class="p-actions">'+
        '<button class="btn-cob-p" onclick="cobrarPersona(\''+p.id+'\')">Cobrar</button>'+
        '<button class="btn-fiar-p" onclick="openFiar(\''+p.obligationId+'\','+p.valor+',\'Persona #'+(idx+1)+' mesa '+n+'\')">Fiar</button>'+
        '<button class="btn-edit-p" onclick="editarValorPersona(\''+p.obligationId+'\')" title="Corregir valor">✏️</button>'+
        '</div>';
    }
    div.innerHTML = '<div class="p-num">#'+(idx+1)+'</div>'+
      '<div class="p-info"><div class="p-val" id="pval-'+p.id+'">'+cop(p.valor)+'</div>'+
      (p.nota?'<div class="p-nota">'+p.nota+'</div>':'')+
      '<div class="p-time">'+elapsed(p.hora)+'</div></div>'+
      badge;
    list.appendChild(div);
  });
  document.getElementById('add-p-val').value='';
  document.getElementById('add-p-nota').value='';
}

function cobrarPersona(pid) {
  var mesaNum = ui.modalMesa;
  var m = db.mesas[mesaNum];
  if (!m) return;
  var p = m.personas.find(function(x){return x.id===pid;});
  if (!p||p.pagada||p.fiada) return;
  if (!db.cajaActual || db.cajaActual.status==='CLOSED') { toast('Abre la caja antes de cobrar','err'); return; }
  sb.rpc('cobrar_persona', { p_diner_id: pid, p_tenders: [{method:'efectivo', amount: p.valor}], p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message,'err'); return; }
    toast('Cobrado — '+cop(p.valor));
    cargarMesas().then(function(){
      renderTodo();
      if (ui.modalMesa===mesaNum) renderMesaModal();
    });
    cargarCajaActual();
    mostrarTicket({
      mesa: mesaNum,
      tipo: 'mesa',
      personas: [{valor:p.valor, nota:p.nota, pagada:true}],
      total: p.valor,
      atendidoPor: db.usuarioActivo ? db.usuarioActivo.nombre : ''
    });
  });
}

function editarValorPersona(obligationId) {
  var mesaNum = ui.modalMesa;
  var m = db.mesas[mesaNum];
  if (!m) return;
  var p = m.personas.find(function(x){return x.obligationId===obligationId;});
  if (!p || p.pagada || p.fiada) { toast('Solo se puede corregir mientras está pendiente','err'); return; }
  var valEl = document.getElementById('pval-'+p.id);
  if (!valEl) return;
  var valorActual = p.valor;
  valEl.outerHTML = '<input type="text" class="p-edit-inp" id="pedit-'+p.id+'" value="'+valorActual.toLocaleString('es-CO')+'" inputmode="numeric">';
  var inp = document.getElementById('pedit-'+p.id);
  inp.focus();
  inp.select();
  var guardado = false;
  function guardarEdicion() {
    if (guardado) return;
    var nuevo = numFmt(inp.value);
    if (!nuevo || nuevo<=0) { toast('Valor inválido, sin cambios','err'); renderMesaModal(); return; }
    if (nuevo === valorActual) { renderMesaModal(); return; }
    guardado = true;
    sb.rpc('editar_valor_persona', { p_obligation_id: obligationId, p_nuevo_valor: nuevo, p_idempotency_key: uid() }).then(function(r){
      if (r.error) { toast('Error: '+r.error.message,'err'); renderMesaModal(); return; }
      toast('Valor corregido: '+cop(valorActual)+' → '+cop(nuevo));
      cargarMesas().then(function(){ renderTodo(); if (ui.modalMesa===mesaNum) renderMesaModal(); });
    });
  }
  inp.addEventListener('blur', guardarEdicion);
  inp.addEventListener('keydown', function(e){
    if (e.key==='Enter') guardarEdicion();
    if (e.key==='Escape') renderMesaModal();
  });
}

function cobrarTodo() {
  var m = db.mesas[ui.modalMesa];
  if (!m) return;
  var pend = pendienteMesa(ui.modalMesa);
  var mesaNum = ui.modalMesa;
  var sessionId = m.tableSessionId;
  var personasParaTicket = m.personas;
  if (pend>0 && (!db.cajaActual || db.cajaActual.status==='CLOSED')) { toast('Abre la caja antes de cobrar','err'); return; }
  var cobroPromise = pend>0
    ? sb.rpc('cobrar_mesa', { p_table_session_id: sessionId, p_tenders: [{method:'efectivo', amount: pend}], p_idempotency_key: uid() })
    : Promise.resolve({error:null});
  cobroPromise.then(function(r){
    if (r.error) { toast('Error: '+r.error.message,'err'); return; }
    sb.rpc('liberar_orden', { p_table_session_id: sessionId, p_confirmar_con_pendiente: false, p_idempotency_key: uid() }).then(function(r2){
      if (r2.error) { toast('Error: '+r2.error.message,'err'); return; }
      toast('Mesa '+mesaNum+' cobrada — '+cop(pend));
      closeOverlay('ov-mesa');
      cargarMesas().then(renderTodo);
      cargarCajaActual();
      mostrarTicket({
        mesa: mesaNum,
        tipo: 'mesa',
        personas: personasParaTicket,
        total: pend,
        atendidoPor: db.usuarioActivo ? db.usuarioActivo.nombre : ''
      });
    });
  });
}

function liberarMesa() {
  var mesaNum = ui.modalMesa;
  var m = db.mesas[mesaNum];
  if (!m) return;
  var sessionId = m.tableSessionId;
  sb.rpc('liberar_orden', { p_table_session_id: sessionId, p_confirmar_con_pendiente: true, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message,'err'); return; }
    toast('Mesa '+mesaNum+' liberada');
    closeOverlay('ov-mesa');
    cargarMesas().then(renderTodo);
  });
}

function addPersona() {
  var val = numFmt(document.getElementById('add-p-val').value);
  if (!val) { toast('Ingresa el valor','err'); return; }
  var nota = document.getElementById('add-p-nota').value.trim();
  var mesaNum = ui.modalMesa;
  var m = db.mesas[mesaNum];
  if (!m) return;
  sb.rpc('agregar_persona', { p_table_session_id: m.tableSessionId, p_nombre: null, p_descriptor: null, p_valor: val, p_nota: nota||null, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message,'err'); return; }
    toast('Persona agregada — '+cop(val));
    cargarMesas().then(function(){ renderTodo(); if (ui.modalMesa===mesaNum) renderMesaModal(); });
  });
}

document.getElementById('add-p-val').addEventListener('keydown',function(e){if(e.key==='Enter')addPersona();});

// ── MODAL FIAR ──
function openFiar(pid, val, desc) {
  ui.fiarPersonaId=pid; ui.fiarValor=val; ui.fiarClienteId=null;
  document.getElementById('fiar-val').textContent  = cop(val);
  document.getElementById('fiar-desc').textContent = desc;
  document.getElementById('fiar-search').value='';
  document.getElementById('fiar-drop').style.display='none';
  document.getElementById('fiar-cli-sel').style.display='none';
  document.getElementById('btn-fiar-confirm').disabled=true;
  openOverlay('ov-fiar');
}

function renderFiarDrop() {
  var q = document.getElementById('fiar-search').value.toLowerCase().trim();
  var dd = document.getElementById('fiar-drop');
  if (!q) { dd.style.display='none'; return; }
  var matches = db.clientes.filter(function(c){return c.nombre.toLowerCase().includes(q);});
  if (!matches.length) { dd.innerHTML='<div class="cli-opt" style="color:var(--t3)">Sin resultados</div>'; dd.style.display=''; return; }
  dd.innerHTML = matches.map(function(c){
    return '<div class="cli-opt" onclick="selFiarCli(\''+c.id+'\')">'+
      '<div><div class="cli-opt-name">'+c.nombre+'</div><div class="cli-opt-tel">'+(c.tel||'Sin tel')+'</div></div>'+
      (c.saldo>0?'<span class="cli-opt-saldo">Debe '+cop(c.saldo)+'</span>':'')+
      '</div>';
  }).join('');
  dd.style.display='';
}

function selFiarCli(cid) {
  var c = db.clientes.find(function(x){return x.id===cid;});
  if (!c) return;
  ui.fiarClienteId=cid;
  document.getElementById('fiar-search').value=c.nombre;
  document.getElementById('fiar-drop').style.display='none';
  document.getElementById('fiar-cli-name').textContent=c.nombre;
  document.getElementById('fiar-cli-info').textContent=(c.tel||'Sin tel')+(c.saldo>0?' · Debe '+cop(c.saldo):'');
  document.getElementById('fiar-cli-sel').style.display='';
  document.getElementById('btn-fiar-confirm').disabled=false;
}

function confirmarFiar() {
  if (!ui.fiarClienteId) return;
  var c = db.clientes.find(function(x){return x.id===ui.fiarClienteId;});
  if (!c) return;
  var mesaNum = ui.modalMesa;
  sb.rpc('registrar_fiado', { p_obligation_id: ui.fiarPersonaId, p_customer_id: ui.fiarClienteId, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message,'err'); return; }
    toast(c.nombre+' — '+cop(ui.fiarValor)+' fiado','inf');
    closeOverlay('ov-fiar');
    cargarClientes();
    cargarMesas().then(function(){ renderTodo(); if (ui.modalMesa===mesaNum) renderMesaModal(); });
  });
}
