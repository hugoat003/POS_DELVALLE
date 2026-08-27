/* FUWA POS — cálculos compartidos para la pantalla Reportes y el PDF.
   Misma semántica que el dashboard (SummaryScreen): solo órdenes no anuladas,
   y los pagos divididos reparten el total entre métodos vía payment.parts. */
import { money } from "./format.js";

// Órdenes/gastos del turno actual + todos los turnos archivados.
export function combineOrders(orders, shiftHistory) {
  return [...orders, ...shiftHistory.flatMap((s) => s.orders || [])];
}
export function combineExpenses(expenses, shiftHistory) {
  return [...expenses, ...shiftHistory.flatMap((s) => s.expenses || [])];
}

// Los <input type="date"> devuelven "YYYY-MM-DD"; new Date(str) lo tomaría
// como medianoche UTC (18:00 del día ANTERIOR en Guatemala). Se parsea a mano
// como fecha local.
export function parseDateLocal(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function dayStart(str) {
  return parseDateLocal(str).getTime();
}
// Fin de día inclusivo: último ms del día local.
export function dayEnd(str) {
  const d = parseDateLocal(str);
  d.setDate(d.getDate() + 1);
  return d.getTime() - 1;
}
export function toDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function filterByRange(items, from, to) {
  return items.filter((it) => it.ts >= from && it.ts <= to);
}

// KPIs del período (mismos criterios que el useMemo de SummaryScreen).
export function computeKpis(orders, expenses) {
  const valid = orders.filter((o) => !o.voided);
  let tips = 0,
    cash = 0,
    card = 0;
  valid.forEach((o) => {
    tips += o.payment.tip || 0;
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    parts.forEach((p) => {
      if (p.method === "efectivo") cash += p.total;
      else card += p.total;
    });
  });
  const total = valid.reduce((s, o) => s + o.payment.total, 0);
  // Solo salidas: una entrada de dinero a caja no es un gasto, y sumarla aquí
  // inflaría los gastos del período.
  const salidas = expenses.filter((e) => (e.kind || "salida") !== "entrada");
  const expensesTotal = salidas.reduce((s, e) => s + e.amount, 0);
  const cashInTotal = expenses.filter((e) => (e.kind || "salida") === "entrada").reduce((s, e) => s + e.amount, 0);
  return {
    total,
    count: valid.length,
    avg: valid.length ? total / valid.length : 0,
    tips,
    cash,
    card,
    expensesTotal,
    cashInTotal,
    voided: orders.length - valid.length,
  };
}

// Diferencia de arqueo con signo delante de la moneda: "-Q5.00" / "+Q2.00".
export function moneyDiff(n) {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return sign + money(Math.abs(n));
}

// Arqueos: turnos cerrados dentro del rango (por fecha de cierre).
export function shiftsInRange(shiftHistory, from, to) {
  return shiftHistory
    .filter((s) => s.closedAt >= from && s.closedAt <= to)
    .sort((a, b) => a.closedAt - b.closedAt);
}

// ---- compactación de turnos antiguos ----
// Para que el historial no crezca sin límite, los turnos muy viejos se
// compactan: conservan el arqueo y estos totales, pero pierden el detalle
// de órdenes/gastos (ya no se pueden reabrir ni reimprimir).
export function compactShift(s) {
  const all = s.orders || [];
  const valid = all.filter((o) => !o.voided);
  let sales = 0,
    tips = 0,
    cash = 0,
    card = 0,
    items = 0;
  valid.forEach((o) => {
    sales += o.payment.subtotal;
    tips += o.payment.tip || 0;
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    parts.forEach((p) => {
      if (p.method === "efectivo") cash += p.total;
      else card += p.total;
    });
    // Las líneas anuladas no se vendieron: no cuentan como productos servidos.
    (o.lines || []).forEach((l) => { if (!l.voided) items += l.qty; });
  });
  const total = valid.reduce((acc, o) => acc + o.payment.total, 0);
  const movs = s.expenses || [];
  const expensesTotal = movs.filter((e) => (e.kind || "salida") !== "entrada").reduce((acc, e) => acc + e.amount, 0);
  const cashInTotal = movs.filter((e) => (e.kind || "salida") === "entrada").reduce((acc, e) => acc + e.amount, 0);
  return {
    ...s,
    compacted: true,
    totals: { total, sales, count: valid.length, tips, cash, card, items, expensesTotal, cashInTotal, voided: all.length - valid.length },
    orders: [],
    expenses: [],
  };
}

// Suma a unos KPIs ya calculados los totales de los turnos compactados
// cerrados dentro del rango (sus órdenes detalladas ya no existen).
export function addCompactedKpis(kpis, shiftHistory, from, to) {
  const cs = shiftHistory.filter((s) => s.compacted && s.closedAt >= from && s.closedAt <= to);
  if (!cs.length) return kpis;
  const out = { ...kpis };
  cs.forEach((s) => {
    const t = s.totals || {};
    out.total += t.total || 0;
    out.count += t.count || 0;
    out.tips += t.tips || 0;
    out.cash += t.cash || 0;
    out.card += t.card || 0;
    out.expensesTotal += t.expensesTotal || 0;
    out.voided += t.voided || 0;
  });
  out.avg = out.count ? out.total / out.count : 0;
  return out;
}
