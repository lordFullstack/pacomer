// ════════════════════════════════════════════════════════
// PERSISTENCIA (respaldo local — Supabase es la fuente real)
// ════════════════════════════════════════════════════════
// NOTA: load() consulta el schema legacy ('pos_pacomer' / tablas planas como
// mesa_personas, clientes, etc.) que ya no existe en el backend actual
// (ver docs/context/HANDOFF_INTEGRACION_02_LOGIN.md). Todas sus llamadas
// devuelven error 404 y el catch cae al respaldo local silenciosamente —
// no rompe el arranque, pero es codigo muerto en la practica. Los modulos
// reales cargan sus datos con las funciones cargar*() de cada archivo
// (cargarMesas, cargarClientes, cargarCajaActual, etc.). Se deja intacto
// aqui a proposito: limpiar codigo muerto es alcance de Loop 14, no de
// esta reestructuracion de archivos.
function save() { try { localStorage.setItem('pacomer_v20', JSON.stringify(db)); } catch(e){} }

function load() {
  return Promise.all([
    sb.from('mesa_personas').select('*'),
    sb.from('llevar').select('*'),
    sb.from('domicilios').select('*'),
    sb.from('clientes').select('*'),
    sb.from('cliente_historial').select('*'),
    sb.from('proveedores').select('*'),
    sb.from('proveedor_movimientos').select('*'),
    sb.from('movimientos').select('*'),
    sb.from('caja').select('*'),
    sb.from('caja_gastos').select('*'),
    sb.from('config').select('*'),
    sb.from('usuarios').select('*')
  ]).then(function(r){
    var errs = r.map(function(x){return x.error;}).filter(Boolean);
    if (errs.length) { console.error(errs); toast('Error cargando datos de Supabase','err'); }

    db.mesas = {};
    (r[0].data||[]).forEach(function(p){
      var n = p.mesa_numero;
      if (!db.mesas[n]) db.mesas[n] = {personas:[]};
      db.mesas[n].personas.push({id:p.id, valor:Number(p.valor), nota:p.nota||'', hora:new Date(p.hora).getTime(), pagada:p.pagada, fiada:p.fiada, clienteId:p.cliente_id});
    });

    db.llevar = (r[1].data||[]).map(function(x){ return {id:x.id, valor:Number(x.valor), nota:x.nota||'', hora:new Date(x.hora).getTime()}; });
    db.domicilios = (r[2].data||[]).map(function(x){ return {id:x.id, valor:Number(x.valor), nota:x.nota||'', hora:new Date(x.hora).getTime(), direccion:x.direccion||''}; });

    var histByCliente = {};
    (r[4].data||[]).forEach(function(h){
      if (!histByCliente[h.cliente_id]) histByCliente[h.cliente_id] = [];
      histByCliente[h.cliente_id].push({id:h.id, tipo:h.tipo, desc:h.descripcion, valor:Number(h.valor), fecha:new Date(h.fecha).getTime()});
    });
    db.clientes = (r[3].data||[]).map(function(c){
      return {id:c.id, nombre:c.nombre, tel:c.tel||'', nota:c.nota||'', saldo:Number(c.saldo), historial:(histByCliente[c.id]||[]).sort(function(a,b){return b.fecha-a.fecha;})};
    });

    var movByProv = {};
    (r[6].data||[]).forEach(function(m){
      if (!movByProv[m.proveedor_id]) movByProv[m.proveedor_id] = [];
      movByProv[m.proveedor_id].push({id:m.id, tipo:m.tipo, desc:m.descripcion, valor:Number(m.valor), origen:m.origen, fecha:new Date(m.fecha).getTime()});
    });
    db.proveedores = (r[5].data||[]).map(function(p){
      return {id:p.id, nombre:p.nombre, tel:p.tel||'', categoria:p.categoria||'', nota:p.nota||'', movimientos:(movByProv[p.id]||[]).sort(function(a,b){return a.fecha-b.fecha;})};
    });

    db.movimientos = (r[7].data||[]).map(function(m){ return {tipo:m.tipo, origen:m.origen, valor:Number(m.valor), fechaStr:m.fecha_str, ts:new Date(m.ts).getTime()}; });

    var gastosByFecha = {};
    (r[9].data||[]).forEach(function(g){
      if (!gastosByFecha[g.caja_fecha]) gastosByFecha[g.caja_fecha] = [];
      gastosByFecha[g.caja_fecha].push({id:g.id, desc:g.descripcion, valor:Number(g.valor), origen:g.origen, fecha:new Date(g.fecha).getTime()});
    });
    db.caja = {};
    (r[8].data||[]).forEach(function(c){
      db.caja[c.fecha] = {apertura:Number(c.apertura), gastos:gastosByFecha[c.fecha]||[], cerrado:c.cerrado, cierre:c.cierre};
    });

    var cfg = (r[10].data||[])[0];
    db.config = cfg ? {nombre_negocio:cfg.nombre_negocio||"Pa' Comer", logo_url:cfg.logo_url||'', direccion:cfg.direccion||'', cedula:cfg.cedula||'1072523641', ciudad:cfg.ciudad||'Montelibano', departamento:cfg.departamento||'Córdoba', servicio:cfg.servicio||'Servicio de comedor'} : {nombre_negocio:"Pa' Comer", logo_url:'', direccion:'', cedula:'1072523641', ciudad:'Montelibano', departamento:'Córdoba', servicio:'Servicio de comedor'};
    db.usuarios = (r[11].data||[]).map(function(u){ return {id:u.id, nombre:u.nombre, pin:u.pin, activo:u.activo, rol:u.rol||'cajero'}; });

    save();
  }).catch(function(e){
    console.error(e); toast('Sin conexión a Supabase, usando respaldo local','err');
    try {
      var raw = localStorage.getItem('pacomer_v20');
      if (raw) { var saved = JSON.parse(raw); Object.keys(saved).forEach(function(k){ db[k] = saved[k]; }); }
    } catch(e2){}
  });
}
