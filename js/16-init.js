// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
var splashStart = Date.now();
load().then(function(){
  var logo = document.getElementById('splash-logo');
  if (db.config.logo_url) logo.innerHTML = '<img src="'+db.config.logo_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:20px">';
  document.getElementById('splash-name').textContent = db.config.nombre_negocio || 'Pa\'Comer';

  var elapsed = Date.now()-splashStart;
  var wait = Math.max(0, 1200-elapsed);
  setTimeout(function(){
    document.getElementById('splash').classList.add('hide');
    setTipo('mesa');
    renderTodo();
    // Antes solo volvia a dibujar con los datos que ya estaban en memoria
    // (nunca los volvia a pedir al servidor), asi que un cambio hecho desde
    // otro dispositivo (celular <-> escritorio) nunca aparecia hasta
    // reiniciar sesion. Ahora si vuelve a consultar Mesas cada 15s.
    setInterval(function(){
      if (!ui.usuarioActual) return;
      cargarMesas().then(renderTodo);
      cargarOrdenesRecientes().then(renderStats);
      // Mismo problema que Mesas: si la caja se abre/cierra desde otro
      // dispositivo, este no se enteraba hasta reiniciar sesion o entrar
      // a la pestaña de Caja. No repinta nada por si solo (evita borrar
      // un arqueo a medio escribir), solo mantiene db.cajaActual al dia
      // para los chequeos de "abre la caja antes de..." en Mesas.
      cargarCajaActual();
    }, 15000);
    cargarPantallaLogin();
    actualizarBadgeSync();
    sincronizarCola();
  }, wait);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').then(function(reg) {
      if (reg.waiting) mostrarBannerActualizacion();
      reg.addEventListener('updatefound', function() {
        var nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', function() {
          // "installed" + ya hay un controller = es una actualizacion
          // (no la primera instalacion, que no tiene controller todavia).
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarBannerActualizacion();
        });
      });
      // Los navegadores no siempre chequean solos una PWA que se queda
      // abierta todo el turno — se pide explicitamente al volver a
      // primer plano y cada 5 minutos mientras sigue abierta.
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') reg.update().catch(function(){});
      });
      setInterval(function() { reg.update().catch(function(){}); }, 5*60*1000);
    }).catch(function(err) {
      console.warn('No se pudo registrar el service worker:', err);
    });

    var recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (recargando) return;
      recargando = true;
      window.location.reload();
    });
  });
}

function mostrarBannerActualizacion() {
  if (document.getElementById('sw-update-banner')) return;
  var b = document.createElement('div');
  b.id = 'sw-update-banner';
  b.className = 'sw-update-banner';
  b.innerHTML = '<span>🔄 Nueva versión disponible</span><button onclick="aplicarActualizacionPWA()">Actualizar</button>';
  document.body.appendChild(b);
}

function aplicarActualizacionPWA() {
  navigator.serviceWorker.getRegistration().then(function(reg) {
    if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
  });
  var b = document.getElementById('sw-update-banner');
  if (b) b.remove();
}
