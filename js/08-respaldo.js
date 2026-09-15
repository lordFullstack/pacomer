// ════════════════════════════════════════════════════════
// RESPALDO DE DATOS (export / import)
// ════════════════════════════════════════════════════════
function exportarRespaldo(silencioso) {
  try {
    var data = JSON.stringify(db, null, 2);
    var blob = new Blob([data], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var fecha = fechaHoy();
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pacomer-respaldo-'+fecha+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    if (!silencioso) toast('Respaldo descargado — pacomer-respaldo-'+fecha+'.json');
  } catch(e) {
    toast('Error al generar respaldo','err');
  }
}

function importarRespaldo(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('Archivo inválido');
      db = data;
      // Asegurar estructuras mínimas si el respaldo es de versión anterior
      db.mesas       = db.mesas       || {};
      db.llevar      = db.llevar      || [];
      db.domicilios  = db.domicilios  || [];
      db.clientes    = db.clientes    || [];
      db.proveedores = db.proveedores || [];
      db.movimientos = db.movimientos || [];
      db.caja        = db.caja        || {};
      save();
      toast('Respaldo restaurado correctamente ✓');
      renderTodo();
      if (ui.cajaTab) setCajaTab(ui.cajaTab);
    } catch(err) {
      toast('Archivo de respaldo inválido','err');
    }
  };
  reader.readAsText(file);
  input.value = '';
}


function renderMovimientos() {
  var el = document.getElementById('cview-movimientos');
  var movs = db.cajaMovimientos||[];
  var labelPorTipo = {SALE:'Venta', ABONO:'Abono crédito', SUPPLIER_PAYMENT:'Pago a proveedor', ADJUSTMENT:'Ajuste', REVERSAL:'Reversión'};
  var items = movs.map(function(m){
    var esIngreso = Number(m.amount) >= 0;
    return {
      ts: new Date(m.created_at).getTime(),
      tipo: esIngreso?'ingreso':'egreso',
      label: m.type==='GASTO' ? (m.description||'Gasto') : (labelPorTipo[m.type]||m.type),
      valor: Math.abs(Number(m.amount)),
      badge: esIngreso?'badge-green':'badge-red',
      badgeLabel: esIngreso?'Ingreso':'Egreso'
    };
  }).sort(function(a,b){ return b.ts-a.ts; });

  var ingTotal  = items.filter(function(i){return i.tipo==='ingreso';}).reduce(function(s,i){return s+i.valor;},0);
  var egTotal   = items.filter(function(i){return i.tipo==='egreso';}).reduce(function(s,i){return s+i.valor;},0);

  el.innerHTML =
    '<div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px">'+

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
        return '<div class="pago-item" style="background:var(--s1);border:1.5px solid var(--border);border-radius:var(--r-sm)">'+
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

    // Respaldo (copia local de lo que se ve en pantalla; no reemplaza los datos del servidor)
    '<div style="background:var(--s1);border:1.5px solid var(--border);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:10px">'+
      '<div class="lbl" style="margin:0">Respaldo de datos</div>'+
      '<div style="font-size:12px;color:var(--t2)">Copia local de lo que ves en pantalla — no reemplaza los datos del servidor.</div>'+
      '<button class="btn btn-accent" onclick="exportarRespaldo(false)">Exportar respaldo</button>'+
    '</div>'+

    '</div>';
}
