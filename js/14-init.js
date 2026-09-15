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
    setInterval(function(){ renderGrid(); renderStats(); }, 60000);
    cargarPantallaLogin();
    actualizarBadgeSync();
    sincronizarCola();
  }, wait);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function(err) {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
