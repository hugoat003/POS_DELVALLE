/* FUWA POS — helpers de formato y cálculo de líneas del carrito. */

// Moneda (Quetzal)
export function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "Q" + v.toFixed(2);
}

// Hora corta para la gráfica del dashboard (8 -> "8a", 15 -> "3p")
export function fmtHour(h) {
  h = +h;
  const ap = h >= 12 ? "p" : "a";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return hr + ap;
}

// Precio unitario de una línea ya configurada (base + tamaño + modificadores)
export function lineUnit(line) {
  let p = line.basePrice;
  if (line.size) p += line.size.delta;
  (line.mods || []).forEach((m) => (p += m.delta));
  return p;
}

export function lineTotal(line) {
  return lineUnit(line) * line.qty;
}

// Suma lo cobrado en órdenes válidas (no anuladas) por método de pago,
// desglosando los pagos divididos en sus partes.
function sumByMethod(orders, keep) {
  return orders
    .filter((o) => !o.voided)
    .reduce((s, o) => {
      const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
      return s + parts.filter((p) => keep(p.method)).reduce((s2, p) => s2 + p.total, 0);
    }, 0);
}
export const cashFromOrders = (orders) => sumByMethod(orders, (m) => m === "efectivo");
// Todo lo que no es efectivo cuenta como tarjeta (misma regla que el servidor).
export const cardFromOrders = (orders) => sumByMethod(orders, (m) => m !== "efectivo");

/* Movimientos de efectivo de la caja registrados como gastos. Las salidas
   restan y las entradas suman; el resto de métodos ("otro") no toca la caja. */
export function cashMovesFromExpenses(expenses) {
  let out = 0;
  let cashIn = 0;
  for (const e of expenses || []) {
    if (e.method !== "efectivo") continue;
    if ((e.kind || "salida") === "entrada") cashIn += e.amount;
    else out += e.amount;
  }
  return { cashExpenses: out, cashIn };
}

// Efectivo disponible en caja ahora mismo (para no dejarla en negativo).
export function availableCashNow(openingCash, orders, expenses) {
  const { cashExpenses, cashIn } = cashMovesFromExpenses(expenses);
  return openingCash + cashFromOrders(orders) + cashIn - cashExpenses;
}
