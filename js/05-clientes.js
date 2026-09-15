// ════════════════════════════════════════════════════════
// MÓDULO CLIENTES
// ════════════════════════════════════════════════════════
function cargarClientes() {
  return Promise.all([
    sb.from('customers').select('id,name,phone,notes'),
    sb.from('customer_balances').select('customer_id,saldo')
  ]).then(function(r){
    if (r[0].error) { sbErr(r[0].error,'cargar clientes'); return; }
    var saldoPorId = {};
    (r[1].data||[]).forEach(function(b){ saldoPorId[b.customer_id] = Number(b.saldo); });
    db.clientes = (r[0].data||[]).map(function(c){
      return {id:c.id, nombre:c.name, tel:c.phone||'', nota:c.notes||'', saldo:saldoPorId[c.id]||0, historial:null};
    });
    renderCliList(); renderDeudaTotal();
  });
}

function cargarHistorialCliente(cid) {
  Promise.all([
    sb.from('customer_credits').select('amount,created_at').eq('customer_id',cid),
    sb.from('credit_repayments').select('applied_amount,created_at').eq('customer_id',cid).eq('status','ACTIVE')
  ]).then(function(r){
    var cargos = (r[0].data||[]).map(function(x){ return {tipo:'cargo', desc:'Cargo a cuenta', valor:Number(x.amount), fecha:new Date(x.created_at).getTime()}; });
    var abonos = (r[1].data||[]).map(function(x){ return {tipo:'abono', desc:'Abono', valor:Number(x.applied_amount), fecha:new Date(x.created_at).getTime()}; });
    var c = db.clientes.find(function(x){return x.id===cid;});
    if (!c) return;
    c.historial = cargos.concat(abonos).sort(function(a,b){return b.fecha-a.fecha;});
    if (ui.cliSel===cid) renderCliDetail();
  });
}

function renderCliList() {
  var q = document.getElementById('cli-search').value.toLowerCase().trim();
  var list = document.getElementById('cli-list');
  var filtrados = db.clientes.filter(function(c){return !q||c.nombre.toLowerCase().includes(q);});
  if (!filtrados.length) { list.innerHTML='<div class="empty"><div class="empty-icon">👤</div><div>Sin clientes</div></div>'; return; }
  list.innerHTML = filtrados.map(function(c){
    return '<div class="cli-item'+(ui.cliSel===c.id?' sel':'')+'" onclick="selCliente(\''+c.id+'\')">'+
      '<div><div class="cli-item-name">'+c.nombre+'</div><div class="cli-item-tel">'+(c.tel||'Sin teléfono')+'</div></div>'+
      '<div class="cli-item-saldo '+(c.saldo>0?'saldo-red':'saldo-ok')+'">'+(c.saldo>0?cop(c.saldo):'✓')+'</div>'+
      '</div>';
  }).join('');
}

function renderDeudaTotal() {
  var tot = db.clientes.reduce(function(s,c){return s+(c.saldo||0);},0);
  document.getElementById('cli-deuda-total').textContent = tot>0?'Total: '+cop(tot):'';
}

function selCliente(cid) {
  ui.cliSel=cid; renderCliList(); renderCliDetail();
  document.getElementById('page-clientes').classList.add('mostrar-detalle');
  cargarHistorialCliente(cid);
}

function volverListaCliente() {
  ui.cliSel = null;
  document.getElementById('page-clientes').classList.remove('mostrar-detalle');
  renderCliList();
  renderCliDetail();
}

function renderCliDetail() {
  var c = db.clientes.find(function(x){return x.id===ui.cliSel;});
  var det = document.getElementById('cli-detail');
  if (!c) { det.innerHTML='<div class="empty" style="margin:auto"><div class="empty-icon">👤</div><div class="empty-title">Selecciona un cliente</div></div>'; return; }
  var deuda = (c.saldo||0)>0;
  var hist = c.historial||[];
  det.innerHTML =
    '<div class="detail-head">'+
      '<button class="btn-volver" onclick="volverListaCliente()">← Volver</button>'+
      '<div><div class="detail-name">'+c.nombre+'</div><div class="detail-meta">'+(c.tel||'Sin teléfono')+(c.nota?' · '+c.nota:'')+'</div></div>'+
      '<div class="detail-actions">'+
        (c.tel?'<button class="btn-wa" onclick="enviarWA(\''+c.id+'\')">💬 WhatsApp</button>':'')+
        '<button class="btn btn-ghost" style="font-size:12px;padding:7px 12px" onclick="openModalCliente(\''+c.id+'\')">Editar</button>'+
      '</div>'+
    '</div>'+
    '<div class="detail-body">'+
      '<div class="saldo-banner '+(deuda?'deuda':'ok')+'">'+
        '<div><div class="saldo-banner-label">'+(deuda?'Saldo pendiente':'Al día')+'</div></div>'+
        '<div class="saldo-banner-val '+(deuda?'deuda':'ok')+'">'+(deuda?cop(c.saldo):'✓ $0')+'</div>'+
      '</div>'+
      (deuda?'<div class="abono-row"><input class="abono-inp inp" id="abono-inp-'+c.id+'" placeholder="Valor del abono" type="text" inputmode="numeric" oninput="fmtAbono(this)"><button class="btn btn-green" onclick="registrarAbono(\''+c.id+'\')">Abonar</button></div>':'')+
      '<div class="lbl">Historial ('+hist.length+')</div>'+
      (hist.length ? hist.map(function(h){
        return '<div class="hist-item">'+
          '<div><div class="hist-desc">'+h.desc+'</div><div class="hist-fecha">'+fechaCorta(h.fecha)+'</div></div>'+
          '<div class="hist-val '+(h.tipo==='cargo'?'hist-cargo':'hist-abono')+'">'+(h.tipo==='cargo'?'+':'-')+cop(h.valor)+'</div>'+
          '</div>';
      }).join('') : '<div style="color:var(--t3);font-size:13px;padding:12px 0">Sin movimientos</div>')+
    '</div>';
}

function fmtAbono(inp) { fmtInp(inp, numFmt(inp.value)); }

function registrarAbono(cid) {
  var c = db.clientes.find(function(x){return x.id===cid;});
  if (!c) return;
  var val = numFmt(document.getElementById('abono-inp-'+cid).value);
  if (!val) { toast('Ingresa el valor del abono','err'); return; }
  if (val>c.saldo) { toast('El abono supera la deuda','err'); return; }
  sb.rpc('registrar_abono', { p_customer_id: cid, p_tenders: [{method:'efectivo', amount: val}], p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast(c.nombre+' — abono '+cop(val)+' registrado');
    cargarClientes(); cargarHistorialCliente(cid);
  });
}

function enviarWA(cid) {
  var c = db.clientes.find(function(x){return x.id===cid;});
  if (!c||!c.tel) return;
  var tel = c.tel.replace(/\D/g,'');
  var t = tel.startsWith('57')?tel:'57'+tel;
  var msg = c.saldo>0
    ? 'Hola '+c.nombre+', te recordamos que tienes un saldo pendiente de *'+cop(c.saldo)+'* en Pa\' Comer. Puedes pasarte cuando quieras. ¡Gracias! 🙏'
    : 'Hola '+c.nombre+', gracias por ser cliente de Pa\' Comer. ¡Te esperamos pronto! 😊';
  window.open('https://wa.me/'+t+'?text='+encodeURIComponent(msg),'_blank');
}

function openModalCliente(cid) {
  ui.editCliId = cid;
  document.getElementById('mc-title').textContent = cid?'Editar cliente':'Nuevo cliente';
  if (cid) {
    var c = db.clientes.find(function(x){return x.id===cid;});
    document.getElementById('mc-nombre').value = c?c.nombre:'';
    document.getElementById('mc-tel').value    = c?c.tel||'':'';
    document.getElementById('mc-nota').value   = c?c.nota||'':'';
  } else {
    document.getElementById('mc-nombre').value='';
    document.getElementById('mc-tel').value='';
    document.getElementById('mc-nota').value='';
  }
  openOverlay('ov-cliente');
}

function guardarCliente() {
  var nombre = document.getElementById('mc-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','err'); return; }
  var tel  = document.getElementById('mc-tel').value.trim();
  var nota = document.getElementById('mc-nota').value.trim();
  var call = ui.editCliId
    ? sb.rpc('editar_cliente', { p_customer_id: ui.editCliId, p_nombre: nombre, p_telefono: tel, p_nota: nota, p_idempotency_key: uid() })
    : sb.rpc('crear_cliente', { p_nombre: nombre, p_telefono: tel, p_nota: nota, p_idempotency_key: uid() });
  call.then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast(ui.editCliId ? 'Cliente actualizado' : 'Cliente registrado');
    closeOverlay('ov-cliente');
    cargarClientes();
  });
}
