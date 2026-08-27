/* FUWA POS — editor de menú: productos, opciones editables y categorías. */
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn, Pill, overlay, sheet, iconBtn } from "../components/ui.jsx";
import { money } from "../lib/format.js";
import { SIZES_BEBIDA, catColors } from "../data.js";
import { productCost } from "../lib/recipe.js";

const MOD_LIST = [
  { id: "leche", label: "Leche" },
  { id: "azucar", label: "Nivel de azúcar" },
  { id: "extras", label: "Extras" },
];

// Descarta filas a medio escribir (sin ingrediente o en cero) al guardar.
const cleanRecipe = (rows) =>
  (rows || [])
    .map((r) => ({ id: r.id, qty: Math.round((parseFloat(r.qty) || 0) * 1000) / 1000 }))
    .filter((r) => r.id && r.qty);

const inp = {
  width: "100%",
  padding: "11px 14px",
  border: "2px solid var(--line)",
  borderRadius: 12,
  fontFamily: "var(--ui)",
  fontSize: 15,
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, label }) {
  return (
    <button onClick={onChange} style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--ui)" }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          border: "2px solid " + (checked ? "var(--primary)" : "var(--line)"),
          background: checked ? "var(--primary)" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          flexShrink: 0,
          transition: "all .1s ease",
        }}
      >
        {checked && <Icon name="check" size={16} stroke={3} />}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
    </button>
  );
}

// ---------- Editor de receta (reutilizable) ----------
/* Lista de {id, qty}. Se usa para la receta base del producto, para el ajuste
   de cada tamaño y para lo que suma cada opción (extras, azúcar).
   `allowNegative` permite restar (un tamaño Chico lleva menos leche). */
function RecipeEditor({ value, onChange, ingredients, allowNegative, compact, empty }) {
  const rows = value || [];
  const byId = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const free = ingredients.filter((i) => !rows.some((r) => r.id === i.id));

  const setRow = (idx, patch) => onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => free.length && onChange([...rows, { id: free[0].id, qty: 0 }]);
  const delRow = (idx) => onChange(rows.filter((_, i) => i !== idx));

  return (
    <div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", padding: "4px 0 8px" }}>{empty || "Sin ingredientes: este producto no descuenta inventario."}</div>}
      {rows.map((r, i) => {
        const ing = byId[r.id];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: compact ? "5px 0" : "6px 0", borderTop: i ? "1px dashed var(--line)" : "none" }}>
            <select value={r.id} onChange={(e) => setRow(i, { id: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0, padding: compact ? "8px 10px" : "10px 12px", cursor: "pointer" }}>
              {!ing && <option value={r.id}>(ingrediente eliminado)</option>}
              {ingredients.map((x) => (
                <option key={x.id} value={x.id} disabled={x.id !== r.id && rows.some((rr) => rr.id === x.id)}>
                  {x.name}
                </option>
              ))}
            </select>
            <input
              value={r.qty}
              onChange={(e) => {
                const clean = allowNegative ? e.target.value.replace(/[^0-9.-]/g, "") : e.target.value.replace(/[^0-9.]/g, "");
                setRow(i, { qty: clean === "" || clean === "-" ? clean : parseFloat(clean) || 0 });
              }}
              inputMode="decimal"
              style={{ ...inp, width: 82, flexShrink: 0, padding: compact ? "8px 10px" : "10px 12px", fontFamily: "var(--display)", fontWeight: 800, textAlign: "right" }}
            />
            <span style={{ width: 34, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: "var(--muted)" }}>{ing ? ing.unit : ""}</span>
            <button onClick={() => delRow(i)} title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2, display: "flex", flexShrink: 0 }}>
              <Icon name="trash" size={17} />
            </button>
          </div>
        );
      })}
      {free.length > 0 && (
        <button
          onClick={addRow}
          style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", background: "none", border: "2px dashed var(--line)", borderRadius: 12, padding: compact ? "7px 12px" : "9px 16px", cursor: "pointer", color: "var(--primary)", fontWeight: 800, fontFamily: "var(--ui)", fontSize: compact ? 13 : 14 }}
        >
          <Icon name="plus" size={15} /> Agregar ingrediente
        </button>
      )}
    </div>
  );
}

// ---------- Formulario de producto ----------
function ProductForm({ initial, cats, ingredients, onCancel, onSave, onDelete }) {
  const [name, setName] = useState(initial.name || "");
  const [cat, setCat] = useState(initial.cat || cats[0].id);
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : "");
  const [desc, setDesc] = useState(initial.desc || "");
  const [hasSizes, setHasSizes] = useState(!!initial.sizes);
  const [sizes, setSizes] = useState(() => (initial.sizes ? initial.sizes.map((s) => ({ ...s })) : SIZES_BEBIDA.map((s) => ({ ...s }))));
  const [mods, setMods] = useState(initial.mods || []);
  const [icon, setIcon] = useState(initial.icon || "");
  const [image, setImage] = useState(initial.image || "");
  const [recipe, setRecipe] = useState(() => (initial.recipe || []).map((r) => ({ ...r })));
  const isNew = !initial.id;

  const ingById = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  // Costo del producto base (sin tamaño ni extras) y margen sobre el precio.
  const cost = productCost({ recipe }, ingById);
  const priceNum = parseFloat(price) || 0;
  const marginPct = priceNum > 0 ? Math.round(((priceNum - cost) / priceNum) * 100) : 0;

  function toggleMod(id) {
    setMods((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }
  function setSize(i, field, value) {
    setSizes((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: field === "delta" ? Math.round((parseFloat(value) || 0) * 100) / 100 : value } : s)));
  }
  function addSize() {
    setSizes((prev) => [...prev, { name: "Nuevo tamaño", delta: 0 }]);
  }
  function delSize(i) {
    setSizes((prev) => prev.filter((_, idx) => idx !== i));
  }
  function onImageFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      // Reescala la imagen a máx. 480px y la re-comprime para no saturar
      // el almacenamiento del navegador (localStorage tiene ~5MB).
      const img = new Image();
      img.onload = () => {
        const max = 480;
        let { width, height } = img;
        if (width > max || height > max) {
          const scale = max / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        setImage(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => setImage(r.result);
      img.src = r.result;
    };
    r.readAsDataURL(f);
  }
  const valid = name.trim() && parseFloat(price) > 0;

  function save() {
    onSave({
      id: initial.id || "p_" + Date.now().toString(36),
      cat,
      name: name.trim(),
      price: Math.round(parseFloat(price) * 100) / 100,
      desc: desc.trim(),
      sizes: hasSizes ? sizes.map((s) => ({ name: s.name.trim() || "Tamaño", delta: s.delta, recipe: cleanRecipe(s.recipe) })) : null,
      mods,
      recipe: cleanRecipe(recipe),
      icon: icon.trim() || null,
      image: image || null,
    });
  }
  const catObj = cats.find((c) => c.id === cat) || cats[0];

  return (
    <div onClick={onCancel} style={overlay}>
      <div className="fuwa-sheet-tall" onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 520, display: "flex", flexDirection: "column" }}>
        <div style={{ background: catObj.tint, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)" }}>{isNew ? "Nuevo producto" : "Editar producto"}</div>
          <button onClick={onCancel} style={iconBtn}>
            <Icon name="x" size={22} />
          </button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Matcha Latte" style={inp} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 14 }}>
            <Field label="Categoría">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {cats.map((c) => (
                  <Pill key={c.id} active={cat === c.id} color={c.ink} onClick={() => setCat(c.id)} style={{ fontSize: 13.5, padding: "7px 13px" }}>
                    <span style={{ marginRight: 4 }}>{c.icon}</span>
                    {c.name}
                  </Pill>
                ))}
              </div>
            </Field>
            <Field label="Precio base (Q)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800, fontSize: 19 }}
              />
            </Field>
          </div>
          <Field label="Descripción">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Breve descripción" style={inp} />
          </Field>

          {/* Imagen o icono */}
          <Field label="Imagen o icono (opcional)">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: 14, background: catObj.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, overflow: "hidden", flexShrink: 0 }}>
                {image ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : icon || catObj.icon}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Emoji, ej. 🍓 (vacío usa el de la categoría)" style={inp} />
                <div style={{ display: "flex", gap: 8 }}>
                  <label
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12, border: "2px solid var(--line)", cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: "var(--navy)" }}
                  >
                    <Icon name="plus" size={16} /> Subir imagen
                    <input type="file" accept="image/*" onChange={onImageFile} style={{ display: "none" }} />
                  </label>
                  {image && (
                    <button onClick={() => setImage("")} style={{ padding: "9px 14px", borderRadius: 12, border: "2px solid var(--line)", background: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: "var(--muted)" }}>
                      Quitar imagen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Field>

          {/* Tamaños con precio por producto */}
          <Field label="Tamaños">
            <CheckRow checked={hasSizes} onChange={() => setHasSizes((v) => !v)} label="Este producto tiene tamaños" />
            {hasSizes && (
              <div style={{ marginTop: 12, border: "2px solid var(--line)", borderRadius: 12, padding: "6px 14px 12px" }}>
                <div style={{ display: "flex", gap: 10, padding: "8px 0 4px", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                  <span style={{ flex: 1 }}>Tamaño</span>
                  <span style={{ width: 130 }}>Precio vs. base</span>
                  <span style={{ width: 30 }} />
                </div>
                {sizes.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "1px dashed var(--line)" }}>
                    <input value={s.name} onChange={(e) => setSize(i, "name", e.target.value)} style={{ ...inp, flex: 1 }} />
                    <div style={{ position: "relative", width: 130, flexShrink: 0 }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 800, fontSize: 14 }}>Q</span>
                      <input
                        value={s.delta}
                        onChange={(e) => setSize(i, "delta", e.target.value.replace(/[^0-9.-]/g, ""))}
                        inputMode="decimal"
                        title="Diferencia respecto al precio base (puede ser negativa, ej. -3 para Chico)"
                        style={{ ...inp, paddingLeft: 30, fontFamily: "var(--display)", fontWeight: 800 }}
                      />
                    </div>
                    <button onClick={() => delSize(i)} title="Eliminar tamaño" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex", width: 30 }}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addSize}
                  style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "none", border: "2px dashed var(--line)", borderRadius: 12, padding: "9px 16px", cursor: "pointer", color: "var(--primary)", fontWeight: 800, fontFamily: "var(--ui)", fontSize: 14 }}
                >
                  <Icon name="plus" size={16} /> Agregar tamaño
                </button>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>
                  El valor es la diferencia sobre el precio base. Usa negativos para cobrar menos (ej. Chico −3).
                </div>
              </div>
            )}
          </Field>

          <Field label="Modificadores disponibles">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MOD_LIST.map((m) => (
                <CheckRow key={m.id} checked={mods.includes(m.id)} onChange={() => toggleMod(m.id)} label={m.label} />
              ))}
            </div>
          </Field>

          {/* Receta: lo que consume UNA unidad. Las ventas lo descuentan solas. */}
          <Field label="Receta (consumo por unidad)">
            <div style={{ border: "2px solid var(--line)", borderRadius: 12, padding: "10px 14px 12px" }}>
              <RecipeEditor value={recipe} onChange={setRecipe} ingredients={ingredients} />
              {recipe.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "2px solid var(--line)" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
                    Costo {money(cost)} · Margen{" "}
                    <b style={{ color: marginPct >= 60 ? "oklch(0.5 0.11 150)" : marginPct >= 35 ? "oklch(0.55 0.12 85)" : "oklch(0.5 0.16 25)" }}>{marginPct}%</b>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Ganancia {money(Math.max(0, priceNum - cost))}</span>
                </div>
              )}
            </div>
          </Field>

          {/* Ajuste de receta por tamaño: Grande lleva más, Chico menos. */}
          {hasSizes && ingredients.length > 0 && (
            <Field label="Ajuste de receta por tamaño" hint="Cuánto SUMA o RESTA cada tamaño sobre la receta base. Usa negativos para el tamaño chico.">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sizes.map((s, i) => (
                  <div key={i} style={{ border: "2px solid var(--line)", borderRadius: 12, padding: "10px 14px 12px" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "var(--navy)", marginBottom: 6 }}>{s.name || "Tamaño"}</div>
                    <RecipeEditor
                      value={s.recipe || []}
                      onChange={(next) => setSizes((prev) => prev.map((x, idx) => (idx === i ? { ...x, recipe: next } : x)))}
                      ingredients={ingredients}
                      allowNegative
                      compact
                      empty="Sin ajuste: consume lo mismo que la receta base."
                    />
                  </div>
                ))}
              </div>
            </Field>
          )}
        </div>
        <div style={{ borderTop: "2px solid var(--line)", padding: "16px 24px", display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
          {!isNew && (
            <Btn kind="danger" size="md" icon="trash" onClick={() => onDelete(initial.id)}>
              Eliminar
            </Btn>
          )}
          <div style={{ flex: 1 }} />
          <Btn kind="ghost" size="md" onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn kind="primary" size="md" disabled={!valid} onClick={save} icon="check">
            Guardar
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Editor de modificadores (leche, azúcar, extras) ----------
function ModifiersEditor({ mods, setMods, ingredients = [] }) {
  const order = ["leche", "azucar", "extras"];
  const typeLabel = { single: "El cliente elige una opción", multi: "El cliente puede elegir varias" };
  const [openOpt, setOpenOpt] = useState(null); // "grupo:indice" con la receta desplegada

  function setOptRecipe(gid, i, patch) {
    setMods((prev) => ({
      ...prev,
      [gid]: { ...prev[gid], options: prev[gid].options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) },
    }));
  }
  function setOpt(gid, i, field, value) {
    setMods((prev) => {
      const g = prev[gid];
      const opts = g.options.map((o, idx) =>
        idx === i ? { ...o, [field]: field === "delta" ? Math.round((parseFloat(value) || 0) * 100) / 100 : value } : o
      );
      return { ...prev, [gid]: { ...g, options: opts } };
    });
  }
  function addOpt(gid) {
    setMods((prev) => ({ ...prev, [gid]: { ...prev[gid], options: [...prev[gid].options, { name: "Nueva opción", delta: 0 }] } }));
  }
  function delOpt(gid, i) {
    setMods((prev) => ({ ...prev, [gid]: { ...prev[gid], options: prev[gid].options.filter((_, idx) => idx !== i) } }));
  }

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: "var(--primary-soft)", color: "var(--primary)", borderRadius: "var(--r)", padding: "14px 18px", fontSize: 14.5, fontWeight: 700, display: "flex", gap: 10, alignItems: "center", lineHeight: 1.4 }}>
        <span style={{ flexShrink: 0 }}>
          <Icon name="note" size={20} />
        </span>
        Define cuánto se cobra de más por cada opción. <b>+Q0.00</b> = sin costo adicional. Estos precios aplican a todos los productos que usen la opción.
      </div>
      {order.map((gid) => {
        const g = mods[gid];
        if (!g) return null;
        return (
          <div key={gid} style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "2px solid var(--line)" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>{g.label}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{typeLabel[g.type]}</div>
            </div>
            <div style={{ padding: "6px 20px 16px" }}>
              <div style={{ display: "flex", gap: 10, padding: "8px 0 4px", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                <span style={{ flex: 1 }}>Opción</span>
                <span style={{ width: 130 }}>Recargo</span>
                <span style={{ width: 30 }} />
              </div>
              {g.options.map((o, i) => {
                const key = gid + ":" + i;
                const open = openOpt === key;
                const isSwap = !!o.swap;
                const uses = isSwap ? 1 : (o.recipe || []).length;
                return (
                  <div key={i} style={{ borderTop: "1px dashed var(--line)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0" }}>
                      <input value={o.name} onChange={(e) => setOpt(gid, i, "name", e.target.value)} style={{ ...inp, flex: 1 }} />
                      <div style={{ position: "relative", width: 130, flexShrink: 0 }}>
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontWeight: 800, fontSize: 14 }}>+Q</span>
                        <input
                          value={o.delta}
                          onChange={(e) => setOpt(gid, i, "delta", e.target.value.replace(/[^0-9.]/g, ""))}
                          inputMode="decimal"
                          style={{ ...inp, paddingLeft: 40, fontFamily: "var(--display)", fontWeight: 800 }}
                        />
                      </div>
                      {/* Consumo de la opción: plegado para no saturar la lista. */}
                      <button
                        onClick={() => setOpenOpt(open ? null : key)}
                        title="Ingredientes que consume esta opción"
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, border: "2px solid " + (uses ? "var(--primary)" : "var(--line)"), background: uses ? "var(--primary-soft)" : "#fff", color: uses ? "var(--primary)" : "var(--muted)", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "var(--ui)", whiteSpace: "nowrap", flexShrink: 0 }}
                      >
                        <Icon name="box" size={15} /> {uses ? (isSwap ? "Reemplaza" : uses) : "—"}
                      </button>
                      <button onClick={() => delOpt(gid, i)} title="Eliminar opción" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex", width: 30 }}>
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                    {open && (
                      <div style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 14px", margin: "0 0 10px" }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <Pill active={!isSwap} onClick={() => setOptRecipe(gid, i, { swap: undefined })} style={{ fontSize: 13, padding: "7px 14px" }}>
                            Suma ingredientes
                          </Pill>
                          <Pill
                            active={isSwap}
                            onClick={() => setOptRecipe(gid, i, { swap: o.swap || { from: ingredients[0] && ingredients[0].id, to: ingredients[1] && ingredients[1].id }, recipe: undefined })}
                            style={{ fontSize: 13, padding: "7px 14px" }}
                          >
                            Reemplaza uno por otro
                          </Pill>
                        </div>
                        {isSwap ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <select value={o.swap.from || ""} onChange={(e) => setOptRecipe(gid, i, { swap: { ...o.swap, from: e.target.value } })} style={{ ...inp, flex: 1, minWidth: 140, cursor: "pointer" }}>
                              {ingredients.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                            </select>
                            <Icon name="back" size={18} style={{ transform: "scaleX(-1)" }} />
                            <select value={o.swap.to || ""} onChange={(e) => setOptRecipe(gid, i, { swap: { ...o.swap, to: e.target.value } })} style={{ ...inp, flex: 1, minWidth: 140, cursor: "pointer" }}>
                              {ingredients.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                            </select>
                            <div style={{ fontSize: 12, color: "var(--muted)", width: "100%", lineHeight: 1.4 }}>
                              Cambia <b>toda</b> la cantidad que el producto lleve del primero por el segundo, sea 120 o 180 ml.
                            </div>
                          </div>
                        ) : (
                          <RecipeEditor
                            value={o.recipe || []}
                            onChange={(next) => setOptRecipe(gid, i, { recipe: next })}
                            ingredients={ingredients}
                            compact
                            empty="Esta opción no consume ingredientes extra."
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => addOpt(gid)}
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  background: "none",
                  border: "2px dashed var(--line)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--primary)",
                  fontWeight: 800,
                  fontFamily: "var(--ui)",
                  fontSize: 14.5,
                }}
              >
                <Icon name="plus" size={18} /> Agregar opción
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Editor de categorías ----------
function CategoriesEditor({ cats, setCats, counts, onDelete }) {
  function setCat(id, field, value) {
    setCats((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (field === "hue") {
          const hue = Math.max(0, Math.min(360, parseInt(value, 10) || 0));
          return { ...c, hue, ...catColors(hue) };
        }
        return { ...c, [field]: value };
      })
    );
  }
  function addCat() {
    const hue = 200;
    setCats((prev) => [...prev, { id: "c_" + Date.now().toString(36), name: "Nueva categoría", icon: "🍽️", hue, ...catColors(hue) }]);
  }

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--primary-soft)", color: "var(--primary)", borderRadius: "var(--r)", padding: "14px 18px", fontSize: 14.5, fontWeight: 700, display: "flex", gap: 10, alignItems: "center", lineHeight: 1.4 }}>
        <span style={{ flexShrink: 0 }}>
          <Icon name="note" size={20} />
        </span>
        Crea y personaliza las categorías del menú. El color se ajusta con el tono; cada categoría usa su propio acento pastel.
      </div>
      {cats.map((c) => (
        <div key={c.id} style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>{c.icon}</div>
          <input value={c.icon} onChange={(e) => setCat(c.id, "icon", e.target.value)} title="Emoji" style={{ ...inp, width: 64, textAlign: "center", fontSize: 20, flexShrink: 0 }} />
          <input value={c.name} onChange={(e) => setCat(c.id, "name", e.target.value)} style={{ ...inp, flex: 1, minWidth: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 150, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Tono · {c.hue}</span>
            <input type="range" min={0} max={360} value={c.hue} onChange={(e) => setCat(c.id, "hue", e.target.value)} style={{ width: "100%", accentColor: c.ink }} />
          </div>
          <div style={{ width: 54, textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{counts[c.id] || 0} prod.</div>
            <button onClick={() => onDelete(c.id)} title="Eliminar categoría" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "inline-flex" }}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={addCat}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "none", border: "2px dashed var(--line)", borderRadius: "var(--r)", padding: "12px 16px", cursor: "pointer", color: "var(--primary)", fontWeight: 800, fontFamily: "var(--ui)", fontSize: 14.5 }}
      >
        <Icon name="plus" size={18} /> Agregar categoría
      </button>
    </div>
  );
}

export function MenuEditor({ menu, setMenu, mods, setMods, cats, setCats, ingredients = [] }) {
  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const ingById = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [activeCat, setActiveCat] = useState("all");
  const [editing, setEditing] = useState(null); // product or {} for new
  const [tab, setTab] = useState("productos");

  const list = menu.filter((p) => activeCat === "all" || p.cat === activeCat);
  const counts = useMemo(() => {
    const m = {};
    menu.forEach((p) => (m[p.cat] = (m[p.cat] || 0) + 1));
    return m;
  }, [menu]);

  function upsert(prod) {
    setMenu((prev) => {
      const i = prev.findIndex((p) => p.id === prod.id);
      if (i === -1) return [...prev, prod];
      const copy = [...prev];
      copy[i] = prod;
      return copy;
    });
    setEditing(null);
  }
  function remove(id) {
    setMenu((prev) => prev.filter((p) => p.id !== id));
    setEditing(null);
  }
  function removeCat(id) {
    if (menu.some((p) => p.cat === id)) {
      window.alert("No puedes eliminar una categoría con productos. Mueve o elimina esos productos primero.");
      return;
    }
    if (cats.length <= 1) {
      window.alert("Debe existir al menos una categoría.");
      return;
    }
    setCats((prev) => prev.filter((c) => c.id !== id));
    if (activeCat === id) setActiveCat("all");
  }

  const TABS = [
    ["productos", "Productos"],
    ["opciones", "Leche, azúcar y extras"],
    ["categorias", "Categorías"],
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "22px 32px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: 0 }}>Editor de menú</h1>
          {tab === "productos" && (
            <Btn kind="primary" size="md" icon="plus" onClick={() => setEditing({})}>
              Agregar producto
            </Btn>
          )}
        </div>
        <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 15 }}>Administra los productos, precios, tamaños, opciones y categorías de FUWA. Los cambios se guardan automáticamente.</p>
        <div style={{ display: "flex", gap: 6, background: "var(--cream)", padding: 5, borderRadius: 999, width: "fit-content", marginBottom: 16 }}>
          {TABS.map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "9px 20px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--ui)",
                fontWeight: 800,
                fontSize: 14,
                background: tab === id ? "#fff" : "transparent",
                color: tab === id ? "var(--navy)" : "var(--muted)",
                boxShadow: tab === id ? "0 2px 6px rgba(58,65,88,.12)" : "none",
                transition: "all .12s ease",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
        {tab === "productos" && (
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <Pill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
              Todo · {menu.length}
            </Pill>
            {cats.map((c) => (
              <Pill key={c.id} active={activeCat === c.id} color={c.ink} onClick={() => setActiveCat(c.id)}>
                <span style={{ marginRight: 6 }}>{c.icon}</span>
                {c.name}
              </Pill>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px" }}>
        {tab === "productos" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
              {list.map((p) => {
                const c = catById[p.cat] || cats[0];
                const opts = [p.sizes && "Tamaños", ...(p.mods || []).map((m) => MOD_LIST.find((x) => x.id === m) && MOD_LIST.find((x) => x.id === m).label)].filter(Boolean);
                return (
                  <button
                    key={p.id}
                    onClick={() => setEditing(p)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: "#fff",
                      border: "2px solid var(--line)",
                      borderRadius: "var(--r)",
                      padding: 14,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color .12s ease, transform .1s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = c.ink;
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--line)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, overflow: "hidden" }}>
                      {p.image ? <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : p.icon || c.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>{p.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opts.length ? opts.join(" · ") : "Sin opciones"}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>{money(p.price)}</div>
                      {/* Margen: el dato que de verdad decide si el precio está bien. */}
                      {p.recipe && p.recipe.length > 0 ? (
                        (() => {
                          const cost = productCost(p, ingById);
                          const pct = p.price > 0 ? Math.round(((p.price - cost) / p.price) * 100) : 0;
                          return (
                            <div style={{ fontSize: 12, fontWeight: 800, color: pct >= 60 ? "oklch(0.5 0.11 150)" : pct >= 35 ? "oklch(0.55 0.12 85)" : "oklch(0.5 0.16 25)" }}>
                              margen {pct}%
                            </div>
                          );
                        })()
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>sin receta</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: c.ink, fontSize: 12.5, fontWeight: 800, justifyContent: "flex-end" }}>
                        <Icon name="edit" size={14} /> Editar
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {list.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", padding: 60, fontSize: 16 }}>No hay productos en esta categoría.</div>}
          </>
        ) : tab === "opciones" ? (
          <ModifiersEditor mods={mods} setMods={setMods} ingredients={ingredients} />
        ) : (
          <CategoriesEditor cats={cats} setCats={setCats} counts={counts} onDelete={removeCat} />
        )}
      </div>
      {editing && <ProductForm initial={editing} cats={cats} ingredients={ingredients} onCancel={() => setEditing(null)} onSave={upsert} onDelete={remove} />}
    </div>
  );
}
