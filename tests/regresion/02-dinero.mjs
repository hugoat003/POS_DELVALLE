/* Prueba 2 — dinero y datos: comida de empleado, respaldo/restauración,
   coherencia entre reportes, compactación, inventario avanzado y seguridad. */
import { arranca, para, cliente, seccion, check, eq, cerca, resumen, linea, pagoEfectivo, uid } from "./harness.mjs";
import { computeProfit, esVenta } from "../../src/lib/profit.js";
import { computeKpis } from "../../src/lib/reportStats.js";

await arranca({ puerto: 5201 });

const MENU = [
  { id: "p_espresso", cat: "cafe", name: "Espresso", price: 12, sizes: null, mods: [],
    recipe: [{ id: "i_cafe", qty: 18 }, { id: "i_vaso", qty: 1 }] },
  { id: "p_capuchino", cat: "cafe", name: "Capuchino", price: 25, sizes: null, mods: ["leche"],
    recipe: [{ id: "i_cafe", qty: 18 }, { id: "i_leche", qty: 180 }, { id: "i_vaso", qty: 1 }] },
  { id: "p_tres_leches", cat: "postres", name: "Tres leches", price: 30, sizes: null, mods: [], recipe: [] },
];
const CATS = [
  { id: "cafe", name: "Café", station: "barra" },
  { id: "postres", name: "Postres", station: "cocina" },
];
const AREAS = [{ id: "salon", name: "Salón", tables: [{ id: "s1", label: "1", x: 10, y: 10 }, { id: "s2", label: "2", x: 50, y: 10 }] }];
const MESA1 = { id: "s1", label: "1", areaId: "salon", areaName: "Salón" };

const admin = cliente();
const cajero = cliente();
await admin.login("u1", "1234");
await cajero.login("u2", "1111");
await admin.put("/api/state/cdv_menu", MENU);
await admin.put("/api/state/cdv_cats", CATS);
await admin.put("/api/state/cdv_areas", AREAS);
await admin.post("/api/shifts/open", { openingCash: 100 });

const estado = async () => (await admin.get("/api/state")).data;

// ─────────────────────────────────────────── 17. costo derivado de la compra
seccion("17. Inventario: costo derivado de la unidad de compra");
{
  const st = await estado();
  const cafe = st.ingredients.find((i) => i.id === "i_cafe");
  // 1 lb (453.59237 g) por Q90 → Q0.198416/g
  cerca("el costo por gramo se deriva del precio de la libra", cafe.cost, 90 / 453.59237, 1e-5);
  eq("la unidad de compra se conserva", cafe.purchaseUnit, "lb");

  // Compra en unidad de presentación: 2 libras.
  const antes = cafe.stock;
  const compra = await admin.post("/api/stock/moves", {
    ingredientId: "i_cafe", amount: 2, reason: "compra", mode: "delta", unitMode: "purchase", note: "factura 123",
  });
  eq("se registra una compra en libras", compra.status, 200);
  cerca("2 libras entran como 907.18 g", compra.data.ingredient.stock, antes + 2 * 453.59237, 0.01);

  const moves = (await admin.get("/api/stock/moves?limit=20")).data;
  const ult = moves.find((m) => m.note === "factura 123");
  check("el kardex guarda lo que se tecleó (2 lb)", ult && ult.enteredQty === 2 && ult.enteredUnit === "lb", JSON.stringify(ult));

  // Conteo físico: modo "set".
  const set = await admin.post("/api/stock/moves", { ingredientId: "i_vaso", amount: 111, reason: "ajuste", mode: "set" });
  eq("un conteo físico deja el stock en el valor contado", set.data.ingredient.stock, 111);

  // Cambiar la unidad base de un ingrediente con historia se rechaza.
  const cambio = await admin.post("/api/ingredients", { id: "i_cafe", name: "Café en grano", unit: "ml" });
  eq("no se puede cambiar la unidad base de un ingrediente con movimientos", cambio.status, 400);

  // Contenido de empaque en cero → división por cero en el costo.
  const cero = await admin.post("/api/ingredients", { name: "Nuevo", purchaseFactor: 0, purchasePrice: 10 });
  eq("un contenido de empaque en cero se rechaza", cero.status, 400);
}

// ───────────────────────────────────────────────── 18. comida de empleado
seccion("18. Comida de empleado");
let ordenEmpleado = null;
{
  const st0 = await estado();
  const cafe0 = st0.ingredients.find((i) => i.id === "i_cafe").stock;
  const gastos0 = st0.expenses.length;
  const cafeIng = st0.ingredients.find((i) => i.id === "i_cafe");
  const lecheIng = st0.ingredients.find((i) => i.id === "i_leche");
  const vasoIng = st0.ingredients.find((i) => i.id === "i_vaso");
  const costoEsperado = Math.round((18 * cafeIng.cost + 180 * lecheIng.cost + 1 * vasoIng.cost) * 100) / 100;

  const l = linea({ productId: "p_capuchino", name: "Capuchino", catId: "cafe", price: 25 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l], orderType: "Aquí", table: MESA1 });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);

  const st1 = await estado();
  cerca("el consumo de empleado SÍ descuenta inventario al enviarse", st1.ingredients.find((i) => i.id === "i_cafe").stock, cafe0 - 18);

  const cob = await cajero.post(`/api/orders/${id}/cobrar`, {
    payment: { method: "empleado", subtotal: 25, tip: 0, total: 0, empleado: "Luis" },
  });
  eq("se cierra como consumo de empleado", cob.status, 200);
  ordenEmpleado = cob.data.order;
  check("el servidor devuelve el costo calculado", !!cob.data.consumo, JSON.stringify(cob.data.consumo));
  cerca("el costo es el de los materiales, no el precio de venta", cob.data.consumo.costo, costoEsperado);
  eq("y registra a quién se le dio", cob.data.consumo.empleado, "Luis");

  const st2 = await estado();
  eq("se creó un gasto", st2.expenses.length, gastos0 + 1);
  const gasto = st2.expenses.find((e) => e.id === "Ge:" + id);
  check("el gasto existe con id determinista", !!gasto);
  eq("el gasto NO sale de la caja (método 'otro')", gasto.method, "otro");
  eq("el gasto es una salida", gasto.kind, "salida");
  cerca("el importe del gasto es el costo de materiales", gasto.amount, costoEsperado);
  check("el concepto nombra al empleado y la orden", /Luis/.test(gasto.concept) && /#/.test(gasto.concept), gasto.concept);
}

// ──────────────── 19. el consumo de empleado no debe contaminar los reportes
seccion("19. El consumo de empleado no cuenta como venta (en TODAS las pantallas)");
{
  // Una venta normal en el mismo turno, para comparar.
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  await cajero.post("/api/orders", { id: uid("O"), lines: [l], payment: pagoEfectivo(12), orderType: "Para llevar" });

  const st = await estado();
  const ventasReales = 12; // solo el espresso
  const dash = (await admin.get("/api/dashboard")).data;
  cerca("el tablero del dueño NO cuenta el consumo como venta", dash.hoy.ventas, ventasReales);

  // Reportes (computeKpis) — la pantalla de Reportes.
  const kpis = computeKpis(st.orders, st.expenses);
  eq("Reportes excluye la orden de empleado del conteo", kpis.count, 1);
  cerca("Reportes no suma su importe", kpis.total, 12);

  // Ganancia neta (computeProfit) — tarjeta de ganancia.
  const prof = computeProfit(st.orders, st.expenses, MENU, {}, st.ingredients);
  cerca("la ganancia neta cuenta solo la venta real como ingreso", prof.revenue, 12);
  const gastoEmpleado = st.expenses.find((e) => e.id.startsWith("Ge:")).amount;
  cerca("y el consumo aparece una sola vez, como gasto", prof.expenses, gastoEmpleado);

  // El costo del consumo NO puede estar además en el costo de ventas.
  const costoEspresso = Math.round((18 * st.ingredients.find((i) => i.id === "i_cafe").cost + st.ingredients.find((i) => i.id === "i_vaso").cost) * 100) / 100;
  cerca("el costo de ventas NO incluye el consumo de empleado", prof.cogs, costoEspresso, 0.02);

  // ── Resumen: usa el MISMO criterio compartido que Reportes ──
  const validosResumen = st.orders.filter(esVenta);
  const ventasResumen = validosResumen.reduce((s, o) => s + (o.payment.subtotal || 0), 0);
  cerca("Resumen debe mostrar las mismas ventas que Reportes", ventasResumen, ventasReales);
  eq("Resumen debe contar las mismas órdenes que Reportes", validosResumen.length, kpis.count);

  // El arqueo no se puede ver afectado.
  const efectivo = st.orders.filter((o) => !o.voided).reduce((s, o) => {
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    return s + parts.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.total, 0);
  }, 0);
  cerca("el consumo de empleado no mete efectivo en la caja", efectivo, 12);
}

// ──────────────────────────────────────── 20. cierre con consumo de empleado
seccion("20. El arqueo cuadra aunque haya consumo de empleado");
{
  const st = await estado();
  const efectivo = 12;
  const gastosEfectivo = st.expenses.filter((e) => e.method === "efectivo" && e.kind !== "entrada").reduce((s, e) => s + e.amount, 0);
  const esperado = 100 + efectivo - gastosEfectivo;
  const cierre = await cajero.post("/api/shifts/close", { countedCash: esperado });
  eq("se cierra la caja", cierre.status, 200);
  const turno = cierre.data.state.shiftHistory.slice(-1)[0];
  cerca("el esperado NO incluye el consumo de empleado", turno.expected, esperado);
  cerca("la diferencia es cero", turno.diff, 0);
  cerca("los gastos en efectivo del turno son 0 (el consumo fue 'otro')", turno.cashExpenses, 0);
}

// ────────────────────────────────────────────── 21. respaldo y restauración
seccion("21. Respaldo y restauración");
{
  await admin.post("/api/shifts/open", { openingCash: 300 });
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  await cajero.post("/api/orders", { id: uid("O"), lines: [l], payment: pagoEfectivo(12), orderType: "Para llevar" });
  await cajero.post("/api/expenses", { id: uid("G"), concept: "Gasto del turno", amount: 40, method: "efectivo", kind: "salida" });
  // Una cuenta de mesa viva: el respaldo no puede perder el servicio en curso.
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })], orderType: "Aquí", table: MESA1 });
  await cajero.post(`/api/orders/${ab.data.order.id}/enviar`);

  const antes = await estado();
  const resp = await admin.get("/api/backup");
  eq("el respaldo se genera", resp.status, 200);
  const copia = resp.data;
  check("el respaldo incluye el menú", (copia.menu || []).length > 0);
  check("el respaldo incluye el historial de turnos", (copia.shiftHistory || []).length > 0);
  check("el respaldo incluye los gastos del turno", (copia.expenses || []).length > 0, "n=" + (copia.expenses || []).length);
  check("el respaldo incluye las cuentas de mesa abiertas", (copia.openOrders || []).length > 0, "n=" + (copia.openOrders || []).length);
  check("el respaldo incluye el inventario", (copia.ingredients || []).length > 0);
  check("el respaldo incluye el kardex", (copia.stockMoves || []).length > 0);

  // Restaurar sobre sí mismo tiene que dejar todo igual.
  const rest = await admin.post("/api/restore", copia);
  eq("la restauración responde OK", rest.status, 200);

  const despues = await estado();
  eq("vuelven las mismas ventas del turno", despues.orders.length, antes.orders.length);
  eq("vuelven los mismos gastos", despues.expenses.length, antes.expenses.length);
  eq("vuelven las cuentas de mesa abiertas", despues.openOrders.length, antes.openOrders.length);
  eq("vuelve el historial de turnos", despues.shiftHistory.length, antes.shiftHistory.length);
  eq("vuelve el inventario completo", despues.ingredients.length, antes.ingredients.length);
  cerca("el stock de café se conserva",
    despues.ingredients.find((i) => i.id === "i_cafe").stock,
    antes.ingredients.find((i) => i.id === "i_cafe").stock);

  const gastosAntes = antes.shiftHistory.reduce((s, t) => s + (t.expenses || []).length, 0);
  const gastosDespues = despues.shiftHistory.reduce((s, t) => s + (t.expenses || []).length, 0);
  eq("los gastos de los turnos archivados también vuelven", gastosDespues, gastosAntes);

  const respInv = await admin.post("/api/restore", { basura: true });
  eq("un archivo que no es respaldo se rechaza", respInv.status, 400);
}

// ─────────────────────────────────── 22. borrar gastos: permisos y alcance
seccion("22. Borrado de gastos");
{
  const st = await estado();
  const gastoEmpleado = st.shiftHistory.flatMap((t) => t.expenses || []).find((e) => e.id.startsWith("Ge:"));
  if (gastoEmpleado) {
    const r = await cajero.del(`/api/expenses/${encodeURIComponent(gastoEmpleado.id)}`);
    const st2 = await estado();
    const sigue = st2.shiftHistory.flatMap((t) => t.expenses || []).some((e) => e.id === gastoEmpleado.id);
    check("un gasto de un turno YA CERRADO no se debería poder borrar", sigue,
      `status ${r.status}; el gasto de un arqueo cerrado ${sigue ? "sigue" : "DESAPARECIÓ"}`);
  } else {
    check("se encontró el gasto de empleado en el historial", false, "no había");
  }
}

// ──────────────────────────────────────── 23. reabrir turno y borrar órdenes
seccion("23. Reabrir turno y borrado de órdenes del turno");
{
  const st = await estado();
  eq("hay un turno abierto ahora mismo", st.shift.open, true);
  const hist = st.shiftHistory.slice(-1)[0];
  const re = await admin.post(`/api/shifts/${hist.id}/reopen`);
  eq("no se puede reabrir un turno con otro abierto", re.status, 409);

  const cajeroRe = await cajero.post(`/api/shifts/${hist.id}/reopen`);
  eq("el cajero no puede reabrir turnos", cajeroRe.status, 403);

  // Borrado de órdenes del turno: devuelve inventario de TODO, incluso mesas vivas.
  const cafeAntes = st.ingredients.find((i) => i.id === "i_cafe").stock;
  const abiertasAntes = st.openOrders.length;
  const cobradasAntes = st.orders.length;
  check("hay una cuenta de mesa viva antes de borrar", abiertasAntes > 0, "n=" + abiertasAntes);

  const cl = await admin.post("/api/orders/clear", {});
  eq("el gerente puede borrar las órdenes del turno", cl.status, 200);
  eq("informa cuántas cobradas se borraron", cl.data.cobradas, cobradasAntes);
  eq("informa cuántas cuentas de mesa se destruyeron", cl.data.abiertas, abiertasAntes);

  const st2 = await estado();
  eq("no quedan órdenes", st2.orders.length, 0);
  eq("no quedan cuentas abiertas", st2.openOrders.length, 0);
  check("el inventario de lo borrado volvió al stock",
    st2.ingredients.find((i) => i.id === "i_cafe").stock > cafeAntes,
    `antes ${cafeAntes}, después ${st2.ingredients.find((i) => i.id === "i_cafe").stock}`);
}

// ─────────────────────────────────── 24. anular una venta ya cobrada
seccion("24. Anular una venta cobrada");
{
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12, qty: 3 });
  const id = uid("O");
  await cajero.post("/api/orders", { id, lines: [l], payment: pagoEfectivo(36), orderType: "Para llevar" });
  const st = await estado();
  const cafe = st.ingredients.find((i) => i.id === "i_cafe").stock;

  const an = await cajero.post(`/api/orders/${id}/void`, { reason: "se equivocó el cajero" });
  eq("se puede anular una venta cobrada", an.status, 200);
  const st2 = await estado();
  cerca("el inventario vuelve (3 × 18 g)", st2.ingredients.find((i) => i.id === "i_cafe").stock, cafe + 54);
  const orden = st2.orders.find((o) => o.id === id);
  eq("la orden queda en el historial marcada como anulada", orden.voided, true);
  eq("y conserva el motivo", orden.voidReason, "se equivocó el cajero");

  await cajero.post(`/api/orders/${id}/void`, { reason: "otra vez" });
  const st3 = await estado();
  cerca("anular dos veces NO devuelve el doble", st3.ingredients.find((i) => i.id === "i_cafe").stock, cafe + 54);

  const kpis = computeKpis(st3.orders, st3.expenses);
  eq("una orden anulada no cuenta como venta", kpis.count, 0);
}

// ─────────────────────────────────────────────── 25. pago dividido y propina
seccion("25. Pago dividido y propinas");
{
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12, qty: 5 });
  const id = uid("O");
  const pago = {
    method: "split", split: true, subtotal: 60, tip: 10, total: 70,
    parts: [{ method: "efectivo", total: 40 }, { method: "tarjeta", total: 30 }],
  };
  const r = await cajero.post("/api/orders", { id, lines: [l], payment: pago, orderType: "Para llevar" });
  eq("se cobra un pago dividido", r.status, 200);

  const st = await estado();
  const kpis = computeKpis(st.orders.filter((o) => !o.voided), st.expenses);
  cerca("el efectivo del pago dividido se contabiliza aparte", kpis.cash, 40);
  cerca("y la tarjeta también", kpis.card, 30);
  cerca("la propina se registra", kpis.tips, 10);

  const st2 = await estado();
  const efectivoCaja = st2.orders.filter((o) => !o.voided).reduce((s, o) => {
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    return s + parts.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.total, 0);
  }, 0);
  cerca("solo la parte en efectivo entra al arqueo", efectivoCaja, 40);
}

// ───────────────────────────────────────────────────── 26. sesiones y auth
seccion("26. Sesión");
{
  const c = cliente();
  await c.login("u2", "1111");
  const ok1 = await c.get("/api/state");
  eq("la sesión funciona", ok1.status, 200);
  await c.post("/api/logout");
  const tras = await c.get("/api/state");
  eq("tras cerrar sesión el token ya no sirve", tras.status, 401);

  const falso = cliente("token-inventado");
  const r = await falso.get("/api/state");
  eq("un token inventado da 401", r.status, 401);

  // No se puede borrar al único gerente ni a uno mismo.
  const yo = await admin.del("/api/users/u1");
  eq("un gerente no puede eliminarse a sí mismo", yo.status, 409);
  const rolMalo = await admin.post("/api/users", { id: "u9", name: "X", role: "inventado", pin: "1234" });
  eq("un rol desconocido se rechaza", rolMalo.status, 400);
  const pinMalo = await admin.post("/api/users", { id: "u9", name: "X", role: "cajero", pin: "12" });
  eq("un PIN que no es de 4 dígitos se rechaza", pinMalo.status, 400);
}

// ──────────────────────────── 27. quién puede cambiar el menú y los precios
seccion("27. Quién puede cambiar la configuración");
{
  const barra = cliente();
  await barra.login("u3", "2222");
  const r = await barra.put("/api/state/cdv_menu", [{ id: "p_espresso", cat: "cafe", name: "Espresso", price: 1, recipe: [] }]);
  check("la barra NO debería poder cambiar los precios del menú", r.status === 403,
    `status ${r.status} — si es 200, cualquier usuario puede reescribir la carta`);
  // Restaurar el menú por si pasó.
  await admin.put("/api/state/cdv_menu", MENU);
}

await para();
process.exit(resumen("DINERO Y DATOS") ? 1 : 0);
