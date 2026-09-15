// ════════════════════════════════════════════════════════
// LOOP 11 — AUDITORÍA
// ════════════════════════════════════════════════════════
// Solo lectura, solo admin (aplicarPermisosPorRol esconde el boton del nav
// para cajero, pero la proteccion real esta en el backend: listar_auditoria
// exige rol admin y la policy de audit_events tambien — "la ocultacion
// visual nunca sustituye a la autorizacion backend").
var AUDIT_ACCIONES = {
  login:                        { modulo: 'Sesión',       label: 'Inicio de sesión' },
  logout:                       { modulo: 'Sesión',       label: 'Cierre de sesión' },
  abrir_orden:                  { modulo: 'Mesas',        label: 'Apertura de orden' },
  agregar_persona:               { modulo: 'Mesas',        label: 'Consumo agregado' },
  cobrar_persona:                { modulo: 'Mesas',        label: 'Cobro individual' },
  cobrar_mesa:                   { modulo: 'Mesas',        label: 'Cobro de mesa completa' },
  editar_valor_persona:          { modulo: 'Mesas',        label: 'Corrección de valor' },
  liberar_orden:                 { modulo: 'Mesas',        label: 'Liberación de mesa' },
  registrar_fiado:               { modulo: 'Clientes',     label: 'Consumo fiado' },
  crear_cliente:                  { modulo: 'Clientes',     label: 'Cliente creado' },
  editar_cliente:                 { modulo: 'Clientes',     label: 'Cliente editado' },
  registrar_abono:                { modulo: 'Clientes',     label: 'Abono registrado' },
  crear_proveedor:                { modulo: 'Proveedores',  label: 'Proveedor creado' },
  editar_proveedor:               { modulo: 'Proveedores',  label: 'Proveedor editado' },
  registrar_compra:               { modulo: 'Proveedores',  label: 'Factura registrada' },
  registrar_pago_proveedor:       { modulo: 'Proveedores',  label: 'Pago a proveedor' },
  abrir_caja:                     { modulo: 'Caja',         label: 'Apertura de caja' },
  cerrar_caja:                    { modulo: 'Caja',         label: 'Cierre de caja' },
  iniciar_arqueo:                 { modulo: 'Caja',         label: 'Inicio de arqueo' },
  reabrir_caja:                   { modulo: 'Caja',         label: 'Reapertura de caja' },
  registrar_gasto:                { modulo: 'Caja',         label: 'Gasto registrado' },
  actualizar_config:              { modulo: 'Configuración',label: 'Configuración actualizada' },
  crear_usuario:                  { modulo: 'Configuración',label: 'Usuario creado' },
  activar_desactivar_usuario:     { modulo: 'Configuración',label: 'Usuario activado/desactivado' },
  bootstrap_admin:                { modulo: 'Configuración',label: 'Administrador inicial creado' }
};
function auditEtiqueta(a) { return (AUDIT_ACCIONES[a] && AUDIT_ACCIONES[a].label) || a; }
function auditModulo(a)   { return (AUDIT_ACCIONES[a] && AUDIT_ACCIONES[a].modulo) || 'Otro'; }

var auditoria = { filtroModulo: '', filtroAccion: '', filtroUsuario: '', desde: '', hasta: '', filas: [] };

function cargarAuditoria() {
  var el = document.getElementById('auditoria-content');
  var params = {
    p_desde: auditoria.desde ? new Date(auditoria.desde).toISOString() : null,
    p_hasta: auditoria.hasta ? new Date(auditoria.hasta + 'T23:59:59').toISOString() : null,
    p_usuario: auditoria.filtroUsuario || null,
    p_accion: auditoria.filtroAccion || null,
    p_limit: 200, p_offset: 0
  };
  return sb.rpc('listar_auditoria', params).then(function(r) {
    if (r.error) { sbErr(r.error, 'cargar auditoria'); auditoria.filas = []; renderAuditoria(); return; }
    auditoria.filas = r.data || [];
    renderAuditoria();
  });
}

function renderFiltrosAuditoria() {
  var usuariosOpts = (db.usuarios || []).map(function(u) {
    return '<option value="' + u.id + '"' + (auditoria.filtroUsuario === u.id ? ' selected' : '') + '>' + u.nombre + '</option>';
  }).join('');
  var modulos = ['Sesión', 'Mesas', 'Clientes', 'Proveedores', 'Caja', 'Configuración'];
  var moduloOpts = modulos.map(function(m) {
    return '<option value="' + m + '"' + (auditoria.filtroModulo === m ? ' selected' : '') + '>' + m + '</option>';
  }).join('');
  var accionesDelModulo = Object.keys(AUDIT_ACCIONES).filter(function(a) {
    return !auditoria.filtroModulo || AUDIT_ACCIONES[a].modulo === auditoria.filtroModulo;
  });
  var accionOpts = accionesDelModulo.map(function(a) {
    return '<option value="' + a + '"' + (auditoria.filtroAccion === a ? ' selected' : '') + '>' + auditEtiqueta(a) + '</option>';
  }).join('');

  return '<div class="card" style="margin-bottom:16px">' +
    '<div class="card-title">🔍 Filtros</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">' +
      '<div class="field"><div class="lbl">Desde</div><input class="inp" type="date" id="aud-desde" value="' + auditoria.desde + '" onchange="auditSetFiltro(\'desde\',this.value)"></div>' +
      '<div class="field"><div class="lbl">Hasta</div><input class="inp" type="date" id="aud-hasta" value="' + auditoria.hasta + '" onchange="auditSetFiltro(\'hasta\',this.value)"></div>' +
      '<div class="field"><div class="lbl">Usuario</div><select class="inp" id="aud-usuario" onchange="auditSetFiltro(\'filtroUsuario\',this.value)"><option value="">Todos</option>' + usuariosOpts + '</select></div>' +
      '<div class="field"><div class="lbl">Módulo</div><select class="inp" id="aud-modulo" onchange="auditSetModulo(this.value)"><option value="">Todos</option>' + moduloOpts + '</select></div>' +
      '<div class="field"><div class="lbl">Acción</div><select class="inp" id="aud-accion" onchange="auditSetFiltro(\'filtroAccion\',this.value)"><option value="">Todas</option>' + accionOpts + '</select></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn btn-accent" onclick="cargarAuditoria()">Filtrar</button>' +
      '<button class="btn btn-ghost" onclick="auditLimpiarFiltros()">Limpiar</button>' +
    '</div>' +
  '</div>';
}

function auditSetFiltro(campo, valor) { auditoria[campo] = valor; }
function auditSetModulo(valor) { auditoria.filtroModulo = valor; auditoria.filtroAccion = ''; renderAuditoria(); }
function auditLimpiarFiltros() {
  auditoria = { filtroModulo: '', filtroAccion: '', filtroUsuario: '', desde: '', hasta: '', filas: auditoria.filas };
  cargarAuditoria();
}

function renderAuditoria() {
  var el = document.getElementById('auditoria-content');
  var filas = auditoria.filas.filter(function(f) {
    return !auditoria.filtroModulo || auditModulo(f.action) === auditoria.filtroModulo;
  });

  el.innerHTML = renderFiltrosAuditoria() +
    '<div class="lbl">' + filas.length + ' evento' + (filas.length === 1 ? '' : 's') + '</div>' +
    (filas.length ? filas.map(function(f) {
      var fecha = new Date(f.created_at);
      var resumen = auditResumenMetadata(f);
      return '<div class="pago-item" style="align-items:flex-start;margin-bottom:6px">' +
        '<div>' +
          '<div class="pago-item-desc">' + auditEtiqueta(f.action) + '</div>' +
          '<div class="pago-item-meta">' +
            '<span class="badge badge-accent">' + auditModulo(f.action) + '</span>' +
            '<span class="pago-item-fecha">' + (f.actor_nombre || 'Sistema') + ' · ' + fecha.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span>' +
          '</div>' +
          (resumen ? '<div style="font-size:11px;color:var(--t3);margin-top:3px">' + resumen + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Sin eventos con estos filtros</div></div>');
}

function auditResumenMetadata(f) {
  var m = f.metadata || {};
  try {
    if (f.action === 'registrar_gasto') return m.description ? (m.description + ' — ' + cop(m.amount)) : cop(m.amount);
    if (m.amount != null) return cop(m.amount);
    if (m.nombre) return m.nombre;
    if (m.valor_anterior != null && m.valor_nuevo != null) return cop(m.valor_anterior) + ' → ' + cop(m.valor_nuevo);
    if (m.opening_cash != null) return 'Base: ' + cop(m.opening_cash);
    if (m.difference != null) return 'Diferencia: ' + cop(m.difference);
  } catch (e) {}
  return '';
}
