// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
const MESAS = 20;

var db = {
  usuarioActivo: null,
  mesas: {},        // { numMesa: { personas:[{id,valor,nota,hora,pagada,fiada,clienteId}] } }
  llevar: [],       // [{id,valor,nota,hora}]
  domicilios: [],   // [{id,valor,nota,hora,direccion}]
  clientes: [],     // [{id,nombre,tel,nota,saldo,historial:[{id,tipo,desc,valor,fecha}]}]
  proveedores: [],  // [{id,nombre,tel,categoria,nota,pagos:[{id,valor,origen,desc,fecha}]}]
  movimientos: [],  // [{tipo,origen,valor,fechaStr,ts}]
  caja: {},          // {'YYYY-MM-DD':{apertura,gastos:[],cerrado,cierre}}
  config: {nombre_negocio:'Pa Comer', logo_url:'', direccion:''},
  usuarios: []       // [{id,nombre,pin,activo}]
};

var ui = {
  filtro: 'todas',
  regTipo: 'mesa',
  regMesa: null,
  regValor: 0,
  modalMesa: null,
  fiarPersonaId: null,
  fiarValor: 0,
  fiarClienteId: null,
  cliSel: null,
  provSel: null,
  editCliId: null,
  editProvId: null,
  compraRapidaPid: null,
  cajaTab: 'apertura',
  gastoOrigen: 'caja',
  pagoOrigen: 'caja'
};

// ════════════════════════════════════════════════════════
// SUPABASE
// ════════════════════════════════════════════════════════
var SUPABASE_URL = 'https://hqrjbgheclpnfoexyzyj.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxcmpiZ2hlY2xwbmZvZXh5enlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODY5MzEsImV4cCI6MjEwNTA2MjkzMX0.i86UaoR-Rn8rhGiZF8oO6apDfRhlH7S-OXy-ScxDzdI';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'public' } });
var PACOMER_TENANT_ID = '920201cb-b3d4-4d29-bed1-f6f628463a6e';

function sbErr(error, label) {
  if (error) { console.error(label, error); toast('Error sincronizando: '+label, 'err'); }
}
