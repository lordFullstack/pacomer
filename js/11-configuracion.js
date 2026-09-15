// ════════════════════════════════════════════════════════
// MÓDULO CONFIGURACIÓN
// ════════════════════════════════════════════════════════
function cargarConfigNegocio() {
  return sb.from('app_config').select('value').eq('key','negocio').maybeSingle().then(function(r){
    if (r.error) { sbErr(r.error,'cargar configuracion'); return; }
    var v = (r.data && r.data.value) || {};
    db.config = {
      nombre_negocio: v.nombre_negocio || "Pa' Comer",
      logo_url: v.logo_url || '',
      direccion: v.direccion || '',
      cedula: v.cedula || '',
      ciudad: v.ciudad || '',
      departamento: v.departamento || '',
      servicio: v.servicio || 'Servicio de comedor'
    };
    var logo = document.getElementById('splash-logo');
    if (logo && db.config.logo_url) logo.innerHTML = '<img src="'+db.config.logo_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:20px">';
    var nameEl = document.getElementById('splash-name');
    if (nameEl) nameEl.textContent = db.config.nombre_negocio;
    if (document.getElementById('config-content')) renderConfig();
  });
}

function cargarUsuarios() {
  return sb.from('app_users').select('id,nombre,role,activo').then(function(r){
    if (r.error) { sbErr(r.error,'cargar usuarios'); return; }
    db.usuarios = (r.data||[]).map(function(u){ return {id:u.id, nombre:u.nombre, activo:u.activo, rol:u.role}; });
    renderUsuariosList();
  });
}

function renderConfig() {
  var c = db.config;
  var el = document.getElementById('config-content');
  el.innerHTML =
    '<div class="card" style="margin-bottom:16px">'+
      '<div class="card-title">🏪 Datos del negocio</div>'+
      '<div onclick="document.getElementById(\'cfg-logo-inp\').click()" style="width:84px;height:84px;border-radius:16px;cursor:pointer;background:'+(c.logo_url?'url('+c.logo_url+') center/cover no-repeat':'var(--s1)')+';border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:12px" id="cfg-logo-preview">'+(c.logo_url?'':'📷')+'</div>'+
      '<input type="file" id="cfg-logo-inp" accept="image/*" style="display:none" onchange="subirLogoNegocio(this)">'+
      '<div class="lbl">Nombre del negocio</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:10px" id="cfg-nombre" value="'+(c.nombre_negocio||'')+'" placeholder="Ej: Pa\' Comer">'+
      '<div class="lbl">Cédula / NIT</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:10px" id="cfg-cedula" value="'+(c.cedula||'')+'" placeholder="Ej: 1072523641">'+
      '<div class="lbl">Ciudad / Municipio</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:10px" id="cfg-ciudad" value="'+(c.ciudad||'')+'" placeholder="Ej: Montelíbano">'+
      '<div class="lbl">Departamento</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:10px" id="cfg-departamento" value="'+(c.departamento||'')+'" placeholder="Ej: Córdoba">'+
      '<div class="lbl">Tipo de servicio</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:10px" id="cfg-servicio" value="'+(c.servicio||'Servicio de comedor')+'" placeholder="Ej: Servicio de comedor">'+
      '<div class="lbl">Dirección</div>'+
      '<input class="apertura-inp" style="width:100%;margin-bottom:14px" id="cfg-direccion" value="'+(c.direccion||'')+'" placeholder="Ej: Cra 5 # 10-20, Montelíbano">'+
      '<button class="btn btn-accent btn-full" onclick="guardarNegocio()">Guardar datos del negocio</button>'+
    '</div>'+
    '<div class="card" style="margin-bottom:16px">'+
      '<div class="card-title">👤 Usuarios y PIN de acceso</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px" id="cfg-usuarios-list"></div>'+
      '<button class="btn btn-ghost btn-full" onclick="abrirModalUsuario()">+ Agregar usuario</button>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">🗄️ Restaurar respaldo</div>'+
      '<div style="font-size:12px;color:var(--t2);margin-bottom:10px">Restaura clientes, proveedores y configuración desde un archivo exportado. Nunca toca mesas, pagos ni caja — solo agrega lo que falte, nunca sobrescribe un cliente o proveedor que ya exista.</div>'+
      '<input type="file" id="restore-inp" accept="application/json" style="display:none" onchange="seleccionarArchivoRespaldo(this)">'+
      '<button class="btn btn-ghost btn-full" onclick="document.getElementById(\'restore-inp\').click()">Elegir archivo de respaldo…</button>'+
      '<div id="restore-preview"></div>'+
    '</div>';
  renderUsuariosList();
}

function renderUsuariosList() {
  var el = document.getElementById('cfg-usuarios-list');
  if (!el) return;
  if (!db.usuarios.length) { el.innerHTML = '<div style="font-size:12px;color:var(--t2)">Sin usuarios registrados — cualquiera puede entrar sin PIN.</div>'; return; }
  el.innerHTML = db.usuarios.map(function(u){
    return '<div class="gasto-item">'+
      '<div><span style="font-size:13px;font-weight:600">'+u.nombre+'</span> '+
        '<span class="badge '+(u.rol==='admin'?'badge-blue':'badge-accent')+'">'+(u.rol==='admin'?'Admin':'Cajero')+'</span> '+
        '<span class="badge '+(u.activo?'badge-accent':'badge-blue')+'">'+(u.activo?'Activo':'Inactivo')+'</span></div>'+
      '<div style="display:flex;gap:8px">'+
        '<button class="btn btn-ghost" style="padding:6px 10px;font-size:11px" onclick="toggleUsuario(\''+u.id+'\')">'+(u.activo?'Desactivar':'Activar')+'</button>'+
      '</div></div>';
  }).join('');
}

function guardarNegocio() {
  var nombre = document.getElementById('cfg-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','err'); return; }
  var valores = {
    nombre_negocio: nombre,
    direccion: document.getElementById('cfg-direccion').value.trim(),
    cedula: document.getElementById('cfg-cedula').value.trim(),
    ciudad: document.getElementById('cfg-ciudad').value.trim(),
    departamento: document.getElementById('cfg-departamento').value.trim(),
    servicio: document.getElementById('cfg-servicio').value.trim(),
    logo_url: db.config.logo_url || ''
  };
  sb.rpc('actualizar_config', { p_valores: valores, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Datos del negocio actualizados');
    cargarConfigNegocio();
  });
}

function subirLogoNegocio(inp) {
  var f = inp.files[0];
  if (!f) return;
  var ext = (f.type.split('/')[1]||'jpg').replace('jpeg','jpg');
  var path = 'negocio/logo-'+Date.now()+'.'+ext;
  toast('Subiendo logo...','inf');
  sb.storage.from('pacomer-pos-img').upload(path, f, {contentType:f.type, upsert:true}).then(function(r){
    if (r.error) { sbErr(r.error,'logo'); return; }
    var pub = sb.storage.from('pacomer-pos-img').getPublicUrl(path);
    var url = pub.data.publicUrl;
    var valores = {
      nombre_negocio: db.config.nombre_negocio, direccion: db.config.direccion, cedula: db.config.cedula,
      ciudad: db.config.ciudad, departamento: db.config.departamento, servicio: db.config.servicio, logo_url: url
    };
    sb.rpc('actualizar_config', { p_valores: valores, p_idempotency_key: uid() }).then(function(r2){
      if (r2.error) { toast('Error: '+r2.error.message, 'err'); return; }
      document.getElementById('cfg-logo-preview').style.background = 'url('+url+') center/cover no-repeat';
      document.getElementById('cfg-logo-preview').textContent = '';
      toast('Logo actualizado');
      cargarConfigNegocio();
    });
  });
}

function abrirModalUsuario() {
  var nombre = prompt('Nombre del usuario:');
  if (!nombre || !nombre.trim()) return;
  var pin = prompt('PIN de 4 dígitos:');
  if (!pin || !/^\d{4}$/.test(pin)) { toast('El PIN debe ser de 4 dígitos','err'); return; }
  sb.rpc('crear_usuario', { p_nombre: nombre.trim(), p_pin: pin, p_role: 'cajero', p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Usuario agregado');
    cargarUsuarios();
  });
}

function toggleUsuario(id) {
  var u = db.usuarios.find(function(x){return x.id===id;});
  if (!u) return;
  sb.rpc('activar_desactivar_usuario', { p_app_user_id: id, p_activo: !u.activo, p_idempotency_key: uid() }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    cargarUsuarios();
  });
}
