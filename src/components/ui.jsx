/* Café del Valle POS — átomos de UI: botón, chip y piezas de dashboard.

   Café del Valle es fino donde FUWA era grueso: bordes de 1px en vez de 2px,
   pesos de 600/700 en vez de 800 y chips rectangulares en vez de píldoras.
   Las alturas táctiles NO cambian: la tablet de caja las necesita. */
import { Icon } from "./Icon.jsx";
import { money } from "../lib/format.js";

export function Btn({ children, kind = "primary", size = "md", icon, onClick, disabled, style, full }) {
  /* Alturas pensadas para tablet táctil: sm ~40px, md ~48px, lg ~52px. */
  const pads = { sm: "11px 16px", md: "13px 22px", lg: "16px 26px" };
  const fonts = { sm: 14, md: 16, lg: 19 };
  const kinds = {
    primary: { background: "var(--verde)", color: "var(--verde-claro)", border: "none" },
    ghost: { background: "var(--superficie)", color: "var(--tinta-2)", border: "1px solid var(--borde-fuerte)" },
    soft: { background: "var(--verde-suave)", color: "var(--verde-oscuro)", border: "none" },
    danger: { background: "var(--superficie)", color: "var(--error)", border: "1px solid var(--error-suave)" },
    dark: { background: "var(--verde-oscuro)", color: "var(--verde-claro)", border: "none" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...kinds[kind],
        padding: pads[size],
        fontSize: fonts[size],
        fontWeight: 700,
        fontFamily: "var(--ui)",
        borderRadius: "calc(var(--r) * 0.8)",
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
        padding: "12px 18px" /* ~46px de alto: target táctil cómodo en tablet */,
        borderRadius: 11,
        fontWeight: 600,
        fontSize: 14.5,
        fontFamily: "var(--ui)",
        cursor: "pointer",
        border: "1px solid " + (active ? "transparent" : "var(--borde)"),
        background: active ? color || "var(--verde)" : "var(--superficie)",
        color: active ? "var(--verde-claro)" : "var(--tinta-2)",
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
  background: "rgba(42,33,24,.42)",
  backdropFilter: "blur(3px)",
  display: "flex",
  overflowY: "auto",
  zIndex: 100,
  padding: 20,
};
export const sheet = {
  background: "var(--fondo)",
  borderRadius: "calc(var(--r) * 1.15)",
  width: "100%",
  /* `margin: auto` y NO `alignItems: center` en el contenedor: con centrado por
     flex, un hijo más alto que la pantalla se recorta por ARRIBA y esa parte
     queda inalcanzable al desplazar. Con margen automático se centra igual
     cuando cabe y se comporta bien cuando no. */
  margin: "auto",
  overflow: "hidden",
  boxShadow: "0 30px 70px -20px rgba(42,33,24,.35)",
};
export const iconBtn = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "none",
  background: "rgba(255,255,255,.6)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--tinta-2)",
};
export const qtyBtn = {
  width: 44,
  height: 44,
  borderRadius: 11,
  border: "1px solid var(--borde)",
  background: "var(--superficie)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--tinta-2)",
};

/* ---------------------------------------------------- piezas de dashboard
   Kpi y DashCard estaban duplicados en Resumen y Reportes; viven aquí para
   que las dos pantallas muestren exactamente lo mismo. */

export function Kpi({ icon, label, value, accent, tone }) {
  const fondo = accent ? tone || "var(--navy)" : "#fff";
  return (
    <div style={{ background: fondo, border: "1px solid " + (accent ? fondo : "var(--borde)"), borderRadius: "var(--r)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: accent ? "rgba(255,255,255,.14)" : "var(--primary-soft)", color: accent ? "#fff" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: accent ? "rgba(255,255,255,.72)" : "var(--tinta-3)", textTransform: "uppercase", letterSpacing: 0.6, lineHeight: 1.1 }}>{label}</div>
      </div>
      <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 32, letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums", color: accent ? "#fff" : "var(--verde-oscuro)" }}>{value}</div>
    </div>
  );
}

export function DashCard({ title, hint, children }) {
  return (
    <div style={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: "var(--r)", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--ui)", fontWeight: 600, fontSize: 16.5, color: "var(--tinta)" }}>{title}</div>
        {hint && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--cafe)", background: "var(--superficie-baja)", border: "1px solid var(--borde)", padding: "3px 10px", borderRadius: 999 }}>{hint}</div>}
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
                  background: negativo ? "var(--error)" : "var(--verde)",
                  borderRadius: negativo ? "0 0 5px 5px" : "5px 5px 0 0",
                  transition: "height .3s ease",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Solo primera y última etiqueta: con 30 días no cabe más. */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--tinta-3)", fontWeight: 500, marginTop: 7 }}>
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
      <span style={{ fontWeight: strong ? 600 : 400, color: strong ? "var(--tinta)" : "var(--tinta-3)" }}>
        {label}
        {hint && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}> · {hint}</span>}
      </span>
      <span style={{ fontWeight: strong ? 400 : 600, color: tone || "var(--tinta)", fontFamily: strong ? "var(--serif)" : "var(--ui)", fontSize: strong ? 23 : 14, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
