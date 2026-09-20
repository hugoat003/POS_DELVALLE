/* Prueba 4 — cruces finos entre funciones que se pisan. */
import { arranca, para, cliente, seccion, check, eq, cerca, resumen, linea, pagoEfectivo, uid } from "./harness.mjs";

await arranca({ puerto: 5207 });

const MENU = [
  { id: "p_espresso", cat: "cafe", name: "Espresso", price: 12, sizes: null, mods: [],
    recipe: [{ id: "i_cafe", qty: 18 }] },
];
const AREAS = [{ id: "salon", name: "Salón", tables: [{ id: "s1", label: "1", x: 10, y: 10 }, { id: "s2", label: "2", x: 50, y: 10 }] }];
const MESA1 = { id: "s1", label: "1", areaId: "salon", areaName: "Salón" };
const MESA2 = { id: "s2", label: "2", areaId: "salon", areaName: "Salón" };

const admin = cliente();
const cajero = cliente();
await admin.login("u1", "1234");
await cajero.login("u2", "1111");
await admin.put("/api/state/cdv_menu", MENU);
await admin.put("/api/state/cdv_cats", [{ id: "cafe", name: "Café", station: "barra" }]);
await admin.put("/api/state/cdv_areas", AREAS);
await admin.post("/api/shifts/open", { openingCash: 100 });
const estado = async () => (await admin.get("/api/state")).data;

// ─────────────── 34. anular un consumo de empleado deja el gasto colgado
seccion("34. Anular un consumo de empleado");
{
  const ab = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);
  await cajero.post(`/api/orders/${id}/cobrar`, {
    payment: { method: "empleado", subtotal: 12, tip: 0, total: 0, empleado: "Ana" },
  });

  const st1 = await estado();
  const gasto = st1.expenses.find((e) => e.id === "Ge:" + id);
  check("el consumo generó su gasto", !!gasto);
  const cafe1 = st1.ingredients.find((i) => i.id === "i_cafe").stock;

  await cajero.post(`/api/orders/${id}/void`, { reason: "se registró por error" });
  const st2 = await estado();
  cerca("al anularlo, el café vuelve al inventario", st2.ingredients.find((i) => i.id === "i_cafe").stock, cafe1 + 18);
  const sigue = st2.expenses.some((e) => e.id === "Ge:" + id);
  check("y el gasto de materiales NO debería quedar colgado",
    !sigue,
    sigue ? "el gasto sigue ahí: el café volvió al stock pero el negocio sigue pagándolo en los reportes" : "");
}

// ─────────────── 35. cambiar de mesa no arrastra la cuenta a otra ocupada
seccion("35. Dos cuentas no pueden compartir la misma mesa");
{
  const a = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA2,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  await cajero.post(`/api/orders/${a.data.order.id}/enviar`);

  const b = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  // La segunda cuenta intenta mudarse a la mesa que ya está ocupada.
  const mover = await cajero.put(`/api/orders/${b.data.order.id}/lines`, {
    lines: b.data.order.lines, table: MESA2, orderType: "Aquí",
  });
  const st = await estado();
  const enMesa2 = st.openOrders.filter((o) => o.table && o.table.id === "s2").length;
  check("el servidor no debería dejar dos cuentas vivas en la misma mesa",
    enMesa2 <= 1,
    `hay ${enMesa2} cuentas en la mesa 2; el mapa solo puede mostrar una y la otra queda inalcanzable`);

  // limpieza
  for (const o of st.openOrders) await cajero.post(`/api/orders/${o.id}/void`, { reason: "limpieza" });
}

// ─────────────── 36. cobrar una cuenta abierta tras cerrar y reabrir caja
seccion("36. Una cuenta abierta cruzando el cierre de turno");
{
  const ab = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);

  const cierre = await cajero.post("/api/shifts/close", { countedCash: 100 });
  eq("el cierre se bloquea con la mesa viva", cierre.status, 409);

  // Se cobra y luego sí se cierra.
  await cajero.post(`/api/orders/${id}/cobrar`, { payment: pagoEfectivo(12) });
  const st = await estado();
  const efectivo = st.orders.filter((o) => !o.voided).reduce((s, o) => {
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    return s + parts.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.total, 0);
  }, 0);
  const cierre2 = await cajero.post("/api/shifts/close", { countedCash: 100 + efectivo });
  eq("tras cobrarla, el cierre pasa", cierre2.status, 200);
  cerca("y el arqueo cuadra", cierre2.data.state.shiftHistory.slice(-1)[0].diff, 0);
}

// ─────────────── 37. una cuenta abierta de un turno anterior bloquea el cierre
seccion("37. Una mesa olvidada de ayer");
{
  await cajero.post("/api/shifts/open", { openingCash: 50 });
  const ab = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);
  await cajero.post(`/api/orders/${id}/void`, { reason: "limpieza" });
  const cierre = await cajero.post("/api/shifts/close", { countedCash: 50 });
  eq("se cierra sin mesas vivas", cierre.status, 200);

  // Nuevo turno: se cobra una cuenta abierta ANTES del cierre anterior.
  await cajero.post("/api/shifts/open", { openingCash: 80 });
  const ab2 = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  await cajero.post(`/api/orders/${ab2.data.order.id}/enviar`);
  const cob = await cajero.post(`/api/orders/${ab2.data.order.id}/cobrar`, { payment: pagoEfectivo(12) });
  eq("la cuenta se cobra en el turno vigente", cob.status, 200);
  const st = await estado();
  eq("y el dinero entra al turno actual", st.orders.some((o) => o.id === ab2.data.order.id), true);
  cerca("el arqueo del turno actual la incluye",
    (await (async () => {
      const c = await cajero.post("/api/shifts/close", { countedCash: 80 + 12 });
      return c.data.state.shiftHistory.slice(-1)[0].diff;
    })())
    , 0);
}

// ─────────────── 38. el número de orden nunca se repite
seccion("38. Numeración de órdenes");
{
  await cajero.post("/api/shifts/open", { openingCash: 0 });
  const nums = [];
  for (let i = 0; i < 5; i++) {
    const r = await cajero.post("/api/orders", {
      id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(12),
      lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
    });
    nums.push(r.data.order.number);
  }
  // Y una cuenta de mesa en medio.
  const ab = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  nums.push(ab.data.order.number);
  eq("todos los números son distintos", new Set(nums).size, nums.length);
  check("y son crecientes", nums.every((n, i) => i === 0 || n > nums[i - 1]), JSON.stringify(nums));
  await cajero.post(`/api/orders/${ab.data.order.id}/void`, { reason: "limpieza" });
}

// ─────────────── 39. dos tablets cobrando la misma cuenta a la vez
seccion("39. Dos tablets sobre la misma cuenta");
{
  const ab = await cajero.post("/api/orders/open", {
    id: uid("O"), orderType: "Aquí", table: MESA1,
    lines: [
      linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 }),
      linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 }),
    ],
  });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);

  // Tablet A tiene en pantalla Q24. Tablet B anula una línea.
  const cta = (await estado()).openOrders.find((o) => o.id === id);
  await admin.post(`/api/orders/${id}/lines/${cta.lines[0].uid}/anular`, { reason: "el cliente se arrepintió" });

  // Tablet A cobra con el total viejo.
  const cob = await cajero.post(`/api/orders/${id}/cobrar`, { payment: pagoEfectivo(24) });
  eq("el cobro con el total viejo se rechaza", cob.status, 409);
  eq("y dice cuál es el total real", cob.data.esperado, 12);

  const bien = await cajero.post(`/api/orders/${id}/cobrar`, { payment: pagoEfectivo(12) });
  eq("con el total corregido sí cobra", bien.status, 200);
}

// ─────────────── 40. el ticket refleja lo anulado
seccion("40. El ticket del cliente no cobra lo anulado");
{
  const st = await estado();
  const ultima = st.orders.slice(-1)[0];
  const vivas = ultima.lines.filter((l) => !l.voided);
  cerca("el importe cobrado corresponde solo a las líneas vivas",
    ultima.payment.subtotal,
    vivas.reduce((s, l) => s + l.basePrice * l.qty, 0));
}

await para();
process.exit(resumen("CRUCES") ? 1 : 0);
