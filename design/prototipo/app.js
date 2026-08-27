/* ==========================================================================
   POS Café del Valle
   Implementation of "POS Cafe del Valle.dc.html" (Claude Design project
   8c949336-0d0a-4a27-a26a-ad9bfd10cff1).

   Money is handled in integer cents throughout; only format() ever divides.
   ========================================================================== */
'use strict';

/* ------------------------------- Catálogo ------------------------------- */

const MENU = [
  ['Café', 'Espresso', 12], ['Café', 'Americano', 15], ['Café', 'Cortado', 18], ['Café', 'Capuchino', 22],
  ['Café', 'Latte', 24], ['Café', 'Flat White', 23], ['Café', 'Mocha', 26], ['Café', 'Cold Brew', 25],
  ['Bebidas', 'Chocolate caliente', 22], ['Bebidas', 'Chai Latte', 25], ['Bebidas', 'Matcha Latte', 28],
  ['Bebidas', 'Limonada con hierbabuena', 18], ['Bebidas', 'Té helado de durazno', 16], ['Bebidas', 'Licuado de banano', 24],
  ['Panadería', 'Croissant de mantequilla', 15], ['Panadería', 'Pan de banano', 18], ['Panadería', 'Muffin de chocolate', 16],
  ['Panadería', 'Empanada de piña', 14], ['Panadería', 'Rol de canela', 20],
  ['Postres', 'Cheesecake de mora', 32], ['Postres', 'Tres leches', 30], ['Postres', 'Brownie con nuez', 20], ['Postres', 'Pie de limón', 28],
  ['Comida', 'Sándwich de pavo', 45], ['Comida', 'Bagel con queso crema', 28], ['Comida', 'Quiche de espinaca', 38], ['Comida', 'Ensalada César', 42]
].map(([cat, nombre, precio]) => ({ cat, nombre, precioCents: precio * 100 }));

const CATEGORIAS = ['Todo', 'Café', 'Bebidas', 'Panadería', 'Postres', 'Comida'];

const TINTES = {
  'Café':      ['#F0E4D5', '#8B5A2B'],
  'Bebidas':   ['#E9EDDC', '#4A5A24'],
  'Panadería': ['#F5E8D5', '#A0703C'],
  'Postres':   ['#F3E5DD', '#9B5B45'],
  'Comida':    ['#EBEEDF', '#55632C']
};

const ESTADOS = {
  'Abierta':    ['#F0EADF', '#5A4C3B'],
  'En barra':   ['#E9EDDC', '#41501F'],
  'Lista':      ['#F0E4D5', '#8B5A2B'],
  'Por cobrar': ['#F6E3D6', '#A85A28']
};

const METODOS = [
  { nombre: 'Efectivo',           nota: 'Cambio automático' },
  { nombre: 'Tarjeta',            nota: 'Visa · MC · Visanet' },
  { nombre: 'QR / Transferencia', nota: 'BAM, BI, Banrural' }
];

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '←'];

const IVA_RATE = 0.12;   // IVA already included in the listed price (Guatemala)
const TIP_RATE = 0.10;

/* -------------------------------- Helpers ------------------------------- */

const $ = (sel) => document.querySelector(sel);
const menuItem = (nombre) => MENU.find((m) => m.nombre === nombre);

function fmt(cents) {
  return 'Q' + (cents / 100).toFixed(2);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function linea(nombre, cant, detalle) {
  const m = menuItem(nombre);
  return { nombre, cant, detalle: detalle || '', precioCents: m ? m.precioCents : 0 };
}

/** Subtotal / IVA / propina / total for a set of lines. */
function calcular(lineas, conPropina) {
  const subtotal = lineas.reduce((s, l) => s + l.precioCents * l.cant, 0);
  const iva = Math.round(subtotal - subtotal / (1 + IVA_RATE));
  const propina = conPropina ? Math.round(subtotal * TIP_RATE) : 0;
  return { subtotal, iva, propina, total: subtotal + propina };
}

function lugarDe(o) {
  return o.tipo === 'Llevar' ? 'Para llevar' : 'Mesa ' + o.mesa;
}

function resumenItems(lineas) {
  return lineas
    .map((l) => l.cant + ' ' + l.nombre + (l.detalle ? ' (' + l.detalle + ')' : ''))
    .join(' · ');
}

function ahoraHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* --------------------------------- Estado -------------------------------- */

let folioSeq = 1188;
const nuevoFolio = () => '#A-' + folioSeq++;

/** Lowest table number not already taken by an open order. */
function mesaLibre() {
  const usadas = new Set(state.ordenes.filter((o) => o.tipo === 'Mesa').map((o) => o.mesa));
  if (state.orden && state.orden.tipo === 'Mesa') usadas.add(state.orden.mesa);
  let n = 1;
  while (usadas.has(n)) n++;
  return n;
}

function ordenNueva() {
  return {
    folio: nuevoFolio(),
    tipo: 'Mesa',
    mesa: mesaLibre(),
    hora: ahoraHHMM(),
    estado: 'Abierta',
    mesero: state.cajero,
    lineas: [],
    propina: true,
    nota: ''
  };
}

const state = {
  pantalla: 'ventas',
  cat: 'Todo',
  busqueda: '',
  metodo: 'Efectivo',
  recibidoBuf: '',
  cajero: 'María José',

  // The order being built at the till.
  orden: {
    folio: '#A-1187', tipo: 'Mesa', mesa: 4, hora: '10:31', estado: 'Abierta',
    mesero: 'María José', propina: true, nota: '',
    lineas: [
      linea('Capuchino', 2, 'Grande · leche deslactosada'),
      linea('Latte', 1, 'Mediano · doble shot'),
      linea('Croissant de mantequilla', 1, 'Calentado'),
      linea('Tres leches', 1, 'Para compartir')
    ]
  },

  // Other open orders (the current one is kept out of this list).
  ordenes: [
    {
      folio: '#A-1186', tipo: 'Mesa', mesa: 2, hora: '10:22', estado: 'En barra',
      mesero: 'Luis', propina: false, nota: '',
      lineas: [linea('Americano', 3), linea('Rol de canela', 2)]
    },
    {
      folio: '#A-1185', tipo: 'Llevar', mesa: null, hora: '10:18', estado: 'Lista',
      mesero: 'María José', propina: false, nota: '',
      lineas: [linea('Cold Brew', 1), linea('Bagel con queso crema', 1)]
    },
    {
      folio: '#A-1184', tipo: 'Mesa', mesa: 7, hora: '10:05', estado: 'Abierta',
      mesero: 'Ana', propina: false, nota: '',
      lineas: [linea('Matcha Latte', 2), linea('Cheesecake de mora', 1), linea('Ensalada César', 1)]
    },
    {
      folio: '#A-1183', tipo: 'Mesa', mesa: 1, hora: '09:58', estado: 'En barra',
      mesero: 'Luis', propina: false, nota: '',
      lineas: [linea('Espresso', 2, 'Doble'), linea('Empanada de piña', 1)]
    },
    {
      folio: '#A-1182', tipo: 'Mesa', mesa: 9, hora: '09:47', estado: 'Por cobrar',
      mesero: 'Ana', propina: true, nota: '',
      lineas: [linea('Quiche de espinaca', 2), linea('Limonada con hierbabuena', 2), linea('Brownie con nuez', 1)]
    }
  ]
};

/* --------------------------------- Acciones ------------------------------ */

function agregarProducto(nombre) {
  const existente = state.orden.lineas.find((l) => l.nombre === nombre && !l.detalle);
  if (existente) existente.cant += 1;
  else state.orden.lineas.push(linea(nombre, 1));
  render();
}

function cambiarCantidad(index, delta) {
  const l = state.orden.lineas[index];
  if (!l) return;
  l.cant += delta;
  if (l.cant <= 0) state.orden.lineas.splice(index, 1);
  render();
}

function quitarLinea(index) {
  state.orden.lineas.splice(index, 1);
  render();
}

function irA(pantalla) {
  state.pantalla = pantalla;
  if (pantalla === 'pago') state.recibidoBuf = '';
  render();
}

/** Push the current order onto the open list and start a fresh one. */
function guardarOrden(silencioso) {
  if (!state.orden.lineas.length) {
    toast('La orden está vacía');
    return false;
  }
  const i = state.ordenes.findIndex((o) => o.folio === state.orden.folio);
  if (i >= 0) state.ordenes[i] = state.orden;
  else state.ordenes.unshift(state.orden);

  const folio = state.orden.folio;
  state.orden = ordenNueva();
  if (!silencioso) toast('Orden ' + folio + ' guardada');
  render();
  return true;
}

function cargarOrden(folio) {
  const i = state.ordenes.findIndex((o) => o.folio === folio);
  if (i < 0) return;
  // Park the in-progress order first so nothing is lost.
  if (state.orden.lineas.length) {
    const j = state.ordenes.findIndex((o) => o.folio === state.orden.folio);
    if (j >= 0) state.ordenes[j] = state.orden;
    else state.ordenes.unshift(state.orden);
  }
  state.orden = state.ordenes.splice(state.ordenes.findIndex((o) => o.folio === folio), 1)[0];
  state.pantalla = 'ventas';
  render();
  toast('Orden ' + folio + ' abierta');
}

function confirmarPago() {
  const { total } = calcular(state.orden.lineas, state.orden.propina);
  const efectivo = state.metodo === 'Efectivo';
  const recibido = efectivo ? Math.round(parseFloat(state.recibidoBuf || '0') * 100) : total;
  if (!state.orden.lineas.length) return;
  if (efectivo && recibido < total) return;

  const folio = state.orden.folio;
  const cambio = recibido - total;

  // Paid orders leave the open list.
  const i = state.ordenes.findIndex((o) => o.folio === folio);
  if (i >= 0) state.ordenes.splice(i, 1);

  state.orden = ordenNueva();
  state.recibidoBuf = '';
  state.pantalla = 'ventas';
  render();
  toast(efectivo && cambio > 0
    ? 'Pago registrado · Cambio ' + fmt(cambio)
    : 'Pago registrado · ' + folio);
}

function pulsarTecla(t) {
  let b = state.recibidoBuf;
  if (t === '←') {
    b = b.slice(0, -1);
  } else if (t === '.') {
    if (!b.includes('.')) b = (b || '0') + '.';
  } else {
    if (b.includes('.') && b.split('.')[1].length >= 2) return;
    if (b === '0') b = t;
    else b += t;
    if (b.replace('.', '').length > 8) return;
  }
  state.recibidoBuf = b;
  renderPago();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* -------------------------------- Render --------------------------------- */

function renderNav() {
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.nav === state.pantalla);
  });
  $('#screen-ventas').hidden  = state.pantalla !== 'ventas';
  $('#screen-ordenes').hidden = state.pantalla !== 'ordenes';
  $('#screen-pago').hidden    = state.pantalla !== 'pago';
}

function renderCats() {
  $('#cats').innerHTML = CATEGORIAS.map((c) =>
    '<button type="button" class="chip' + (c === state.cat ? ' is-active' : '') +
    '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'
  ).join('');
}

function renderProductos() {
  const q = state.busqueda.trim().toLowerCase();
  const items = MENU.filter((p) => {
    const okCat = state.cat === 'Todo' || p.cat === state.cat;
    const okQ = !q || p.nombre.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q);
    return okCat && okQ;
  });

  if (!items.length) {
    $('#productos').innerHTML = '<div class="empty">Sin resultados para “' + esc(state.busqueda) + '”</div>';
    return;
  }

  $('#productos').innerHTML = items.map((p) => {
    const [bg, fg] = TINTES[p.cat];
    return '' +
      '<button type="button" class="product" data-add="' + esc(p.nombre) + '">' +
        '<div class="product__tile" style="background:' + bg + '; color:' + fg + '">' + esc(p.nombre.charAt(0)) + '</div>' +
        '<div class="product__meta">' +
          '<div class="product__name">' + esc(p.nombre) + '</div>' +
          '<div class="product__price num">' + fmt(p.precioCents) + '</div>' +
        '</div>' +
      '</button>';
  }).join('');
}

function renderOrden() {
  const o = state.orden;
  $('#ordenSub').textContent = lugarDe(o) + ' · ' + o.folio;

  document.querySelectorAll('[data-tipo]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tipo === o.tipo);
  });

  const cuerpo = o.lineas.map((l, i) => '' +
    '<div class="line">' +
      '<div class="line__qty num">' + l.cant + '</div>' +
      '<div class="line__body">' +
        '<div class="line__name">' + esc(l.nombre) + '</div>' +
        (l.detalle ? '<div class="line__detail">' + esc(l.detalle) + '</div>' : '') +
        '<div class="line__controls">' +
          '<button type="button" class="step" data-step="-1" data-i="' + i + '" aria-label="Quitar uno">−</button>' +
          '<button type="button" class="step" data-step="1" data-i="' + i + '" aria-label="Agregar uno">+</button>' +
          '<button type="button" class="step step--del" data-del="' + i + '" aria-label="Eliminar línea">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="line__total num">' + fmt(l.precioCents * l.cant) + '</div>' +
    '</div>'
  ).join('');

  const vacio = '<div class="lines__empty">Sin productos todavía.<br>Tocá un producto para agregarlo.</div>';

  $('#lineas').innerHTML =
    (o.lineas.length ? cuerpo : vacio) +
    (o.nota ? '<div class="line__detail" style="padding:12px 0 0">Nota: ' + esc(o.nota) + '</div>' : '') +
    '<button type="button" class="note-add" id="btnNota"><span>+</span> ' +
      (o.nota ? 'Editar nota de la orden' : 'Agregar nota a la orden') + '</button>';

  const t = calcular(o.lineas, o.propina);
  $('#tSubtotal').textContent = fmt(t.subtotal);
  $('#tIva').textContent      = fmt(t.iva);
  $('#tPropina').textContent  = fmt(t.propina);
  $('#tTotal').textContent    = fmt(t.total);
  $('#btnCobrarMonto').textContent = fmt(t.total) + ' →';

  $('#tipToggle').classList.toggle('is-on', o.propina);
  $('#tipToggle').setAttribute('aria-pressed', String(o.propina));

  const vacia = o.lineas.length === 0;
  $('#btnCobrar').disabled  = vacia;
  $('#btnGuardar').disabled = vacia;
}

function renderOrdenes() {
  const todas = state.ordenes;
  const suma = todas.reduce((s, o) => s + calcular(o.lineas, o.propina).total, 0);
  $('#ordenesResumen').textContent =
    todas.length + (todas.length === 1 ? ' activa' : ' activas') + ' · ' + fmt(suma) + ' en curso';

  if (!todas.length) {
    $('#ordenesGrid').innerHTML = '<div class="empty">No hay órdenes abiertas.</div>';
    return;
  }

  $('#ordenesGrid').innerHTML = todas.map((o) => {
    const [bg, fg] = ESTADOS[o.estado] || ESTADOS['Abierta'];
    const t = calcular(o.lineas, o.propina);
    return '' +
      '<button type="button" class="order-card" data-open="' + esc(o.folio) + '">' +
        '<div class="order-card__top">' +
          '<div>' +
            '<div class="order-card__place">' + esc(lugarDe(o)) + '</div>' +
            '<div class="order-card__folio">' + esc(o.folio) + ' · ' + esc(o.hora) + '</div>' +
          '</div>' +
          '<span class="status" style="background:' + bg + '; color:' + fg + '">' + esc(o.estado) + '</span>' +
        '</div>' +
        '<div class="order-card__items">' + esc(resumenItems(o.lineas)) + '</div>' +
        '<div class="order-card__foot">' +
          '<span class="order-card__who">' + esc(o.mesero) + '</span>' +
          '<span class="order-card__total num">' + fmt(t.total) + '</span>' +
        '</div>' +
      '</button>';
  }).join('');
}

function renderPago() {
  const o = state.orden;
  const t = calcular(o.lineas, o.propina);
  const efectivo = state.metodo === 'Efectivo';

  $('#pagoTitulo').textContent = 'Cobrar orden ' + o.folio;
  $('#pagoSub').textContent =
    lugarDe(o) + ' · ' + o.lineas.length + (o.lineas.length === 1 ? ' producto' : ' productos');

  $('#metodos').innerHTML = METODOS.map((m) => '' +
    '<button type="button" class="method' + (m.nombre === state.metodo ? ' is-active' : '') +
      '" data-metodo="' + esc(m.nombre) + '">' +
      '<span class="method__name">' + esc(m.nombre) + '</span>' +
      '<span class="method__note">' + esc(m.nota) + '</span>' +
    '</button>'
  ).join('');

  // Cash-only affordances
  $('#teclado').hidden = !efectivo;
  $('#rapidos').hidden = !efectivo;

  const recibido = efectivo ? Math.round(parseFloat(state.recibidoBuf || '0') * 100) : t.total;

  $('#recibidoLabel').textContent = efectivo ? 'Recibido' : 'A cobrar';
  const rEl = $('#recibido');
  if (efectivo) {
    rEl.textContent = state.recibidoBuf ? 'Q' + state.recibidoBuf : 'Q0.00';
    rEl.classList.toggle('is-empty', !state.recibidoBuf);
  } else {
    rEl.textContent = fmt(t.total);
    rEl.classList.remove('is-empty');
  }

  if (efectivo) {
    $('#teclado').innerHTML = TECLAS.map((k) =>
      '<button type="button" class="key" data-key="' + esc(k) + '">' + esc(k) + '</button>'
    ).join('');

    const arriba = (paso) => Math.ceil(t.total / paso) * paso;
    const sugeridos = [t.total, arriba(5000), arriba(10000), arriba(10000) + 10000]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4);
    $('#rapidos').innerHTML = sugeridos.map((v, i) =>
      '<button type="button" data-quick="' + (v / 100).toFixed(2) + '">' +
        (i === 0 ? 'Exacto · ' + fmt(v) : fmt(v)) +
      '</button>'
    ).join('');
  }

  $('#resumenLineas').innerHTML = o.lineas.length
    ? o.lineas.map((l) => '' +
        '<div class="summary__line">' +
          '<span class="summary__qty num">' + l.cant + '×</span>' +
          '<span class="summary__name">' + esc(l.nombre) + '</span>' +
          '<span class="summary__amt num">' + fmt(l.precioCents * l.cant) + '</span>' +
        '</div>').join('')
    : '<div class="lines__empty">Orden vacía.</div>';

  $('#pTotal').textContent = fmt(t.total);
  $('#pRecibidoLabel').textContent = efectivo ? 'Efectivo recibido' : state.metodo;
  $('#pRecibido').textContent = fmt(recibido);

  const diff = recibido - t.total;
  const insuficiente = efectivo && diff < 0;
  const falta = insuficiente && state.recibidoBuf !== '';   // don't shout before any input
  $('#cambioWrap').classList.toggle('change--short', falta);
  $('#cambioLabel').textContent = falta ? 'Faltan' : 'Cambio';
  $('#cambio').textContent = fmt(efectivo ? Math.max(0, falta ? -diff : diff) : 0);

  $('#btnConfirmar').disabled = !o.lineas.length || insuficiente;
}

function renderReloj() {
  const d = new Date();
  $('#reloj').textContent =
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

  const part = (opt) => new Intl.DateTimeFormat('es-GT', opt)
    .format(d).replace(/\.$/, '');
  const dia = part({ weekday: 'short' });
  const mes = part({ month: 'short' });
  $('#fecha').textContent =
    dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + d.getDate() + ' ' + mes;
}

function renderCajero() {
  $('#cajero').textContent = state.cajero;
  $('#avatar').textContent = state.cajero
    .split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

function render() {
  renderNav();
  if (state.pantalla === 'ventas') {
    renderCats();
    renderProductos();
    renderOrden();
  } else if (state.pantalla === 'ordenes') {
    renderOrdenes();
  } else if (state.pantalla === 'pago') {
    renderOrden();   // keeps totals in sync behind the pay screen
    renderPago();
  }
}

/* -------------------------------- Eventos -------------------------------- */

document.addEventListener('click', (e) => {
  const t = e.target;

  const nav = t.closest('[data-nav]');
  if (nav) return irA(nav.dataset.nav);

  const cat = t.closest('[data-cat]');
  if (cat) { state.cat = cat.dataset.cat; return render(); }

  const add = t.closest('[data-add]');
  if (add) return agregarProducto(add.dataset.add);

  const step = t.closest('[data-step]');
  if (step) return cambiarCantidad(Number(step.dataset.i), Number(step.dataset.step));

  const del = t.closest('[data-del]');
  if (del) return quitarLinea(Number(del.dataset.del));

  const tipo = t.closest('[data-tipo]');
  if (tipo) {
    state.orden.tipo = tipo.dataset.tipo;
    if (state.orden.tipo === 'Mesa' && !state.orden.mesa) state.orden.mesa = mesaLibre();
    return render();
  }

  const open = t.closest('[data-open]');
  if (open) return cargarOrden(open.dataset.open);

  const met = t.closest('[data-metodo]');
  if (met) { state.metodo = met.dataset.metodo; state.recibidoBuf = ''; return renderPago(); }

  const key = t.closest('[data-key]');
  if (key) return pulsarTecla(key.dataset.key);

  const quick = t.closest('[data-quick]');
  if (quick) { state.recibidoBuf = quick.dataset.quick; return renderPago(); }

  if (t.closest('#tipToggle')) {
    state.orden.propina = !state.orden.propina;
    return render();
  }

  if (t.closest('#btnNota')) {
    const v = window.prompt('Nota para la orden', state.orden.nota || '');
    if (v !== null) { state.orden.nota = v.trim(); render(); }
    return;
  }

  if (t.closest('#btnGuardar')) return void guardarOrden(false);
  if (t.closest('#btnCobrar'))  return irA('pago');
  if (t.closest('#btnVolver'))  return irA('ventas');
  if (t.closest('#btnConfirmar')) return confirmarPago();

  if (t.closest('#buscarClear')) {
    state.busqueda = '';
    $('#buscar').value = '';
    $('#buscarClear').hidden = true;
    return render();
  }

  if (t.closest('#cerrarTurno')) {
    const abiertas = state.ordenes.length + (state.orden.lineas.length ? 1 : 0);
    if (abiertas) {
      toast('Quedan ' + abiertas + ' órdenes abiertas · cerrá o cobrá antes de terminar el turno');
      return;
    }
    toast('Turno cerrado · ' + state.cajero);
    return;
  }
});

$('#buscar').addEventListener('input', (e) => {
  state.busqueda = e.target.value;
  $('#buscarClear').hidden = !state.busqueda;
  if (state.pantalla !== 'ventas') state.pantalla = 'ventas';
  render();
});

document.addEventListener('keydown', (e) => {
  const enInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  if (e.key === 'Escape' && !enInput) {
    if (state.pantalla === 'pago') return irA('ventas');
  }

  // Keypad shortcuts, cash only.
  if (state.pantalla === 'pago' && !enInput && state.metodo === 'Efectivo') {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); return pulsarTecla(e.key); }
    if (e.key === '.' || e.key === ',') { e.preventDefault(); return pulsarTecla('.'); }
    if (e.key === 'Backspace') { e.preventDefault(); return pulsarTecla('←'); }
    if (e.key === 'Enter') { e.preventDefault(); return confirmarPago(); }
  }
});

/* --------------------------------- Arranque ------------------------------ */

renderCajero();
renderReloj();
setInterval(renderReloj, 15000);
render();
