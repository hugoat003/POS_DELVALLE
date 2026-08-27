/* FUWA POS — modal de personalización: tamaño, modificadores, nota y cantidad. */
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn, overlay, sheet, iconBtn, qtyBtn } from "../components/ui.jsx";
import { money } from "../lib/format.js";

function Group({ label, children }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function OptBtn({ active, label, hint, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 18px",
        minHeight: 48 /* target táctil aunque la opción no tenga hint de precio */,
        borderRadius: 14,
        cursor: "pointer",
        fontFamily: "var(--ui)",
        border: "2px solid " + (active ? color || "var(--navy)" : "var(--line)"),
        background: active ? color || "var(--navy)" : "#fff",
        color: active ? "#fff" : "var(--ink)",
        fontWeight: 800,
        fontSize: 15,
        transition: "all .1s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1.2,
      }}
    >
      <span>{label}</span>
      {hint && <span style={{ fontSize: 11.5, opacity: 0.8, fontWeight: 700 }}>{hint}</span>}
    </button>
  );
}

export function CustomizeModal({ product, cat, modGroupsMap, initialLine, onClose, onAdd }) {
  const sizes = product.sizes;
  const modGroups = (product.mods || []).map((id) => modGroupsMap[id]).filter(Boolean);
  const [size, setSize] = useState(() => {
    if (!sizes) return null;
    if (initialLine && initialLine.size) return sizes.find((s) => s.name === initialLine.size.name) || sizes[0];
    return sizes.find((s) => s.delta === 0) || sizes[0];
  });
  const [single, setSingle] = useState(() => {
    const init = {};
    modGroups.forEach((g) => {
      if (g.type !== "single") return;
      const picked = initialLine && (initialLine.mods || []).find((m) => m.group === g.id);
      init[g.id] = picked ? g.options.find((o) => o.name === picked.name) || g.options[0] : g.options[g.id === "azucar" ? g.options.length - 1 : 0];
    });
    return init;
  });
  const [multi, setMulti] = useState(() => {
    const init = {};
    modGroups.forEach((g) => {
      if (g.type !== "multi" || !initialLine) return;
      const picked = (initialLine.mods || []).filter((m) => m.group === g.id);
      if (!picked.length) return;
      const map = {};
      picked.forEach((m) => {
        const opt = g.options.find((o) => o.name === m.name);
        if (opt) map[opt.name] = opt;
      });
      init[g.id] = map;
    });
    return init;
  }); // {groupId: {optName: option}}
  const [qty, setQty] = useState(initialLine ? initialLine.qty : 1);
  const [note, setNote] = useState(initialLine ? initialLine.note || "" : "");

  const chosenMods = useMemo(() => {
    const arr = [];
    Object.entries(single).forEach(([gid, opt]) => {
      if (opt && opt.delta !== undefined) arr.push({ group: gid, name: opt.name, delta: opt.delta });
    });
    Object.values(multi).forEach((opts) => Object.values(opts).forEach((o) => arr.push({ group: "extras", name: o.name, delta: o.delta })));
    return arr;
  }, [single, multi]);

  let unit = product.price + (size ? size.delta : 0);
  chosenMods.forEach((m) => (unit += m.delta));

  function toggleMulti(gid, opt) {
    setMulti((prev) => {
      const grp = { ...(prev[gid] || {}) };
      if (grp[opt.name]) delete grp[opt.name];
      else grp[opt.name] = opt;
      return { ...prev, [gid]: grp };
    });
  }

  function commit() {
    onAdd({
      uid: initialLine ? initialLine.uid : "L" + Date.now() + Math.random().toString(36).slice(2, 6),
      productId: product.id,
      name: product.name,
      basePrice: product.price,
      size: size ? { name: size.name, delta: size.delta } : null,
      mods: chosenMods,
      note: note.trim(),
      qty,
      catId: cat.id,
    });
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div className="fuwa-sheet-tall" onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ background: cat.tint, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: cat.ink, textTransform: "uppercase", letterSpacing: 1 }}>
              {cat.icon} {cat.name}
            </div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)", lineHeight: 1.1, marginTop: 2 }}>{product.name}</div>
          </div>
          <button onClick={onClose} style={iconBtn}>
            <Icon name="x" size={22} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>
          {sizes && (
            <Group label="Tamaño">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {sizes.map((s) => (
                  <OptBtn
                    key={s.name}
                    active={size && size.name === s.name}
                    onClick={() => setSize(s)}
                    label={s.name}
                    hint={s.delta === 0 ? "" : s.delta > 0 ? "+" + money(s.delta) : "−" + money(-s.delta)}
                    color={cat.ink}
                  />
                ))}
              </div>
            </Group>
          )}
          {modGroups.map((g) => (
            <Group key={g.id} label={g.label}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {g.options.map((o) => {
                  const isMulti = g.type === "multi";
                  const active = isMulti ? !!(multi[g.id] && multi[g.id][o.name]) : single[g.id] && single[g.id].name === o.name;
                  return (
                    <OptBtn
                      key={o.name}
                      active={active}
                      color={cat.ink}
                      onClick={() => (isMulti ? toggleMulti(g.id, o) : setSingle((p) => ({ ...p, [g.id]: o })))}
                      label={o.name}
                      hint={o.delta > 0 ? "+" + money(o.delta) : ""}
                    />
                  );
                })}
              </div>
            </Group>
          ))}
          <Group label="Nota para barra / cocina">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ej. extra caliente, poco hielo, nombre del cliente…"
              style={{
                width: "100%",
                border: "2px solid var(--line)",
                borderRadius: "calc(var(--r)*0.6)",
                padding: "10px 12px",
                fontFamily: "var(--ui)",
                fontSize: 14.5,
                resize: "none",
                color: "var(--ink)",
                outline: "none",
              }}
            />
          </Group>
        </div>

        {/* footer */}
        <div style={{ borderTop: "2px solid var(--line)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, border: "2px solid var(--line)", borderRadius: 999, padding: 4 }}>
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={qtyBtn}>
              <Icon name="minus" size={18} />
            </button>
            <span style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: 18 }}>{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} style={qtyBtn}>
              <Icon name="plus" size={18} />
            </button>
          </div>
          <Btn kind="primary" size="lg" full onClick={commit} style={{ flex: 1 }}>
            {initialLine ? "Guardar cambios" : "Agregar"} · {money(unit * qty)}
          </Btn>
        </div>
      </div>
    </div>
  );
}
