/* FUWA POS — bloque de ganancia neta, compartido por Resumen y Reportes.

   Muestra el desglose completo (ingresos − costo de ventas − gastos) en vez de
   un solo número, porque un número suelto no dice dónde se está yendo el
   dinero. Los supuestos del cálculo van escritos en la propia tarjeta: si el
   costo se apoya en recetas incompletas, quien lo lea tiene que saberlo. */
import { DashCard, BreakdownRow, MiniBars } from "./ui.jsx";
import { Icon } from "./Icon.jsx";
import { money } from "../lib/format.js";

const ROJO = "oklch(0.5 0.16 25)";
const VERDE = "oklch(0.45 0.11 150)";

export function ProfitCard({ profit, porDia, hint, turnosSinDetalle = 0 }) {
  const { revenue, cogs, expenses, net, margin, linesSinReceta } = profit;
  const positivo = net >= 0;

  return (
    <DashCard title="Ganancia neta" hint={hint}>
      <div style={{ marginTop: 4 }}>
        <BreakdownRow label="Ingresos por ventas" hint="sin propina" value={money(revenue)} />
        <BreakdownRow label="− Costo de ingredientes" value={money(cogs)} tone={cogs > 0 ? ROJO : undefined} />
        <BreakdownRow label="− Gastos" value={money(expenses)} tone={expenses > 0 ? ROJO : undefined} />
        <div style={{ borderTop: "1.5px dashed var(--line)", marginTop: 6, paddingTop: 8 }}>
          <BreakdownRow
            label={positivo ? "Ganancia neta" : "Pérdida"}
            value={money(Math.abs(net))}
            strong
            tone={positivo ? VERDE : ROJO}
          />
          <BreakdownRow label="Margen sobre ventas" value={revenue > 0 ? (margin * 100).toFixed(1) + "%" : "—"} tone={positivo ? VERDE : ROJO} />
        </div>
      </div>

      {porDia && porDia.length > 1 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1.5px solid var(--line)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            Ganancia por día
          </div>
          <MiniBars data={porDia.map((d) => ({ label: d.label, value: d.net }))} />
        </div>
      )}

      {/* Los supuestos, a la vista. Un número de gestión sin sus límites al
          lado es peor que no tenerlo. */}
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        El costo sale de las recetas del menú, valoradas con el precio de ingrediente cargado hoy en Inventario.
      </div>

      {linesSinReceta > 0 && (
        <div
          style={{
            marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start",
            background: "oklch(0.95 0.06 85)", border: "2px solid oklch(0.88 0.07 85)",
            borderRadius: 12, padding: "9px 12px",
          }}
        >
          <Icon name="alert" size={15} color="oklch(0.45 0.1 70)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "oklch(0.4 0.09 70)", lineHeight: 1.45, fontWeight: 700 }}>
            {linesSinReceta} línea{linesSinReceta === 1 ? "" : "s"} vendida{linesSinReceta === 1 ? "" : "s"} sin receta cargada: su costo no se pudo calcular, así que la ganancia real es menor que la mostrada.
          </div>
        </div>
      )}

      {turnosSinDetalle > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
          No incluye {turnosSinDetalle} turno{turnosSinDetalle === 1 ? "" : "s"} archivado{turnosSinDetalle === 1 ? "" : "s"} hace más de 180 días, cuyo detalle ya se compactó.
        </div>
      )}
    </DashCard>
  );
}
