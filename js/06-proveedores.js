// ════════════════════════════════════════════════════════
// MÓDULO PROVEEDORES
// ════════════════════════════════════════════════════════
// Estructura proveedor: { id, nombre, tel, categoria, nota, saldo,
//   movimientos: [{id, tipo:'factura'|'pago', desc, valor, origen, fecha}]|null (lazy) }

function saldoProv(p) { return p.saldo||0; }

function cargarProveedores() {
  return Promise.all([
    sb.from('suppliers').select('id,name,phone,category,notes'),
    sb.from('supplier_balances').select('supplier_id,saldo')
  ]).then(function(r){
    if (r[0].error) { sbErr(r[0].error,'cargar proveedores'); return; }
    var saldoPorId = {};
    (r[1].data||[]).forEach(function(b){ saldoPorId[b.supplier_id] = Number(b.saldo); });
    db.proveedores = (r[0].data||[]).map(function(p){
      return {id:p.id, nombre:p.name, tel:p.phone||'', categoria:p.category||'', nota:p.notes||'', saldo:saldoPorId[p.id]||0, movimientos:null};
    });
    renderProvList();
  });
}

function cargarMovimientosProveedor(pid) {
  Promise.all([
    sb.from('purchases').select('id,amount,invoice_number,created_at').eq('supplier_id',pid),
    sb.from('supplier_payments').select('id,applied_amount,created_at').eq('supplier_id',pid).eq('status','ACTIVE')
  ]).then(function(r){
    var facturas = (r[0].data||[]).map(function(x){
      return {id:x.id, tipo:'factura', desc:x.invoice_number?('Factura '+x.invoice_number):'Factura proveedor', valor:Number(x.amount), fecha:new Date(x.created_at).getTime()};
    });
    var pagos = (r[1].data||[]);
    var pagoIds = pagos.map(function(x){return x.id;});
    var tendersPromise = pagoIds.length
      ? sb.from('supplier_payment_tenders').select('payment_id,method').in('payment_id', pagoIds)
      : Promise.resolve({data:[]});
    tendersPromise.then(function(rt){
      var metodoPorPago = {};
      (rt.data||[]).forEach(function(t){ metodoPorPago[t.payment_id] = t.method; });
      var pagosMap = pagos.map(function(x){
        var metodo = metodoPorPago[x.id];
        return {id:x.id, tipo:'pago', desc:'Pago a proveedor', valor:Number(x.applied_amount), origen:metodo==='efectivo'?'caja':'fondo', fecha:new Date(x.created_at).getTime()};
      });
      var p = db.proveedores.find(function(x){return x.id===pid;});
      if (!p) return;
      p.movimientos = facturas.concat(pagosMap).sort(function(a,b){return a.fecha-b.fecha;});
      if (ui.provSel===pid) renderProvDetail();
    });
  });
}

function renderProvList() {
  var q = document.getElementById('prov-search').value.toLowerCase().trim();
  var list = document.getElementById('prov-list');
  var filtrados = db.proveedores.filter(function(p){return !q||p.nombre.toLowerCase().includes(q);});
  if (!filtrados.length) { list.innerHTML='<div class="empty"><div class="empty-icon">🏪</div><div>Sin proveedores</div></div>'; return; }
  list.innerHTML = filtrados.map(function(p){
    var saldo = saldoProv(p);
    return '<div class="prov-item'+(ui.provSel===p.id?' sel':'')+'" onclick="selProv(\''+p.id+'\')">'+
      '<div><div class="prov-item-name">'+p.nombre+'</div><div class="prov-item-cat">'+(p.categoria||'')+'</div></div>'+
      '<div class="prov-item-total" style="color:'+(saldo>0?'var(--red)':saldo<0?'var(--green)':'var(--t3)')+'">'+(saldo>0?cop(saldo):saldo<0?'A favor '+cop(-saldo):'✓')+'</div>'+
      '</div>';
  }).join('');
  var deudaTotal = db.proveedores.reduce(function(s,p){ var sd=saldoProv(p); return s+(sd>0?sd:0); },0);
  document.getElementById('prov-total-label').textContent = deudaTotal>0?'Deuda total: '+cop(deudaTotal):'';
}

function selProv(pid) {
  ui.provSel=pid; renderProvList(); renderProvDetail();
  document.getElementById('page-proveedores').classList.add('mostrar-detalle');
  cargarMovimientosProveedor(pid);
}

function volverListaProveedor() {
  ui.provSel = null;
  document.getElementById('page-proveedores').classList.remove('mostrar-detalle');
  renderProvList();
  renderProvDetail();
}

function renderProvDetail() {
  var p = db.proveedores.find(function(x){return x.id===ui.provSel;});
  var det = document.getElementById('prov-detail');
  if (!p) { det.innerHTML='<div class="empty" style="margin:auto"><div class="empty-icon">🏪</div><div class="empty-title">Selecciona un proveedor</div></div>'; return; }

  var movs     = p.movimientos||[];
  var saldo    = saldoProv(p);
  var totalFac = movs.filter(function(m){return m.tipo==='factura';}).reduce(function(s,m){return s+m.valor;},0);
  var totalPag = movs.filter(function(m){return m.tipo==='pago';}).reduce(function(s,m){return s+m.valor;},0);
  var deuda    = saldo > 0;

  det.innerHTML =
    '<div class="detail-head">'+
      '<button class="btn-volver" onclick="volverListaProveedor()">← Volver</button>'+
      '<div><div class="detail-name">'+p.nombre+'</div>'+
      '<div class="detail-meta">'+(p.categoria||'')+(p.tel?' · '+p.tel:'')+(p.nota?' · '+p.nota:'')+'</div></div>'+
      '<button class="btn btn-ghost" style="font-size:12px;padding:7px 12px" onclick="openModalProveedor(\''+p.id+'\')">Editar</button>'+
    '</div>'+
    '<div class="detail-body">'+

      // BANNER SALDO
      '<div class="saldo-banner '+(deuda?'deuda':'ok')+'">'+
        '<div>'+
          '<div class="saldo-banner-label">'+(deuda?'Deuda pendiente':saldo<0?'Saldo a favor':'Al día')+'</div>'+
          '<div style="font-size:11px;color:var(--t3);margin-top:2px">Facturado: '+cop(totalFac)+' · Pagado: '+cop(totalPag)+'</div>'+
        '</div>'+
        '<div class="saldo-banner-val '+(deuda?'deuda':'ok')+'">'+(deuda?cop(saldo):saldo<0?cop(-saldo):'✓ $0')+'</div>'+
      '</div>'+

      // REGISTRAR FACTURA
      '<div class="pago-box" style="border-color:var(--red);border-style:solid">'+
        '<div class="pago-box-title" style="color:var(--red)">📦 Registrar factura / compra</div>'+
        '<div class="pago-row">'+
          '<input class="pago-val-inp" id="fac-val" placeholder="$0" type="text" inputmode="numeric" oninput="fmtInpG(this)">'+
          '<button class="btn" style="background:var(--red);color:#fff" onclick="registrarFactura(\''+p.id+'\')">Registrar</button>'+
        '</div>'+
        '<input class="pago-desc-inp" id="fac-desc" placeholder="Descripción (Ej: pedido frutas martes)" type="text">'+
      '</div>'+

      // REGISTRAR PAGO / ABONO
      (deuda||saldo===0?
      '<div class="pago-box" style="border-color:var(--green);border-style:solid">'+
        '<div class="pago-box-title" style="color:var(--green)">💵 Registrar pago / abono</div>'+
        '<div class="pago-row">'+
          '<input class="pago-val-inp" id="pago-val" placeholder="$0" type="text" inputmode="numeric" oninput="fmtInpG(this)">'+
          '<button class="btn btn-green" onclick="registrarPagoProv(\''+p.id+'\')">Abonar</button>'+
        '</div>'+
        '<div class="origen-row">'+
          '<div id="po-caja"  onclick="setPagoOrigen(\'caja\')"  class="origen-btn active-caja">💵 Caja</div>'+
          '<div id="po-fondo" onclick="setPagoOrigen(\'fondo\')" class="origen-btn">🏦 Fondo</div>'+
        '</div>'+
        '<input class="pago-desc-inp" id="pago-desc" placeholder="Nota del pago (opcional)" type="text">'+
      '</div>' : '')+

      // HISTORIAL
      '<div class="lbl">Estado de cuenta ('+movs.length+' movimientos)</div>'+
      (movs.length ? [...movs].reverse().map(function(m){
        var esFac = m.tipo==='factura';
        return '<div class="pago-item">'+
          '<div>'+
            '<div class="pago-item-desc">'+(m.desc||(esFac?'Factura':'Pago'))+'</div>'+
            '<div class="pago-item-meta">'+
              '<span class="badge '+(esFac?'badge-red':'badge-green')+'">'+(esFac?'Factura':'Pago')+'</span>'+
              (!esFac && m.origen?'<span class="badge '+(m.origen==='caja'?'badge-accent':'badge-blue')+'">'+(m.origen==='caja'?'Caja':'Fondo')+'</span>':'')+
              '<span class="pago-item-fecha">'+fechaCorta(m.fecha)+'</span>'+
            '</div>'+
          '</div>'+
          '<div class="pago-item-val" style="color:'+(esFac?'var(--red)':'var(--green)')+'">'+(esFac?'+':'-')+cop(m.valor)+'</div>'+
          '</div>';
      }).join('') : '<div style="color:var(--t3);font-size:13px;padding:12px 0">Sin movimientos</div>')+
    '</div>';

  setPagoOrigen(ui.pagoOrigen);
}

function fmtInpG(inp) { fmtInp(inp, numFmt(inp.value)); }

function setPagoOrigen(o) {
  ui.pagoOrigen=o;
  var c=document.getElementById('po-caja');
  var f=document.getElementById('po-fondo');
  if (!c||!f) return;
  c.className='origen-btn'+(o==='caja'?' active-caja':'');
  f.className='origen-btn'+(o==='fondo'?' active-fondo':'');
}

function registrarFactura(pid) {
  var p = db.proveedores.find(function(x){return x.id===pid;});
  if (!p) return;
  var val = numFmt(document.getElementById('fac-val').value);
  if (!val) { toast('Ingresa el valor de la factura','err'); return; }
  var desc = document.getElementById('fac-desc').value.trim();
  var hoy = new Date().toISOString().slice(0,10);
  sb.rpc('registrar_compra', {
    p_supplier_id: pid, p_amount: val, p_order_date: hoy, p_invoice_date: null,
    p_invoice_number: desc || null, p_due_date: null, p_idempotency_key: uid()
  }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast(p.nombre+' — factura '+cop(val)+' registrada','err');
    cargarProveedores(); cargarMovimientosProveedor(pid);
  });
}

function registrarPagoProv(pid) {
  var p = db.proveedores.find(function(x){return x.id===pid;});
  if (!p) return;
  var val = numFmt(document.getElementById('pago-val').value);
  if (!val) { toast('Ingresa el valor del pago','err'); return; }
  var metodo = ui.pagoOrigen==='caja' ? 'efectivo' : 'transferencia';
  sb.rpc('registrar_pago_proveedor', {
    p_supplier_id: pid, p_tenders: [{method: metodo, amount: val}], p_idempotency_key: uid()
  }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast(p.nombre+' — '+cop(val)+' pagado ('+(ui.pagoOrigen==='caja'?'caja':'fondo')+')');
    cargarProveedores(); cargarMovimientosProveedor(pid);
  });
}

function openModalProveedor(pid) {
  ui.editProvId=pid;
  document.getElementById('mp-title').textContent = pid?'Editar proveedor':'Nuevo proveedor';
  if (pid) {
    var p = db.proveedores.find(function(x){return x.id===pid;});
    document.getElementById('mp-nombre').value = p?p.nombre:'';
    document.getElementById('mp-tel').value    = p?p.tel||'':'';
    document.getElementById('mp-cat').value    = p?p.categoria||'':'';
    document.getElementById('mp-nota').value   = p?p.nota||'':'';
  } else {
    ['mp-nombre','mp-tel','mp-cat','mp-nota'].forEach(function(id){ document.getElementById(id).value=''; });
  }
  openOverlay('ov-proveedor');
}

function guardarProveedor() {
  var nombre = document.getElementById('mp-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','err'); return; }
  var tel  = document.getElementById('mp-tel').value.trim();
  var cat  = document.getElementById('mp-cat').value.trim();
  var nota = document.getElementById('mp-nota').value.trim();
  var call = ui.editProvId
    ? sb.rpc('editar_proveedor', { p_supplier_id: ui.editProvId, p_nombre: nombre, p_telefono: tel, p_categoria: cat, p_nota: nota, p_idempotency_key: uid() })
    : sb.rpc('crear_proveedor', { p_nombre: nombre, p_telefono: tel, p_categoria: cat, p_nota: nota, p_payment_terms: 'contado', p_idempotency_key: uid() });
  call.then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast(ui.editProvId ? 'Proveedor actualizado' : 'Proveedor registrado');
    closeOverlay('ov-proveedor');
    cargarProveedores();
  });
}
