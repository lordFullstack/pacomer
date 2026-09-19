// ════════════════════════════════════════════════════════
// STATS HEADER
// ════════════════════════════════════════════════════════
function renderStats() {
  var ocu = Object.keys(db.mesas).length;
  var hoyTotal = Number(db.ventasHoy) || 0;
  document.getElementById('h-ocupadas').textContent = ocu;
  document.getElementById('h-hoy').textContent = cop(hoyTotal);
  document.getElementById('ss-mesas').textContent = ocu;
  var hoy=Date.now();
  document.getElementById('ss-llevar').textContent = db.llevar.filter(function(o){return hoy-o.hora<86400000;}).length;
  document.getElementById('ss-dom').textContent    = db.domicilios.filter(function(o){return hoy-o.hora<86400000;}).length;
}

function renderTodo() { renderGrid(); renderMesaSel(); renderStats(); }

// ════════════════════════════════════════════════════════
// ROLES Y PERMISOS
// ════════════════════════════════════════════════════════
function aplicarPermisosPorRol(rol) {
  var esAdmin = rol === 'admin';
  // Cajero no ve: Proveedores, Caja, Dashboard, Config, Auditoría
  var btnProv   = document.querySelector('.nav-btn[onclick="navTo(\'proveedores\')"]');
  var btnCaja   = document.querySelector('.nav-btn[onclick="navTo(\'caja\')"]');
  var btnDash   = document.querySelector('.nav-btn[onclick="navTo(\'dashboard\')"]');
  var btnConfig = document.querySelector('.nav-btn[onclick="navTo(\'config\')"]');
  var btnAudit  = document.querySelector('.nav-btn[onclick="navTo(\'auditoria\')"]');
  if (btnProv)   btnProv.style.display   = esAdmin ? '' : 'none';
  if (btnCaja)   btnCaja.style.display   = esAdmin ? '' : 'none';
  if (btnDash)   btnDash.style.display   = esAdmin ? '' : 'none';
  if (btnConfig) btnConfig.style.display = esAdmin ? '' : 'none';
  if (btnAudit)  btnAudit.style.display  = esAdmin ? '' : 'none';
}
