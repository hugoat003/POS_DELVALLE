/* FUWA POS — costo de ventas y ganancia neta.

   La ganancia neta se arma sobre las recetas del menú: cada línea vendida se
   traduce a consumo de ingredientes (src/lib/recipe.js) y se valora con el
   costo unitario que tiene cargado el inventario.

   Tres cosas que conviene tener claras al leer estos números:

   1. La base de ingresos es el SUBTOTAL, no el total. La propina es del
      personal, no del negocio, así que no cuenta como ingreso.
   2. El costo usa el precio de ingrediente de HOY, no el vigente el día de la
      venta. Recostear el pasado exigiría historial de costos, que no existe.
   3. Si un producto se borró del menú, su receta ya no se puede reconstruir y
      esa línea cuenta como costo desconocido. No se asume cero en silencio:
      `linesSinReceta` lo reporta para que la pantalla lo advierta. */
import { lineConsumption, lineCost } from "./recipe.js";

// Los helpers de recipe.js esperan un objeto plano {id: ingrediente}.
export function byId(ingredients) {
  return Object.fromEntries((ingredients || []).map((i) => [i.id, i]));
}

// ¿Se puede costear esta línea? Sin receta reconstruible, no.
export function lineTieneReceta(line, menu, modGroups) {
  return lineConsumption(line, menu, modGroups).size > 0;
}

/* Costo de producir una orden completa. Devuelve también cuántas líneas no se
   pudieron costear, para no presentar un costo incompleto como si fuera exacto. */
export function orderCost(order, menu, modGroups, ingById) {
  let cost = 0;
  let sinReceta = 0;
  for (const line of order.lines || []) {
    /* Una línea anulada no consumió nada: se descontó al enviarla y se devolvió
       íntegra al anularla, así que su consumo neto es cero. Contarla inflaba el
       costo de ventas y podía dejar en pérdida una orden rentable — una venta de
       Q18 con un asai cancelado aparecía como −Q8 de ganancia. */
    if (line.voided) continue;
    if (lineTieneReceta(line, menu, modGroups)) cost += lineCost(line, menu, modGroups, ingById);
    else sinReceta += 1;
  }
  return { cost: Math.round(cost * 100) / 100, sinReceta };
}

const r2 = (n) => Math.round(n * 100) / 100;

/* Ganancia neta de un conjunto de órdenes y gastos.

   ingresos = Σ subtotal de las órdenes no anuladas
   costo    = Σ costo de ingredientes consumidos
   gastos   = Σ gastos del turno, SOLO salidas

   Las entradas de dinero a caja (aportes, reembolsos) no son ventas: mueven el
   efectivo del arqueo pero no entran en la ganancia. */
export function computeProfit(orders, expenses, menu, modGroups, ingredients) {
  const ingById = byId(ingredients);
  let revenue = 0;
  let cogs = 0;
  let linesSinReceta = 0;

  for (const o of orders || []) {
    if (o.voided) continue;
    revenue += Number(o.payment?.subtotal) || 0;
    const { cost, sinReceta } = orderCost(o, menu, modGroups, ingById);
    cogs += cost;
    linesSinReceta += sinReceta;
  }

  const expensesTotal = (expenses || [])
    .filter((e) => (e.kind || "salida") !== "entrada")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const net = revenue - cogs - expensesTotal;
  return {
    revenue: r2(revenue),
    cogs: r2(cogs),
    expenses: r2(expensesTotal),
    net: r2(net),
    margin: revenue > 0 ? net / revenue : 0,
    linesSinReceta,
  };
}

/* Ganancia neta agrupada por día, para la gráfica del rango de reportes.
   Devuelve [{ key:"YYYY-MM-DD", label:"5 ago", net, revenue }] en orden. */
export function profitByDay(orders, expenses, menu, modGroups, ingredients) {
  const ingById = byId(ingredients);
  const dias = new Map();
  const bucket = (ts) => {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dias.has(key)) {
      dias.set(key, { key, label: d.toLocaleDateString("es-GT", { day: "numeric", month: "short" }), revenue: 0, cogs: 0, expenses: 0 });
    }
    return dias.get(key);
  };

  for (const o of orders || []) {
    if (o.voided) continue;
    const b = bucket(o.ts);
    b.revenue += Number(o.payment?.subtotal) || 0;
    b.cogs += orderCost(o, menu, modGroups, ingById).cost;
  }
  for (const e of expenses || []) {
    if ((e.kind || "salida") === "entrada") continue;
    bucket(e.ts).expenses += Number(e.amount) || 0;
  }

  return [...dias.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((d) => ({ ...d, revenue: r2(d.revenue), net: r2(d.revenue - d.cogs - d.expenses) }));
}
