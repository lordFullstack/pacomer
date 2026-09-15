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

  function conSesion(sessionId) {
    var existentes = (db.mesas[mesaSel] && db.mesas[mesaSel].personas) ? db.mesas[mesaSel].personas.length : 0;
    var nombreFinal = nombreInp || ('Consumo '+(existentes+1));
    sb.rpc('agregar_persona', {
      p_table_session_id: sessionId, p_nombre: nombreFinal, p_descriptor: null,
      p_valor: valor, p_nota: nota||null, p_idempotency_key: uid()
    }).then(function(rp){
      qs.registrando = false;
      btn.disabled = false;
      if (rp.error) { toast('Error: '+rp.error.message,'err'); qsUpdateBoton(); return; }
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

  var sesionExistente = db.mesaSessionByNum && db.mesaSessionByNum[mesaSel];
  if (sesionExistente) {
    conSesion(sesionExistente);
  } else {
    sb.rpc('abrir_orden', { p_channel:'mesa', p_table_id: tableId, p_idempotency_key: uid() }).then(function(ra){
      if (ra.error) {
        qs.registrando = false; btn.disabled = false; qsUpdateBoton();
        toast('Error: '+ra.error.message,'err');
        return;
      }
      db.mesaSessionByNum[mesaSel] = ra.data.table_session_id;
      conSesion(ra.data.table_session_id);
    });
  }
}
