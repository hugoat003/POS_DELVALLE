/* Prueba 3 — la cola offline (outbox), la semilla de mesas, la compactación
   y el ticket promedio. Aquí se prueba código del NAVEGADOR en Node, con un
   localStorage de mentira, porque es donde vive el riesgo de perder ventas. */
import { arranca, para, cliente, seccion, check, eq, cerca, resumen, linea, pagoEfectivo, uid, base } from "./harness.mjs";

// ---- localStorage de mentira, antes de importar nada del cliente ----
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
  key: (i) => [...almacen.keys()][i],
  get length() { return almacen.size; },
};
Object.defineProperty(globalThis.localStorage, Symbol.iterator, { value: undefined });

await arranca({ puerto: 5203 });

// `fetch` del cliente usa rutas relativas: se resuelven contra el laboratorio.
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opts) => fetchReal(String(url).startsWith("/") ? base() + url : url, opts);

const api = await import("../../src/lib/api.js");

const MENU = [{ id: "p_espresso", cat: "cafe", name: "Espresso", price: 12, sizes: null, mods: [], recipe: [{ id: "i_cafe", qty: 18 }] }];
const AREAS = [{ id: "salon", name: "Salón", tables: [{ id: "s1", label: "1", x: 10, y: 10 }] }];

const admin = cliente();
await admin.login("u1", "1234");
await admin.put("/api/state/cdv_menu", MENU);
await admin.put("/api/state/cdv_cats", [{ id: "cafe", name: "Café", station: "barra" }]);
await admin.put("/api/state/cdv_areas", AREAS);

const ordenOffline = (n) => ({
  id: uid("O"),
  number: 900 + n,
  time: "10:00",
  orderType: "Para llevar",
  table: null,
  lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  payment: pagoEfectivo(12),
  ts: Date.now(),
  cashier: "Luis Barrientos",
  encolada: true,
});

// ─────────────────────── 28. la cola offline con la caja cerrada
seccion("28. Ventas cobradas sin conexión, con la caja cerrada al reconectar");
{
  almacen.clear();
  api.setToken(admin.token);
  // Tres ventas reales, cobradas en efectivo mientras no había red.
  const ventas = [ordenOffline(1), ordenOffline(2), ordenOffline(3)];
  for (const v of ventas) api.enqueue("POST", "/api/orders", v);
  eq("hay 3 ventas en la cola", api.outboxSize(), 3);

  // La caja está cerrada (nunca se abrió en este servidor): el servidor
  // devolverá 409 "caja cerrada" por cada una.
  const st = await admin.get("/api/state");
  eq("la caja está cerrada", st.data.shift.open, false);

  await api.flushOutbox();

  const st2 = await admin.get("/api/state");
  const registradas = st2.data.orders.filter((o) => ventas.some((v) => v.id === o.id)).length;
  const apartadas = api.rejectedEntries();
  check("ninguna venta se pierde en silencio",
    api.outboxSize() + apartadas.length + registradas === 3,
    `cola ${api.outboxSize()}, apartadas ${apartadas.length}, registradas ${registradas} de 3`);
  eq("las 3 quedan apartadas para revisión", apartadas.length, 3);
  check("cada una conserva el motivo del rechazo", apartadas.every((e) => /caja cerrada/i.test(e.motivo)), JSON.stringify(apartadas.map((e) => e.motivo)));
  check("y conserva el importe cobrado", apartadas.every((e) => e.body.payment.total === 12));

  // Al abrir la caja, el reintento las registra.
  await admin.post("/api/shifts/open", { openingCash: 0 });
  await api.retryRejected();
  const st3 = await admin.get("/api/state");
  const recuperadas = st3.data.orders.filter((o) => ventas.some((v) => v.id === o.id)).length;
  eq("al reintentar con la caja abierta, las 3 ventas se recuperan", recuperadas, 3);
  eq("y la lista de apartadas queda vacía", api.rejectedSize(), 0);
}

// ─────────────────────── 29. la cola offline con la sesión vencida
seccion("29. Ventas sin conexión cuando la sesión venció (401)");
{
  almacen.clear();
  api.setToken("token-vencido-de-hace-12-horas");
  const ventas = [ordenOffline(11), ordenOffline(12)];
  for (const v of ventas) api.enqueue("POST", "/api/orders", v);
  eq("hay 2 ventas en la cola", api.outboxSize(), 2);

  await api.flushOutbox();

  check("un 401 NO puede vaciar la cola: las ventas siguen esperando",
    api.outboxSize() === 2,
    `la cola quedó en ${api.outboxSize()} — con 0, las ventas se perdieron al caducar la sesión`);
}

// ─────────────────────── 30. la cola vuelve a intentar cuando sí se puede
seccion("30. La cola sí debe vaciarse cuando el servidor puede aceptar");
{
  almacen.clear();
  api.setToken(admin.token);
  await admin.post("/api/shifts/open", { openingCash: 100 }); // puede dar 409 si ya está abierta
  const ventas = [ordenOffline(21), ordenOffline(22)];
  for (const v of ventas) api.enqueue("POST", "/api/orders", v);
  const vacia = await api.flushOutbox();
  eq("la cola se vacía", api.outboxSize(), 0);
  eq("y reporta éxito", vacia, true);
  const st = await admin.get("/api/state");
  const registradas = st.data.orders.filter((o) => ventas.some((v) => v.id === o.id)).length;
  eq("las 2 ventas quedaron registradas", registradas, 2);
}

// ─────────────────────── 31. semilla de mesas en una instalación nueva
seccion("31. Instalación nueva: ¿existe el candado de la mesa?");
{
  // Este servidor arrancó de cero y nadie editó las mesas todavía... salvo que
  // las subimos arriba. Se comprueba contra un servidor limpio aparte.
  await para();
  await arranca({ puerto: 5204, limpia: true });
  const a2 = cliente();
  await a2.login("u1", "1234");
  const st = await a2.get("/api/state");
  check("una instalación nueva tiene áreas de mesas en el servidor",
    Array.isArray(st.data.config.cdv_areas) && st.data.config.cdv_areas.length > 0,
    `cdv_areas = ${JSON.stringify(st.data.config.cdv_areas)}`);

  await a2.put("/api/state/cdv_menu", MENU);
  await a2.put("/api/state/cdv_cats", [{ id: "cafe", name: "Café", station: "barra" }]);
  await a2.post("/api/shifts/open", { openingCash: 0 });
  const sinMesa = await a2.post("/api/orders", {
    id: uid("O"), orderType: "Aquí", table: null, payment: pagoEfectivo(12),
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  check("en una instalación nueva, cobrar 'Aquí' sin mesa se rechaza",
    sinMesa.status === 400,
    `status ${sinMesa.status} — el candado de la mesa quedó inerte`);
}

// ─────────────────────── 32. ticket promedio y consumo de empleado
seccion("32. Ticket promedio del tablero del dueño");
{
  const a2 = cliente();
  await a2.login("u1", "1234");
  await a2.put("/api/state/cdv_areas", AREAS);
  const MESA1 = { id: "s1", label: "1", areaId: "salon", areaName: "Salón" };

  // Una venta real de Q12.
  await a2.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(12),
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  // Un consumo de empleado.
  const ab = await a2.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  await a2.post(`/api/orders/${ab.data.order.id}/enviar`);
  await a2.post(`/api/orders/${ab.data.order.id}/cobrar`, {
    payment: { method: "empleado", subtotal: 12, tip: 0, total: 0, empleado: "Ana" },
  });

  const d = (await a2.get("/api/dashboard")).data;
  cerca("las ventas del día son solo la venta real", d.hoy.ventas, 12);
  cerca("el ticket promedio debe ser Q12, no Q6",
    d.hoy.ticketPromedio, 12);
  eq("el conteo de órdenes debería excluir el consumo de empleado", d.hoy.ordenes, 1);
}

// ─────────────────────── 33. compactación de turnos viejos
seccion("33. Compactación de turnos antiguos");
{
  // Se cierra el turno y se envejece a mano en la base para forzar la
  // compactación en el siguiente arranque.
  const a2 = cliente();
  await a2.login("u1", "1234");
  const st = await a2.get("/api/state");
  const gastosEfectivo = 0;
  const efectivo = st.data.orders.filter((o) => !o.voided).reduce((s, o) => {
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    return s + parts.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.total, 0);
  }, 0);
  const cierre = await a2.post("/api/shifts/close", { countedCash: efectivo });
  eq("se cierra el turno para compactarlo", cierre.status, 200);
  const turno = cierre.data.state.shiftHistory.slice(-1)[0];

  await para();

  // Se envejece el turno 200 días y se reinicia: bootstrapDb compacta.
  const { default: Database } = await import("better-sqlite3");
  const path = await import("node:path");
  const { DATOS } = await import("./harness.mjs");
  const db = new Database(path.join(DATOS, "cdv.db"));
  db.prepare("UPDATE shifts SET closed_at = ? WHERE id = ?").run(Date.now() - 200 * 86400000, turno.id);
  db.close();

  await arranca({ puerto: 5205, limpia: false });
  const a3 = cliente();
  await a3.login("u1", "1234");
  const st3 = await a3.get("/api/state");
  const comp = st3.data.shiftHistory.find((s) => s.id === turno.id);
  check("el turno viejo quedó compactado", comp && comp.compacted === true, JSON.stringify(comp && comp.compacted));
  if (comp) {
    cerca("los totales compactados NO cuentan el consumo de empleado como venta",
      comp.totals.sales, 12);
    eq("ni lo cuentan como una orden vendida", comp.totals.count, 1);
  }
}

await para();
process.exit(resumen("OFFLINE, SEMILLA Y COMPACTACIÓN") ? 1 : 0);
