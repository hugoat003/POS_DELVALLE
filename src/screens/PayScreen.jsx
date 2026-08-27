/* FUWA POS — cobro: una cuenta o pago dividido por productos (método por persona). */
import { useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn } from "../components/ui.jsx";
import { money, lineTotal } from "../lib/format.js";

function SectionLabel({ children }) {
  return <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>{children}</div>;
}
function Row({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 15 : 15, color: "var(--ink)", padding: "4px 0" }}>
      <span style={{ fontWeight: strong ? 800 : 400 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 700 }}>{value}</span>
    </div>
  );
}

function MethodPicker({ value, onChange, compact }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: compact ? 8 : 14 }}>
      {[
        { id: "efectivo", icon: "cash", label: "Efectivo" },
        { id: "tarjeta", icon: "card", label: "Tarjeta" },
      ].map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          style={{
            padding: compact ? "13px 10px" : "22px",
            borderRadius: compact ? 12 : "var(--r)",
            cursor: "pointer",
            fontFamily: "var(--ui)",
            border: "2.5px solid " + (value === m.id ? "var(--primary)" : "var(--line)"),
            background: value === m.id ? "var(--primary-soft)" : "#fff",
            color: value === m.id ? "var(--primary)" : "var(--ink)",
            display: "flex",
            flexDirection: compact ? "row" : "column",
            alignItems: "center",
            justifyContent: "center",
            gap: compact ? 7 : 10,
            transition: "all .12s ease",
          }}
        >
          <Icon name={m.icon} size={compact ? 20 : 34} stroke={1.8} />
          <span style={{ fontWeight: 800, fontSize: compact ? 14 : 18 }}>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function CashInput({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      inputMode="decimal"
      placeholder="Efectivo recibido…"
      style={{ width: "100%", padding: "11px 14px", border: "2px solid var(--line)", borderRadius: 12, fontFamily: "var(--display)", fontSize: 18, fontWeight: 800, color: "var(--navy)", outline: "none", boxSizing: "border-box" }}
    />
  );
}

// ---------- Pago de una sola cuenta ----------
function SinglePay({ cart, subtotal, tipEnabled, onConfirm }) {
  const [method, setMethod] = useState("efectivo");
  const [tipPct, setTipPct] = useState(0);
  const [received, setReceived] = useState("");

  const tipAmt = Math.round(subtotal * tipPct) / 100;
  const total = subtotal + tipAmt;
  const recNum = parseFloat(received) || 0;
  const change = recNum - total;
  const canCash = method === "efectivo" ? recNum >= total : true;

  const quick = [total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 100) * 100 + 100];
  const quickUniq = [...new Set(quick.map((q) => Math.round(q * 100) / 100))];

  function confirm() {
    onConfirm({
      split: false,
      method,
      tip: tipAmt,
      tipPct,
      subtotal,
      total,
      received: method === "efectivo" ? recNum : total,
      change: method === "efectivo" ? Math.max(0, change) : 0,
    });
  }

  return (
    <div className="fuwa-split" style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 390px", minHeight: 0 }}>
      <div style={{ padding: "0 32px 26px", overflowY: "auto", minHeight: 0 }}>
        <SectionLabel>Método de pago</SectionLabel>
        <div style={{ marginBottom: 28 }}>
          <MethodPicker value={method} onChange={setMethod} />
        </div>

        {tipEnabled && (
          <>
            <SectionLabel>
              Propina <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
            </SectionLabel>
            <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
              {[0, 10, 15, 20].map((p) => (
                <button
                  key={p}
                  onClick={() => setTipPct(p)}
                  style={{
                    flex: 1,
                    minWidth: 70,
                    padding: "14px 8px",
                    borderRadius: 14,
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                    fontWeight: 800,
                    fontSize: 16,
                    border: "2px solid " + (tipPct === p ? "var(--primary)" : "var(--line)"),
                    background: tipPct === p ? "var(--primary)" : "#fff",
                    color: tipPct === p ? "#fff" : "var(--ink)",
                    transition: "all .1s ease",
                  }}
                >
                  {p === 0 ? "Sin propina" : p + "%"}
                  {p > 0 && <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>{money(Math.round(subtotal * p) / 100)}</div>}
                </button>
              ))}
            </div>
          </>
        )}

        {method === "efectivo" && (
          <>
            <SectionLabel>Efectivo recibido</SectionLabel>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {quickUniq.map((q, i) => (
                <button
                  key={q}
                  onClick={() => setReceived(String(q))}
                  style={{
                    flex: "1 1 90px",
                    padding: "13px 8px",
                    borderRadius: 14,
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                    fontWeight: 800,
                    fontSize: 16,
                    border: "2px solid " + (recNum === q ? "var(--primary)" : "var(--line)"),
                    background: recNum === q ? "var(--primary-soft)" : "#fff",
                    color: recNum === q ? "var(--primary)" : "var(--ink)",
                  }}
                >
                  {i === 0 ? "Exacto" : money(q)}
                </button>
              ))}
            </div>
            <input
              value={received}
              onChange={(e) => setReceived(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="Otro monto…"
              style={{ width: "100%", padding: "14px 18px", border: "2px solid var(--line)", borderRadius: 14, fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: "var(--navy)", outline: "none", boxSizing: "border-box" }}
            />
          </>
        )}
      </div>

      {/* derecha: resumen */}
      <div style={{ background: "#fff", borderLeft: "2px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 26px 0" }}>
          {cart.map((l) => (
            <div key={l.uid} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1.5px dashed var(--line)", fontSize: 14.5 }}>
              <span style={{ color: "var(--ink)" }}>
                <b style={{ color: "var(--navy)" }}>{l.qty}×</b> {l.name}
                {l.size ? " · " + l.size.name : ""}
              </span>
              <span style={{ fontWeight: 800, color: "var(--navy)", whiteSpace: "nowrap" }}>{money(lineTotal(l))}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "18px 26px 24px", borderTop: "2px solid var(--line)", flexShrink: 0 }}>
          <Row label="Subtotal" value={money(subtotal)} />
          {tipEnabled && tipAmt > 0 && <Row label={"Propina " + tipPct + "%"} value={money(tipAmt)} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 16px", paddingTop: 12, borderTop: "2px solid var(--line)" }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>Total</span>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--navy)" }}>{money(total)}</span>
          </div>
          {method === "efectivo" && recNum > 0 && (
            <div style={{ background: change >= 0 ? "var(--primary-soft)" : "oklch(0.94 0.05 25)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: change >= 0 ? "var(--primary)" : "oklch(0.5 0.16 25)" }}>{change >= 0 ? "Cambio" : "Faltan"}</span>
              <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: change >= 0 ? "var(--primary)" : "oklch(0.5 0.16 25)" }}>{money(Math.abs(change))}</span>
            </div>
          )}
          <Btn kind="primary" size="lg" full disabled={!canCash} onClick={confirm} icon="check">
            {method === "efectivo" ? "Confirmar pago" : "Cobrar con tarjeta"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Pago dividido (N personas; por productos o por montos) ----------
const amountInp = {
  width: "100%",
  padding: "10px 14px 10px 28px",
  border: "2px solid var(--line)",
  borderRadius: 12,
  fontFamily: "var(--display)",
  fontSize: 18,
  fontWeight: 800,
  color: "var(--navy)",
  outline: "none",
  boxSizing: "border-box",
};

function PersonCard({ index, person, total, showAmount, onMethod, onReceived, onAmount, onRemove, canRemove }) {
  const recNum = parseFloat(person.received) || 0;
  const hasRec = person.method === "efectivo" && person.received !== "";
  const change = recNum - total;
  return (
    <div style={{ border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "14px 16px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>Persona {index}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>{money(total)}</span>
          {canRemove && (
            <button onClick={onRemove} title="Quitar persona" style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: "var(--cream)", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={18} />
            </button>
          )}
        </div>
      </div>
      {showAmount && (
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 800, fontSize: 14 }}>Q</span>
          <input value={person.amount} onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Monto a pagar" style={amountInp} />
        </div>
      )}
      <MethodPicker value={person.method} onChange={onMethod} compact />
      {person.method === "efectivo" && (
        <div style={{ marginTop: 10 }}>
          <CashInput value={person.received} onChange={onReceived} />
          {hasRec && (
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: change >= 0 ? "var(--primary-soft)" : "oklch(0.94 0.05 25)", display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14, color: change >= 0 ? "var(--primary)" : "oklch(0.5 0.16 25)" }}>
              <span>{change >= 0 ? "Cambio" : "Faltan"}</span>
              <span>{money(Math.abs(change))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SplitPay({ cart, subtotal, tipEnabled, onConfirm }) {
  const [mode, setMode] = useState("productos"); // "productos" | "montos"
  const [tipPct, setTipPct] = useState(0);
  const [people, setPeople] = useState([
    { id: 1, method: "efectivo", received: "", amount: "" },
    { id: 2, method: "tarjeta", received: "", amount: "" },
  ]);
  const [assign, setAssign] = useState(() => Object.fromEntries(cart.map((l) => [l.uid, 1])));
  const nextId = useRef(3);

  function addPerson() {
    if (people.length >= 8) return;
    setPeople((p) => [...p, { id: nextId.current++, method: "efectivo", received: "", amount: "" }]);
  }
  function removePerson(id) {
    if (people.length <= 2) return;
    const firstId = people.find((x) => x.id !== id).id;
    setAssign((prev) => {
      const out = { ...prev };
      Object.keys(out).forEach((uid) => {
        if (out[uid] === id) out[uid] = firstId;
      });
      return out;
    });
    setPeople((p) => p.filter((x) => x.id !== id));
  }
  function setPerson(id, field, value) {
    setPeople((p) => p.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }
  function splitEqually() {
    const n = people.length;
    const each = Math.floor((subtotal / n) * 100) / 100;
    setPeople((p) => p.map((x, i) => ({ ...x, amount: String(i === n - 1 ? Math.round((subtotal - each * (n - 1)) * 100) / 100 : each) })));
  }

  // Total por persona según el modo
  const totalsByPerson = useMemo(() => {
    const m = {};
    people.forEach((p) => (m[p.id] = 0));
    if (mode === "productos") {
      cart.forEach((l) => {
        if (m[assign[l.uid]] != null) m[assign[l.uid]] += lineTotal(l);
      });
    } else {
      people.forEach((p) => (m[p.id] = parseFloat(p.amount) || 0));
    }
    return m;
  }, [people, assign, mode, cart]);

  const assignedSum = people.reduce((s, p) => s + (totalsByPerson[p.id] || 0), 0);
  const remaining = Math.round((subtotal - assignedSum) * 100) / 100;

  // Propina sobre el subtotal, repartida proporcionalmente a lo que paga cada
  // persona (el último que paga absorbe el redondeo para cuadrar al centavo).
  const tipAmt = tipEnabled ? Math.round(subtotal * tipPct) / 100 : 0;
  const totalWithTip = Math.round((subtotal + tipAmt) * 100) / 100;
  const payByPerson = useMemo(() => {
    const out = {};
    people.forEach((p) => (out[p.id] = Math.round((totalsByPerson[p.id] || 0) * 100) / 100));
    if (tipAmt <= 0 || assignedSum <= 0) return out;
    const payers = people.filter((p) => (totalsByPerson[p.id] || 0) > 0.001);
    let acc = 0;
    payers.forEach((p, i) => {
      const share = totalsByPerson[p.id];
      const tipShare = i === payers.length - 1 ? Math.round((tipAmt - acc) * 100) / 100 : Math.round((share / assignedSum) * tipAmt * 100) / 100;
      acc += tipShare;
      out[p.id] = Math.round((share + tipShare) * 100) / 100;
    });
    return out;
  }, [people, totalsByPerson, tipAmt, assignedSum]);

  function cashOk(p) {
    const total = payByPerson[p.id] || 0;
    if (p.method !== "efectivo" || p.received === "") return true;
    return (parseFloat(p.received) || 0) >= total - 0.001;
  }
  const allCashOk = people.every(cashOk);
  const amountsOk = mode === "productos" || Math.abs(remaining) < 0.01;
  const canConfirm = allCashOk && amountsOk && people.some((p) => (totalsByPerson[p.id] || 0) > 0.001);

  function confirm() {
    const parts = people
      .map((p, i) => {
        const total = payByPerson[p.id] || 0;
        const recNum = parseFloat(p.received) || 0;
        const usedRec = p.method === "efectivo" && p.received !== "";
        return {
          person: i + 1,
          method: p.method,
          total,
          received: p.method === "efectivo" ? (usedRec ? recNum : total) : total,
          change: usedRec ? Math.max(0, recNum - total) : 0,
        };
      })
      .filter((p) => p.total > 0.001);
    onConfirm({ split: true, method: "mixto", tip: tipAmt, tipPct, subtotal, total: totalWithTip, parts });
  }

  const tabBtn = (id, lbl) => (
    <button
      key={id}
      onClick={() => setMode(id)}
      style={{
        padding: "12px 18px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--ui)",
        fontWeight: 800,
        fontSize: 14.5,
        background: mode === id ? "#fff" : "transparent",
        color: mode === id ? "var(--navy)" : "var(--muted)",
        boxShadow: mode === id ? "0 2px 6px rgba(58,65,88,.12)" : "none",
        transition: "all .12s ease",
      }}
    >
      {lbl}
    </button>
  );

  return (
    <div className="fuwa-split" style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 390px", minHeight: 0 }}>
      <div style={{ padding: "0 32px 26px", overflowY: "auto", minHeight: 0 }}>
        {/* controles: modo + número de personas */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 6, background: "var(--cream)", padding: 5, borderRadius: 999 }}>
            {tabBtn("productos", "Por productos")}
            {tabBtn("montos", "Por montos")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--muted)" }}>Personas</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, border: "2px solid var(--line)", borderRadius: 999, padding: 3 }}>
              <button onClick={() => removePerson(people[people.length - 1].id)} disabled={people.length <= 2} style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "var(--cream)", cursor: people.length <= 2 ? "not-allowed" : "pointer", color: "var(--navy)", opacity: people.length <= 2 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="minus" size={17} />
              </button>
              <span style={{ width: 32, textAlign: "center", fontWeight: 800, fontSize: 16, fontFamily: "var(--display)" }}>{people.length}</span>
              <button onClick={addPerson} disabled={people.length >= 8} style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "var(--cream)", cursor: people.length >= 8 ? "not-allowed" : "pointer", color: "var(--navy)", opacity: people.length >= 8 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="plus" size={17} />
              </button>
            </div>
          </div>
        </div>

        {tipEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--muted)", marginRight: 4 }}>Propina</span>
            {[0, 10, 15, 20].map((p) => (
              <button
                key={p}
                onClick={() => setTipPct(p)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  fontWeight: 800,
                  fontSize: 14.5,
                  border: "2px solid " + (tipPct === p ? "var(--primary)" : "var(--line)"),
                  background: tipPct === p ? "var(--primary)" : "#fff",
                  color: tipPct === p ? "#fff" : "var(--ink)",
                  transition: "all .1s ease",
                }}
              >
                {p === 0 ? "Sin propina" : `${p}% · ${money(Math.round(subtotal * p) / 100)}`}
              </button>
            ))}
          </div>
        )}

        {mode === "productos" ? (
          <>
            <SectionLabel>Asigna cada producto a una persona</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cart.map((l) => (
                <div key={l.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "2px solid var(--line)", borderRadius: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)" }}>
                      {l.qty}× {l.name}
                      {l.size ? " · " + l.size.name : ""}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>{money(lineTotal(l))}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, background: "var(--cream)", padding: 4, borderRadius: 999, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {people.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => setAssign((prev) => ({ ...prev, [l.uid]: p.id }))}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "var(--display)",
                          fontWeight: 800,
                          fontSize: 17,
                          background: assign[l.uid] === p.id ? "var(--primary)" : "transparent",
                          color: assign[l.uid] === p.id ? "#fff" : "var(--muted)",
                          transition: "all .12s ease",
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <SectionLabel>Escribe cuánto paga cada persona</SectionLabel>
            <button onClick={splitEqually} style={{ background: "none", border: "2px solid var(--line)", borderRadius: 999, padding: "11px 16px", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--primary)", fontFamily: "var(--ui)", marginBottom: 12 }}>
              Partes iguales
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))", gap: 14, marginTop: mode === "productos" ? 22 : 0 }}>
          {people.map((p, i) => (
            <PersonCard
              key={p.id}
              index={i + 1}
              person={p}
              total={payByPerson[p.id] || 0}
              showAmount={mode === "montos"}
              onMethod={(v) => setPerson(p.id, "method", v)}
              onReceived={(v) => setPerson(p.id, "received", v)}
              onAmount={(v) => setPerson(p.id, "amount", v)}
              onRemove={() => removePerson(p.id)}
              canRemove={people.length > 2}
            />
          ))}
        </div>
      </div>

      {/* derecha: resumen */}
      <div style={{ background: "#fff", borderLeft: "2px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "24px 26px 14px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19, color: "var(--navy)" }}>Resumen dividido</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 2 }}>{people.length} personas</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 26px" }}>
          {people.map((p, i) => (
            <Row key={p.id} label={`Persona ${i + 1} · ${p.method === "efectivo" ? "Efectivo" : "Tarjeta"}`} value={money(payByPerson[p.id] || 0)} strong />
          ))}
          {mode === "montos" && Math.abs(remaining) >= 0.01 && (
            <Row label={remaining > 0 ? "Falta por asignar" : "Te pasaste por"} value={money(Math.abs(remaining))} />
          )}
        </div>
        <div style={{ padding: "18px 26px 24px", borderTop: "2px solid var(--line)", flexShrink: 0 }}>
          {tipAmt > 0 && <Row label={"Propina " + tipPct + "%"} value={money(tipAmt)} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 16px" }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>Total</span>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--navy)" }}>{money(totalWithTip)}</span>
          </div>
          {!amountsOk && <div style={{ fontSize: 13, color: "oklch(0.55 0.16 25)", fontWeight: 800, marginBottom: 10, textAlign: "center" }}>Los montos deben sumar exactamente el total.</div>}
          {amountsOk && !allCashOk && <div style={{ fontSize: 13, color: "oklch(0.55 0.16 25)", fontWeight: 800, marginBottom: 10, textAlign: "center" }}>El efectivo recibido no cubre el total de alguna persona.</div>}
          <Btn kind="primary" size="lg" full disabled={!canConfirm} onClick={confirm} icon="check">
            Confirmar pago dividido
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function PayScreen({ cart, orderType, table, tipEnabled, onBack, onConfirm }) {
  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  const [mode, setMode] = useState("single");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "26px 32px 14px", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontWeight: 800, fontSize: 15, fontFamily: "var(--ui)", padding: "10px 12px", margin: "-10px 0 4px -12px" }}
        >
          <Icon name="back" size={20} /> Volver a la orden
        </button>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--navy)", margin: "0 0 4px" }}>Cobrar</h1>
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>
              {orderType}
              {table ? ` · Mesa ${table.label} (${table.areaName})` : ""} · {cart.reduce((s, l) => s + l.qty, 0)} productos · el cliente paga antes de consumir.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, background: "var(--cream)", padding: 5, borderRadius: 999 }}>
            {[
              ["single", "Una cuenta"],
              ["split", "Dividir cuenta"],
            ].map(([id, lbl]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                style={{
                  padding: "12px 22px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  fontWeight: 800,
                  fontSize: 14.5,
                  background: mode === id ? "#fff" : "transparent",
                  color: mode === id ? "var(--navy)" : "var(--muted)",
                  boxShadow: mode === id ? "0 2px 6px rgba(58,65,88,.12)" : "none",
                  transition: "all .12s ease",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === "single" ? (
          <SinglePay cart={cart} subtotal={subtotal} tipEnabled={tipEnabled} onConfirm={onConfirm} />
        ) : (
          <SplitPay cart={cart} subtotal={subtotal} tipEnabled={tipEnabled} onConfirm={onConfirm} />
        )}
      </div>
    </div>
  );
}
