// ════════════════════════════════════════════════════════
// SPLASH + PIN GATE
// ════════════════════════════════════════════════════════
var pinBuffer = '';
var pinUsuarioSel = null;
var staffList = [];

// Login real: el PIN de 4 digitos ES la contraseña de Supabase Auth del
// usuario (nunca se compara en cliente ni se guarda en texto plano).
// list_staff_for_login solo expone id/nombre/login_email, sin PIN.
function cargarPantallaLogin() {
  sb.rpc('list_staff_for_login', { p_tenant_id: PACOMER_TENANT_ID }).then(function(r){
    if (r.error) { sbErr(r.error, 'cargar personal'); return; }
    staffList = r.data || [];
    document.getElementById('pin-gate').style.display = '';
    if (!staffList.length) { mostrarBootstrap(); } else { renderPinUsers(); }
  });
}

function renderPinUsers() {
  document.getElementById('pg-bootstrap').style.display = 'none';
  document.getElementById('pg-users').style.display = '';
  document.getElementById('pg-title').textContent = '¿Quién eres?';
  var c = document.getElementById('pg-users');
  c.innerHTML = staffList.map(function(u){
    return '<button class="pin-user-btn" onclick="selUsuario(\''+u.id+'\')">'+u.nombre+'</button>';
  }).join('');
}

function selUsuario(uid) {
  pinUsuarioSel = staffList.find(function(u){ return u.id===uid; });
  pinBuffer = '';
  document.getElementById('pg-users').style.display = 'none';
  document.getElementById('pg-padwrap').style.display = '';
  document.getElementById('pg-selected').textContent = pinUsuarioSel.nombre;
  document.getElementById('pg-title').textContent = 'Ingresa tu PIN';
  updatePinDots();
}

function updatePinDots() {
  var dots = document.querySelectorAll('#pg-dots span');
  dots.forEach(function(d,i){ d.classList.toggle('fill', i<pinBuffer.length); });
}

function pinPress(n) {
  if (pinBuffer.length>=4) return;
  pinBuffer += n;
  updatePinDots();
  if (pinBuffer.length===4) {
    var intentado = pinBuffer;
    setTimeout(function(){
      if (!pinUsuarioSel) return;
      sb.auth.signInWithPassword({ email: pinUsuarioSel.login_email, password: intentado }).then(function(r){
        if (r.error) {
          toast('PIN incorrecto','err');
          pinBuffer=''; updatePinDots();
          return;
        }
        sb.from('app_users').select('id,nombre,role').eq('auth_user_id', r.data.user.id).single().then(function(ru){
          if (ru.error || !ru.data) { toast('No se pudo cargar el usuario','err'); return; }
          var usr = { id: ru.data.id, nombre: ru.data.nombre, rol: ru.data.role };
          ui.usuarioActual = usr;
          db.usuarioActivo = usr;
          aplicarPermisosPorRol(usr.rol);
          document.getElementById('pin-gate').style.display = 'none';
          toast('Hola, '+usr.nombre+' 👋');
          cargarClientes();
          cargarProveedores();
          cargarConfigNegocio();
          cargarUsuarios();
          cargarMesas().then(renderTodo);
          cargarOrdenesRecientes().then(renderStats);
        });
      });
    }, 150);
  }
}
function pinBack() { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); }
function pinCancel() {
  pinBuffer=''; pinUsuarioSel=null;
  document.getElementById('pg-users').style.display='';
  document.getElementById('pg-padwrap').style.display='none';
  document.getElementById('pg-title').textContent='¿Quién eres?';
}

function mostrarBootstrap() {
  document.getElementById('pg-users').style.display = 'none';
  document.getElementById('pg-padwrap').style.display = 'none';
  document.getElementById('pg-bootstrap').style.display = '';
  document.getElementById('pg-title').textContent = 'Crea el administrador';
}

function crearAdminBootstrap() {
  var nombre = document.getElementById('bs-nombre').value.trim();
  var pin = document.getElementById('bs-pin').value.trim();
  if (!nombre) { toast('Escribe un nombre','err'); return; }
  if (!/^\d{4}$/.test(pin)) { toast('El PIN debe ser de 4 dígitos','err'); return; }
  sb.rpc('bootstrap_admin', { p_tenant_id: PACOMER_TENANT_ID, p_nombre: nombre, p_pin: pin }).then(function(r){
    if (r.error) { toast('Error: '+r.error.message, 'err'); return; }
    toast('Administrador creado — ingresa con tu PIN');
    document.getElementById('bs-nombre').value = '';
    document.getElementById('bs-pin').value = '';
    cargarPantallaLogin();
  });
}
