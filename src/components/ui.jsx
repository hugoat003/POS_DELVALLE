/* FUWA POS — átomos de UI: botón, chip/pill y piezas de dashboard. */
import { Icon } from "./Icon.jsx";
import { money } from "../lib/format.js";

export function Btn({ children, kind = "primary", size = "md", icon, onClick, disabled, style, full }) {
  /* Alturas pensadas para tablet táctil: sm ~40px, md ~48px, lg ~52px. */
  const pads = { sm: "11px 16px", md: "13px 22px", lg: "16px 26px" };
  const fonts = { sm: 14, md: 16, lg: 19 };
  const kinds = {
    primary: { background: "var(--primary)", color: "#fff", border: "none" },
    ghost: { background: "transparent", color: "var(--navy)", border: "2px solid var(--line)" },
    soft: { background: "var(--primary-soft)", color: "var(--primary)", border: "none" },
    danger: { background: "transparent", color: "oklch(0.55 0.16 25)", border: "2px solid oklch(0.85 0.07 25)" },
    dark: { background: "var(--navy)", color: "#fff", border: "none" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...kinds[kind],
        padding: pads[size],
        fontSize: fonts[size],
        fontWeight: 800,
        fontFamily: "var(--ui)",
        borderRadius: "calc(var(--r) * 0.7)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        width: full ? "100%" : "auto",
        transition: "transform .08s ease, filter .15s ease",
        ...style,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {icon && <Icon name={icon} size={fonts[size] + 2} />}
      {children}
    </button>
  );
}

export function Pill({ children, active, color, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "11px 18px" /* ~46px de alto: target táctil cómodo en tablet */,
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 15.5,
        fontFamily: "var(--ui)",
        cursor: "pointer",
        border: "2px solid " + (active ? "transparent" : "var(--line)"),
        background: active ? color || "var(--navy)" : "#fff",
        color: active ? "#fff" : "var(--ink)",
        transition: "all .12s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Estilos compartidos para modales / hojas (order modal, menu editor form).
/* Fondo del modal. Se desplaza si el contenido no cabe: es la red de seguridad
   para que ningún modal pueda dejar su botón de guardar fuera de la pantalla.
   Pasó de verdad — el formulario de ingrediente creció al añadirle la unidad de
   compra y en una tablet de 768px el botón quedaba 25px por debajo del borde,
   sin forma de alcanzarlo. */
export const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(40,44,60,.45)",
  backdropFilter: "blur(3px)",
  display: "flex",
  overflowY: "auto",
  zIndex: 100,
  padding: 20,
};
export const sheet = {
  background: "var(--cream)",
  borderRadius: "calc(var(--r) * 1.2)",
  width: "100%",
  /* `margin: auto` y NO `alignItems: center` en el contenedor: con centrado por
     flex, un hijo más alto que la pantalla se recorta por ARRIBA y esa parte
     queda inalcanzable al desplazar. Con margen automático se centra igual
     cuando cabe y se comporta bien cuando no. */
  margin: "auto",
  overflow: "hidden",
  boxShadow: "0 30px 70px -20px rgba(40,44,60,.5)",
};
export const iconBtn = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,.6)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--navy)",
};
export const qtyBtn = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "none",
  background: "var(--cream)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--navy)",
};

/* ---------------------------------------------------- piezas de dashboard
   Kpi y DashCard estaban duplicados en Resumen y Reportes; viven aquí para
   que las dos pantallas muestren exactamente lo mismo. */

export function Kpi({ icon, label, value, accent, tone }) {
  const fondo = accent ? tone || "var(--navy)" : "#fff";
  return (
    <div style={{ background: fondo, border: "2px solid " + (accent ? fondo : "var(--line)"), borderRadius: "var(--r)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: accent ? "rgba(255,255,255,.14)" : "var(--primary-soft)", color: accent ? "#fff" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: accent ? "rgba(255,255,255,.72)" : "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.1 }}>{label}</div>
      </div>
      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 27, color: accent ? "#fff" : "var(--navy)" }}>{value}</div>
    </div>
  );
}

export function DashCard({ title, hint, children }) {
  return (
    <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>{title}</div>
        {hint && <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--gold)", background: "color-mix(in oklch, var(--gold) 14%, white)", padding: "3px 10px", borderRadius: 999 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* Gráfica de barras chica, hecha a mano con divs (no hay librería de charts).
   Acepta valores negativos: las pérdidas bajan desde la línea del cero, que es
   justo lo que hay que poder ver de un vistazo en la ganancia diaria. */
export function MiniBars({ data, height = 96 }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hayNegativos = data.some((d) => d.value < 0);
  // Con pérdidas el cero va al medio; sin ellas, abajo del todo.
  const cero = hayNegativos ? height / 2 : height;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6, height, position: "relative" }}>
        {/* Línea del cero */}
        <div style={{ position: "absolute", left: 0, right: 0, top: cero - 1, height: 2, background: "var(--line)", borderRadius: 999 }} />
        {data.map((d, i) => {
          const alto = Math.max(2, (Math.abs(d.value) / max) * (hayNegativos ? height / 2 : height));
          const negativo = d.value < 0;
          return (
            <div key={d.label + i} title={`${d.label}: ${money(d.value)}`} style={{ flex: 1, position: "relative", minWidth: 6 }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: alto,
                  top: negativo ? cero : cero - alto,
                  background: negativo ? "oklch(0.6 0.16 25)" : "var(--primary)",
                  borderRadius: negativo ? "0 0 5px 5px" : "5px 5px 0 0",
                  transition: "height .3s ease",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Solo primera y última etiqueta: con 30 días no cabe más. */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", fontWeight: 700, marginTop: 7 }}>
        <span>{data[0].label}</span>
        {data.length > 1 && <span>{data[data.length - 1].label}</span>}
      </div>
    </div>
  );
}

/* Fila de desglose (ingresos − costos = neta). Mismo patrón visual que el
   arqueo del cierre de caja, que ya es el lenguaje de la casa para sumar y
   restar cantidades. */
export function BreakdownRow({ label, value, strong, tone, hint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14, padding: "5px 0", gap: 12 }}>
      <span style={{ fontWeight: strong ? 800 : 400, color: strong ? "var(--navy)" : "var(--muted)" }}>
        {label}
        {hint && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}> · {hint}</span>}
      </span>
      <span style={{ fontWeight: 800, color: tone || "var(--ink)", fontFamily: strong ? "var(--display)" : "var(--ui)", fontSize: strong ? 19 : 14, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
