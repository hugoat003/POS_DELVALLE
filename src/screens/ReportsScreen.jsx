/* FUWA POS — reportes por rango de fechas (diario/semanal/mensual/personalizado)
   con vista previa y descarga en PDF. Solo para el rol admin. */
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Kpi } from "../components/ui.jsx";
import { ProfitCard } from "../components/ProfitCard.jsx";
import { money } from "../lib/format.js";
import { computeProfit, profitByDay } from "../lib/profit.js";
import { combineOrders, combineExpenses, filterByRange, computeKpis, addCompactedKpis, shiftsInRange, dayStart, dayEnd, toDateInput, moneyDiff } from "../lib/reportStats.js";

const PRESETS = [
  { id: "diario", label: "Diario" },
  { id: "semanal", label: "Semanal" },
  { id: "mensual", label: "Mensual" },
  { id: "custom", label: "Personalizado" },
];

// Rango [desde, hasta] de cada preset, como strings "YYYY-MM-DD" locales.
function presetRange(id) {
  const today = new Date();
  const to = toDateInput(today);
  if (id === "diario") return [to, to];
  if (id === "semanal") return [toDateInput(new Date(today.getTime() - 6 * 86400000)), to];
  if (id === "mensual") return [toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to];
  return null;
}

const dateInputStyle = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "2px solid var(--line)",
  fontFamily: "var(--ui)",
  fontWeight: 700,
  fontSize: 14,
  color: "var(--ink)",
  background: "#fff",
};

const thStyle = { padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "right", borderBottom: "2px solid var(--line)" };
const tdStyle = { padding: "10px 12px", fontWeight: 700, fontSize: 14, color: "var(--ink)", textAlign: "right", borderBottom: "1px solid var(--line)" };

export function ReportsScreen({ orders, expenses = [], shiftHistory = [], menu = [], mods = {}, ingredients = [] }) {
  const today = toDateInput(new Date());
  const [preset, setPreset] = useState("diario");
  const [fromStr, setFromStr] = useState(today);
  const [toStr, setToStr] = useState(today);

  function pickPreset(id) {
    setPreset(id);
    const r = presetRange(id);
    if (r) {
      setFromStr(r[0]);
      setToStr(r[1]);
    }
  }
  function onDateChange(setter) {
    return (e) => {
      setter(e.target.value);
      setPreset("custom");
    };
  }

  const { from, to, kpis, shifts, rangeOk, profit, porDia, turnosSinDetalle } = useMemo(() => {
    if (!fromStr || !toStr) return { rangeOk: false, kpis: null, shifts: [] };
    const from = dayStart(fromStr);
    const to = dayEnd(toStr);
    if (from > to) return { rangeOk: false, kpis: null, shifts: [] };
    const periodOrders = filterByRange(combineOrders(orders, shiftHistory), from, to);
    const periodExpenses = filterByRange(combineExpenses(expenses, shiftHistory), from, to);
    return {
      from,
      to,
      rangeOk: true,
      // Los turnos compactados (muy antiguos) ya no tienen órdenes detalladas:
      // sus totales guardados se suman aparte.
      kpis: addCompactedKpis(computeKpis(periodOrders, periodExpenses), shiftHistory, from, to),
      shifts: shiftsInRange(shiftHistory, from, to),
      // La ganancia se calcula solo con las órdenes que conservan su detalle:
      // sin líneas no hay receta que costear.
      profit: computeProfit(periodOrders, periodExpenses, menu, mods, ingredients),
      porDia: profitByDay(periodOrders, periodExpenses, menu, mods, ingredients),
      turnosSinDetalle: shiftsInRange(shiftHistory, from, to).filter((s) => s.compacted).length,
    };
  }, [fromStr, toStr, orders, expenses, shiftHistory, menu, mods, ingredients]);

  const periodLabel = PRESETS.find((p) => p.id === preset).label;
  const empty = !rangeOk || (kpis.count === 0 && kpis.voided === 0 && shifts.length === 0);

  // jsPDF se carga bajo demanda (import dinámico) para no engordar el bundle inicial.
  async function onDownload() {
    const { downloadReportPdf } = await import("../lib/reportPdf.js");
    downloadReportPdf({ periodLabel, from, to, kpis, shifts, profit });
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "22px 32px 40px" }}>
      {/* ---- encabezado y controles ---- */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: 0 }}>Reportes</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => pickPreset(p.id)}
                style={{ padding: "8px 16px", borderRadius: 999, fontFamily: "var(--ui)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", border: "2px solid " + (active ? "var(--primary)" : "var(--line)"), background: active ? "var(--primary)" : "#fff", color: active ? "#fff" : "var(--ink)", transition: "all .12s ease" }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <label style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
          Desde{" "}
          <input type="date" value={fromStr} max={toStr || undefined} onChange={onDateChange(setFromStr)} style={dateInputStyle} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
          Hasta{" "}
          <input type="date" value={toStr} min={fromStr || undefined} max={today} onChange={onDateChange(setToStr)} style={dateInputStyle} />
        </label>
        <button
          onClick={onDownload}
          disabled={empty}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            background: empty ? "var(--line)" : "var(--navy)",
            color: empty ? "var(--muted)" : "#fff",
            borderRadius: 999,
            padding: "11px 22px",
            fontWeight: 800,
            fontSize: 14.5,
            fontFamily: "var(--ui)",
            cursor: empty ? "not-allowed" : "pointer",
          }}
        >
          <Icon name="print" size={18} /> Descargar PDF
        </button>
      </div>

      {!rangeOk ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>Elige un rango de fechas válido (desde ≤ hasta).</div>
      ) : empty ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 14 }}>
          <Mascot size={90} />
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>Sin movimientos en este período</div>
          <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 14 }}>Prueba con otro rango de fechas.</div>
        </div>
      ) : (
        <>
          {/* ---- KPIs ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 22 }}>
            <Kpi icon="cash" label="Ventas totales" value={money(kpis.total)} accent />
            <Kpi icon="order" label="Órdenes" value={kpis.count} />
            <Kpi icon="chart" label="Ticket promedio" value={money(kpis.avg)} />
            <Kpi icon="star" label="Propinas" value={money(kpis.tips)} />
            <Kpi icon="note" label="Gastos" value={money(kpis.expensesTotal)} />
            <Kpi icon="cash" label="Efectivo" value={money(kpis.cash)} />
            <Kpi icon="card" label="Tarjeta" value={money(kpis.card)} />
          </div>

          {/* ---- ganancia neta ---- */}
          <div style={{ marginBottom: 22 }}>
            <ProfitCard profit={profit} porDia={porDia} hint={periodLabel} turnosSinDetalle={turnosSinDetalle} />
          </div>

          {/* ---- arqueos ---- */}
          <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "18px 20px" }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--navy)", marginBottom: 10 }}>Arqueos de caja</div>
            {shifts.length === 0 ? (
              <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 14, padding: "10px 0" }}>Sin cierres de caja en el período.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: "left" }}>Cierre</th>
                      <th style={thStyle}>Fondo</th>
                      <th style={thStyle}>Ventas efectivo</th>
                      <th style={thStyle}>Tarjeta</th>
                      <th style={thStyle}>Entradas</th>
                      <th style={thStyle}>Gastos efectivo</th>
                      <th style={thStyle}>Esperado</th>
                      <th style={thStyle}>Contado</th>
                      <th style={thStyle}>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...tdStyle, textAlign: "left" }}>{s.closedAtLabel}</td>
                        <td style={tdStyle}>{money(s.openingCash)}</td>
                        <td style={tdStyle}>{money(s.cashSales)}</td>
                        {/* Turnos cerrados antes de esta versión no tienen el dato. */}
                        <td style={tdStyle}>{s.cardSales ? money(s.cardSales) : "—"}</td>
                        <td style={tdStyle}>{s.cashIn ? money(s.cashIn) : "—"}</td>
                        <td style={tdStyle}>{money(s.cashExpenses)}</td>
                        <td style={tdStyle}>{money(s.expected)}</td>
                        <td style={tdStyle}>{money(s.counted)}</td>
                        <td style={{ ...tdStyle, color: s.diff < 0 ? "oklch(0.5 0.16 25)" : s.diff > 0 ? "oklch(0.55 0.10 150)" : "var(--ink)" }}>
                          {moneyDiff(s.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
