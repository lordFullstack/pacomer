// ════════════════════════════════════════════════════════
// DASHBOARD — visión general del negocio (admin-only)
// ════════════════════════════════════════════════════════
// Solo lectura, reutiliza dashboard_resumen (RPC ya existente desde
// Loop 08, admin-only por _require_role). Los periodos hoy/7d/30d son
// ventanas moviles terminando hoy; mes/anio son calendario (1 del mes
// o 1 de enero hasta hoy), cada uno comparado contra el periodo
// calendario anterior completo.
var dash = { periodo: 'hoy', datos: null };

function cargarDashboard(periodo) {
  if (periodo) dash.periodo = periodo;
  var el = document.getElementById('dashboard-content');
  sb.rpc('dashboard_resumen', { p_periodo: dash.periodo }).then(function(r) {
    if (r.error) { sbErr(r.error, 'cargar dashboard'); el.innerHTML = '<div class="empty"><div class="empty-icon">📈</div><div class="empty-title">No se pudo cargar el dashboard</div></div>'; return; }
    dash.datos = r.data;
    renderDashboard();
  });
}

function dashSetPeriodo(p) { cargarDashboard(p); }

function dashVariacion(actual, anterior) {
  if (!anterior) return '';
  var pct = Math.round(((actual - anterior) / anterior) * 100);
  var signo = pct >= 0 ? '+' : '';
  var color = pct >= 0 ? 'var(--green)' : 'var(--red)';
  return '<span style="color:' + color + ';font-size:11px;font-weight:600;margin-left:6px">' + signo + pct + '% vs. período anterior</span>';
}

var DASH_PERIODOS = [
  { v: 'hoy', l: 'Hoy' }, { v: '7d', l: '7 días' }, { v: '30d', l: '30 días' },
  { v: 'mes', l: 'Este mes' }, { v: 'anio', l: 'Este año' }
];

function renderDashboard() {
  var el = document.getElementById('dashboard-content');
  var d = dash.datos;
  if (!d) { el.innerHTML = ''; return; }

  var tabs = '<div class="caja-tabs" style="border-radius:var(--r-sm);margin-bottom:16px">' +
    DASH_PERIODOS.map(function(p) {
      return '<div class="caja-tab' + (dash.periodo === p.v ? ' active' : '') + '" onclick="dashSetPeriodo(\'' + p.v + '\')">' + p.l + '</div>';
    }).join('') + '</div>';

  var saldoPositivo = d.flujo.saldo >= 0;
  var flujo = '<div class="dia-hero" style="margin-bottom:16px">' +
    '<div class="dia-hero-item"><div class="dia-hero-val" style="color:var(--green)">' + cop(d.flujo.ingresos) + '</div><div class="dia-hero-label">Ingresos</div></div>' +
    '<div class="dia-hero-item"><div class="dia-hero-val" style="color:var(--red)">' + cop(d.flujo.egresos) + '</div><div class="dia-hero-label">Egresos</div></div>' +
    '<div class="dia-hero-item"><div class="dia-hero-val" style="color:' + (saldoPositivo ? 'var(--green)' : 'var(--red)') + '">' + (saldoPositivo ? '' : '-') + cop(Math.abs(d.flujo.saldo)) + '</div><div class="dia-hero-label">Saldo</div></div>' +
  '</div>';

  var ventasCard = '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">💰 Ventas</div>' +
    '<div class="kv"><span class="kv-label">Total del período</span><span class="kv-val">' + cop(d.ventas.total) + dashVariacion(d.ventas.total, d.ventas.total_periodo_anterior) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Operaciones</span><span class="kv-val">' + d.ventas.operaciones + '</span></div>' +
    '<div class="kv"><span class="kv-label">Ticket promedio</span><span class="kv-val" style="color:var(--accent)">' + cop(d.ventas.ticket_promedio) + '</span></div>' +
    (Object.keys(d.ventas.por_tipo).length ? '<div class="lbl" style="margin-top:10px">Por canal</div>' +
      Object.keys(d.ventas.por_tipo).map(function(canal) {
        var etiquetas = { mesa: '🪑 Mesa', llevar: '🛍️ Llevar', domicilio: '🛵 Domicilio' };
        return '<div class="kv"><span class="kv-label">' + (etiquetas[canal] || canal) + '</span><span class="kv-val">' + cop(d.ventas.por_tipo[canal]) + '</span></div>';
      }).join('') : '') +
    (d.ventas.por_usuario.length ? '<div class="lbl" style="margin-top:10px">Por usuario</div>' +
      d.ventas.por_usuario.map(function(u) {
        return '<div class="kv"><span class="kv-label">' + u.usuario + ' (' + u.operaciones + ')</span><span class="kv-val">' + cop(u.total) + '</span></div>';
      }).join('') : '') +
  '</div>';

  var carteraCard = '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">👤 Cuánto me deben (cartera de clientes)</div>' +
    '<div class="kv"><span class="kv-label">Total pendiente</span><span class="kv-val" style="color:var(--red)">' + cop(d.credito.cartera_total) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Vencido</span><span class="kv-val" style="color:var(--red)">' + cop(d.credito.cartera_vencida) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Clientes con deuda</span><span class="kv-val">' + d.credito.clientes_con_deuda + '</span></div>' +
    '<div class="kv"><span class="kv-label">Abonos del período</span><span class="kv-val" style="color:var(--green)">' + cop(d.credito.abonos_periodo) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Nuevos fiados del período</span><span class="kv-val">' + cop(d.credito.nuevos_cargos_periodo) + '</span></div>' +
  '</div>';

  var proveedoresCard = '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">🏪 Cuánto debo (a proveedores)</div>' +
    '<div class="kv"><span class="kv-label">Total por pagar</span><span class="kv-val" style="color:var(--red)">' + cop(d.proveedores.total_por_pagar) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Vencido</span><span class="kv-val" style="color:var(--red)">' + cop(d.proveedores.vencido) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Vence en 7 días</span><span class="kv-val" style="color:var(--accent)">' + cop(d.proveedores.vence_7_dias) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Vence en 15 días</span><span class="kv-val">' + cop(d.proveedores.vence_15_dias) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Pagado en el período</span><span class="kv-val" style="color:var(--green)">' + cop(d.proveedores.pagado_periodo) + '</span></div>' +
  '</div>';

  var mesasCard = '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">🪑 Mesas</div>' +
    '<div class="kv"><span class="kv-label">Ocupadas ahora</span><span class="kv-val" style="color:var(--accent)">' + d.mesas.ocupadas + '</span></div>' +
    '<div class="kv"><span class="kv-label">Libres</span><span class="kv-val">' + d.mesas.libres + '</span></div>' +
    '<div class="kv"><span class="kv-label">Atendidas en el período</span><span class="kv-val">' + d.mesas.atendidas_periodo + '</span></div>' +
    '<div class="kv"><span class="kv-label">Tiempo promedio de mesa</span><span class="kv-val">' + (d.mesas.tiempo_promedio_minutos != null ? d.mesas.tiempo_promedio_minutos + ' min' : '—') + '</span></div>' +
  '</div>';

  var cajaCard = d.caja ? '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">🔒 Caja</div>' +
    '<div class="kv"><span class="kv-label">Estado</span><span class="kv-val">' + (d.caja.status === 'OPEN' ? '🟢 Abierta' : d.caja.status === 'CLOSED' ? '🔒 Cerrada' : d.caja.status) + '</span></div>' +
    '<div class="kv"><span class="kv-label">Esperado actual</span><span class="kv-val" style="color:var(--accent)">' + cop(d.caja.esperado_actual) + '</span></div>' +
    (d.caja.status === 'CLOSED' && d.caja.difference != null ? '<div class="kv"><span class="kv-label">Última diferencia</span><span class="kv-val" style="color:' + (Number(d.caja.difference) >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (Number(d.caja.difference) >= 0 ? '+' : '') + cop(d.caja.difference) + '</span></div>' : '') +
  '</div>' : '';

  var operacionCard = '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-title">⚙️ Operación</div>' +
    '<div class="kv"><span class="kv-label">Hora pico</span><span class="kv-val">' + (d.operacion.hora_pico != null ? d.operacion.hora_pico + ':00' : '—') + '</span></div>' +
    '<div class="kv"><span class="kv-label">Anulaciones del período</span><span class="kv-val">' + d.operacion.anulaciones_periodo + '</span></div>' +
  '</div>';

  el.innerHTML = tabs + flujo +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0 16px">' +
      ventasCard + carteraCard + proveedoresCard + mesasCard + cajaCard + operacionCard +
    '</div>';
}
