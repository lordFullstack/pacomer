// ════════════════════════════════════════════════════════
// TICKET PAPEL RASGADO
// ════════════════════════════════════════════════════════
var ticketDatos = null;

function mostrarTicket(datos) {
  // datos: { mesa, tipo, personas, total, atendidoPor }
  ticketDatos = datos;
  var c = db.config;
  var ahora = new Date();
  var fechaFmt = ahora.toLocaleDateString('es-CO', {day:'2-digit',month:'2-digit',year:'numeric'});
  var horaFmt  = ahora.toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'});

  var logoHtml = c.logo_url
    ? '<img src="'+c.logo_url+'" class="ticket-logo" alt="logo">'
    : '<div class="ticket-logo-placeholder">🍽️</div>';

  var itemsHtml = '';
  if (datos.personas && datos.personas.length > 1) {
    datos.personas.forEach(function(p, i) {
      if (!p.pagada && !p.fiada) return;
      itemsHtml += '<div class="ticket-item">'+
        '<span class="ticket-item-name">Persona #'+(i+1)+(p.nota?' · '+p.nota:'')+'</span>'+
        '<span class="ticket-item-val">'+cop(p.valor)+'</span>'+
      '</div>';
    });
  } else {
    itemsHtml = '<div class="ticket-item">'+
      '<span class="ticket-item-name">'+datos.tipo+'</span>'+
      '<span class="ticket-item-val">'+cop(datos.total)+'</span>'+
    '</div>';
  }

  document.getElementById('ticket-content').innerHTML =
    '<div class="ticket-header">'+
      logoHtml+
      '<div class="ticket-nombre">'+(c.nombre_negocio||"Pa' Comer")+'</div>'+
      (c.cedula ? '<div class="ticket-cedula">CC/NIT: '+c.cedula+'</div>' : '')+
      (c.ciudad ? '<div class="ticket-ciudad">'+(c.ciudad||'')+(c.departamento?', '+c.departamento:'')+'</div>' : '')+
      (c.servicio ? '<div class="ticket-servicio">'+(c.servicio||'')+'</div>' : '')+
    '</div>'+

    '<div class="ticket-meta">'+
      '<div class="ticket-meta-row"><span>Fecha:</span><span>'+fechaFmt+'</span></div>'+
      '<div class="ticket-meta-row"><span>Hora:</span><span>'+horaFmt+'</span></div>'+
      (datos.mesa ? '<div class="ticket-meta-row"><span>Mesa:</span><span>'+datos.mesa+'</span></div>' : '')+
      (datos.tipo === 'llevar' ? '<div class="ticket-meta-row"><span>Tipo:</span><span>Para llevar</span></div>' : '')+
      (datos.tipo === 'domicilio' ? '<div class="ticket-meta-row"><span>Tipo:</span><span>Domicilio</span></div>' : '')+
    '</div>'+

    '<hr class="ticket-divider">'+

    '<div class="ticket-items">'+itemsHtml+'</div>'+

    '<hr class="ticket-divider-solid">'+

    '<div class="ticket-total-row">'+
      '<span class="ticket-total-label">TOTAL</span>'+
      '<span class="ticket-total-val">'+cop(datos.total)+'</span>'+
    '</div>'+

    '<hr class="ticket-divider">'+

    (datos.atendidoPor ? '<div class="ticket-atendido">Atendido por: '+datos.atendidoPor+'</div>' : '')+
    '<div class="ticket-footer">¡Gracias por su visita!<br>Vuelva pronto 😊</div>';

  openOverlay('ov-ticket');
}

function compartirTicketWA() {
  if (!ticketDatos) return;
  var c = db.config;
  var ahora = new Date();
  var fechaFmt = ahora.toLocaleDateString('es-CO', {day:'2-digit',month:'2-digit',year:'numeric'});
  var horaFmt  = ahora.toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'});

  var lineas = [];
  lineas.push('🍽️ *' + (c.nombre_negocio || "Pa' Comer") + '*');
  if (c.cedula)    lineas.push('CC/NIT: ' + c.cedula);
  if (c.ciudad)    lineas.push((c.ciudad||'') + (c.departamento ? ', ' + c.departamento : ''));
  if (c.servicio)  lineas.push(c.servicio);
  lineas.push('');
  lineas.push('📅 ' + fechaFmt + '  ⏰ ' + horaFmt);
  if (ticketDatos.mesa) lineas.push('🪑 Mesa: ' + ticketDatos.mesa);
  lineas.push('─────────────────────');

  if (ticketDatos.personas && ticketDatos.personas.length > 1) {
    ticketDatos.personas.forEach(function(p, i) {
      lineas.push('Persona #'+(i+1)+(p.nota?' · '+p.nota:'')+':  '+cop(p.valor));
    });
  } else {
    lineas.push(ticketDatos.tipo + ':  ' + cop(ticketDatos.total));
  }

  lineas.push('─────────────────────');
  lineas.push('💰 *TOTAL: ' + cop(ticketDatos.total) + '*');
  if (ticketDatos.atendidoPor) lineas.push('');
  if (ticketDatos.atendidoPor) lineas.push('Atendido por: ' + ticketDatos.atendidoPor);
  lineas.push('');
  lineas.push('¡Gracias por su visita! 🙏');

  var msg = lineas.join('\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}
