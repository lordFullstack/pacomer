// ════════════════════════════════════════════════════════
// LOOP 08A — MOBILE QUICK SERVICE
// Pantalla complementaria exclusiva para movil. Reutiliza abrir_orden/
// agregar_persona (Integracion paso 1) — no duplica logica de negocio.
// No toca db.mesas directamente; despues de registrar recarga desde
// cargarMesas() igual que el resto de Mesas.
// ════════════════════════════════════════════════════════
var qs = { mesaSel: null, registrando: false };

function abrirQuickService() {
  qs.mesaSel = null;
  renderQsMesas();
  document.getElementById('qs-nombre').value = '';
  document.getElementById('qs-valor').value = '';
  document.getElementById('qs-nota').value = '';
  qsUpdateBoton();
  document.getElementById('quick-service').classList.add('on');
}

function cerrarQuickService() {
  document.getElementById('quick-service').classList.remove('on');
}

function renderQsMesas() {
  var c = document.getElementById('qs-mesas');
  var html = '';
  for (var i=1; i<=MESAS; i++) {
    var sel = qs.mesaSel===i;
    var label = i<10 ? '0'+i : ''+i;
    html += '<button type="button" class="qs-mesa-btn'+(sel?' sel':'')+'" onclick="qsSelMesa('+i+')">'+label+(sel?' ✓':'')+'</button>';
  }
  c.innerHTML = html;
}

function qsSelMesa(n) {
  qs.mesaSel = n;
  renderQsMesas();
  qsUpdateBoton();
}

function qsFmtValor(inp) {
  fmtInp(inp, numFmt(inp.value));
  qsUpdateBoton();
}

function qsValorKeydown(e) {
  if (e.key==='Enter') { e.preventDefault(); document.getElementById('qs-nota').focus(); }
}
function qsNotaKeydown(e) {
  if (e.key==='Enter') { e.preventDefault(); qsRegistrar(); }
}

function qsUpdateBoton() {
  var btn = document.getElementById('qs-btn-registrar');
  if (qs.registrando) return;
  var valor = numFmt(document.getElementById('qs-valor').value);
  var nombre = document.getElementById('qs-nombre').value.trim();
  if (!qs.mesaSel || !valor) { btn.textContent = '✓ REGISTRAR'; return; }
  btn.textContent = '✓ REGISTRAR '+cop(valor)+' · M'+(qs.mesaSel<10?'0'+qs.mesaSel:qs.mesaSel)+(nombre?' · '+nombre.toUpperCase():'');
}

function qsLimpiar() {
  document.getElementById('qs-nombre').value = '';
  document.getElementById('qs-valor').value = '';
  document.getElementById('qs-nota').value = '';
  qsUpdateBoton();
  document.getElementById('qs-nombre').focus();
}

function qsRegistrar() {
  if (qs.registrando) return;
  if (!qs.mesaSel) {
    toast('Selecciona una mesa','err');
    document.getElementById('qs-mesas').focus();
    return;
  }
  var valor = numFmt(document.getElementById('qs-valor').value);
  if (!valor || valor<=0) {
    toast('Ingresa el valor','err');
    document.getElementById('qs-valor').focus();
    return;
  }
  var nombreInp = document.getElementById('qs-nombre').value.trim();
  var nota = document.getElementById('qs-nota').value.trim();
  var mesaSel = qs.mesaSel;

  var tableId = db.tablesByLabel && db.tablesByLabel[String(mesaSel)];
  if (!tableId) { toast('Mesa no configurada en el sistema','err'); return; }

  qs.registrando = true;
  var btn = document.getElementById('qs-btn-registrar');
  btn.disabled = true;
  btn.textContent = 'REGISTRANDO...';

  var existentes = (db.mesas[mesaSel] && db.mesas[mesaSel].personas) ? db.mesas[mesaSel].personas.length : 0;
  var nombreFinal = nombreInp || ('Consumo '+(existentes+1));

  agregarConsumoMesaConCola(tableId, mesaSel, valor, nombreFinal, nota||null).then(function(r){
    qs.registrando = false;
    btn.disabled = false;
    if (!r.ok) { toast('Error: '+r.error,'err'); qsUpdateBoton(); return; }
    if (r.offline) {
      toast('Sin conexión — Mesa '+(mesaSel<10?'0'+mesaSel:mesaSel)+' · '+nombreFinal+' guardado, se sincronizará');
      document.getElementById('qs-nombre').value = '';
      document.getElementById('qs-valor').value = '';
      document.getElementById('qs-nota').value = '';
      qsUpdateBoton();
      return;
    }
    toast('✓ Mesa '+(mesaSel<10?'0'+mesaSel:mesaSel)+' · '+nombreFinal+' · '+cop(valor)+' registrado');
    cargarMesas().then(function(){
      renderTodo();
      document.getElementById('qs-nombre').value = '';
      document.getElementById('qs-valor').value = '';
      document.getElementById('qs-nota').value = '';
      qsUpdateBoton();
    });
  });
}
