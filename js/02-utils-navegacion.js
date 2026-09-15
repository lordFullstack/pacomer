// ════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════
function uid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(ch){
    var r = Math.random()*16|0, v = ch==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}
function cop(n) { return '$' + Math.abs(Number(n)).toLocaleString('es-CO'); }
function elapsed(ts) {
  var d = Math.floor((Date.now()-ts)/60000);
  if (d < 1) return 'Ahora';
  if (d < 60) return d+'min';
  return Math.floor(d/60)+'h '+('0'+(d%60)).slice(-2)+'min';
}
function fechaStr(ts) {
  var d = new Date(ts||Date.now());
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
function fechaHoy() { return fechaStr(Date.now()); }
function fechaCorta(ts) {
  var d = new Date(ts);
  return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function toast(msg, tipo) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast on ' + (tipo||'ok');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.className='toast'; }, 2800);
}

function numFmt(s) { return parseInt(s.replace(/[^0-9]/g,''))||0; }
function fmtInp(input, val) { input.value = val ? '$'+val.toLocaleString('es-CO') : ''; }

function fmtVal(inp)  { ui.regValor = numFmt(inp.value); fmtInp(inp, ui.regValor); }
function fmtAddP(inp) { fmtInp(inp, numFmt(inp.value)); }

function addMovimiento(tipo, origen, valor) {
  var mv = {tipo:tipo, origen:origen, valor:valor, fechaStr:fechaHoy(), ts:Date.now()};
  db.movimientos.push(mv);
  sb.from('movimientos').insert({tipo:tipo, origen:origen, valor:valor, fecha_str:mv.fechaStr, ts:new Date(mv.ts).toISOString()}).then(function(r){ sbErr(r.error,'movimiento'); });
}

// ════════════════════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════════════════════
function navTo(page) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('on'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('page-'+page).classList.add('on');
  document.querySelector('.nav-btn[onclick="navTo(\''+page+'\')"]').classList.add('active');
  if (page==='clientes')    { cargarClientes(); }
  if (page==='proveedores') { cargarProveedores(); }
  if (page==='caja')        { cargarCajaActual().then(function(){ setCajaTab(ui.cajaTab||'cierre'); }); }
  if (page==='config')      { cargarConfigNegocio(); cargarUsuarios(); }
}

function openOverlay(id) { document.getElementById(id).classList.add('on'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('on'); }

document.querySelectorAll('.overlay').forEach(function(ov){
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('on'); });
});
