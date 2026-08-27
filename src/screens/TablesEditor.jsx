/* FUWA POS — áreas de mesas: mapa por área (Salón, Terraza, Jardín…).
   Exporta:
   - AreaMap: plano del área con las mesas posicionadas en % (tap y arrastre).
   - TablePickerModal: modal para elegir mesa al tomar una orden "Para aquí".
   - TablesEditor: pantalla de administración (crear/renombrar/borrar áreas,
     agregar mesas y acomodarlas arrastrándolas en el mapa). */
import { useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn, Pill, overlay, sheet, iconBtn } from "../components/ui.jsx";

const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Siguiente número de mesa: el mayor label numérico de TODAS las áreas + 1,
// para que "Salón 1..6" y "Jardín 7..9" no repitan números en la comanda.
function nextTableLabel(areas) {
  const nums = areas.flatMap((a) => a.tables.map((t) => parseInt(t.label, 10))).filter((n) => !isNaN(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

// Límites del arrastre en % (para que la mesa no quede cortada por el borde).
const clampPct = (v, min, max) => Math.min(max, Math.max(min, v));

// Hueco libre para una mesa nueva: recorre una cuadrícula y devuelve la primera
// celda que no choque con una mesa existente. Sin esto todas caerían en el
// centro, apiladas e invisibles unas bajo otras.
function freeSpot(tables) {
  const COLS = [18, 40, 62, 84];
  const ROWS = [20, 40, 60, 80];
  for (const y of ROWS) {
    for (const x of COLS) {
      if (!tables.some((t) => Math.abs(t.x - x) < 10 && Math.abs(t.y - y) < 10)) return { x, y };
    }
  }
  // Cuadrícula llena: escalona a partir del centro para que siga siendo visible.
  const n = tables.length;
  return { x: clampPct(30 + (n % 8) * 5, 7, 93), y: clampPct(30 + (n % 8) * 4, 10, 90) };
}

// ---------- Plano del área ----------
// editable=false → tap selecciona (picker). editable=true → arrastrar mueve
// (onMove) y un tap corto selecciona (onTap) para renombrar/borrar.
export function AreaMap({ area, selectedId, onTap, editable, onMove, minHeight = 340 }) {
  const canvasRef = useRef(null);
  const drag = useRef(null); // { id, moved }

  function pctFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: clampPct(((e.clientX - rect.left) / rect.width) * 100, 7, 93),
      y: clampPct(((e.clientY - rect.top) / rect.height) * 100, 10, 90),
    };
  }

  function down(e, t) {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: t.id, moved: false, startX: e.clientX, startY: e.clientY };
  }
  function move(e) {
    if (!editable || !drag.current) return;
    // Umbral de 6px: distingue un tap (seleccionar) de un arrastre (mover).
    if (!drag.current.moved && Math.hypot(e.clientX - drag.current.startX, e.clientY - drag.current.startY) < 6) return;
    drag.current.moved = true;
    const { x, y } = pctFromEvent(e);
    onMove(drag.current.id, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }
  function up(e, t) {
    if (editable) {
      const wasDrag = drag.current && drag.current.moved;
      drag.current = null;
      if (!wasDrag && onTap) onTap(t);
    }
  }

  return (
    <div
      ref={canvasRef}
      style={{
        position: "relative",
        minHeight,
        borderRadius: "var(--r)",
        border: "2px dashed var(--line)",
        background: "repeating-linear-gradient(0deg, transparent, transparent 34px, rgba(58,65,88,.045) 34px, rgba(58,65,88,.045) 35px), repeating-linear-gradient(90deg, transparent, transparent 34px, rgba(58,65,88,.045) 34px, rgba(58,65,88,.045) 35px), #fff",
        overflow: "hidden",
        touchAction: editable ? "none" : "auto",
      }}
    >
      {area.tables.map((t) => {
        const selected = t.id === selectedId;
        return (
          <button
            key={t.id}
            onClick={() => !editable && onTap && onTap(t)}
            onPointerDown={(e) => down(e, t)}
            onPointerMove={move}
            onPointerUp={(e) => up(e, t)}
            style={{
              position: "absolute",
              left: t.x + "%",
              top: t.y + "%",
              transform: "translate(-50%,-50%)",
              width: 74,
              height: 74,
              borderRadius: 20,
              border: "2.5px solid " + (selected ? "var(--primary)" : "var(--line)"),
              background: selected ? "var(--primary-soft)" : "var(--cream)",
              color: selected ? "var(--primary)" : "var(--navy)",
              cursor: editable ? "grab" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              fontFamily: "var(--ui)",
              boxShadow: selected ? "0 10px 22px -10px rgba(58,65,88,.45)" : "0 2px 0 rgba(58,65,88,.06)",
              transition: editable ? "none" : "all .12s ease",
              touchAction: "none",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Mesa</span>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{t.label}</span>
          </button>
        );
      })}
      {area.tables.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14.5, fontWeight: 700, padding: 20, textAlign: "center" }}>
          {editable ? "Sin mesas: usa “Agregar mesa” y arrástralas para acomodarlas." : "Esta área no tiene mesas."}
        </div>
      )}
    </div>
  );
}

// ---------- Modal para elegir mesa (pantalla de orden) ----------
export function TablePickerModal({ areas, value, onPick, onClose }) {
  const [areaId, setAreaId] = useState((value && value.areaId) || (areas[0] && areas[0].id));
  const area = areas.find((a) => a.id === areaId) || areas[0];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 12px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, color: "var(--navy)", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="table" size={22} /> ¿En qué mesa va la orden?
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ padding: "0 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {areas.map((a) => (
              <Pill key={a.id} active={a.id === area?.id} onClick={() => setAreaId(a.id)}>
                {a.name}
              </Pill>
            ))}
          </div>
          {area ? (
            <AreaMap area={area} selectedId={value && value.id} onTap={(t) => onPick({ id: t.id, label: t.label, areaId: area.id, areaName: area.name })} />
          ) : (
            <div style={{ color: "var(--muted)", fontWeight: 700, padding: 30, textAlign: "center" }}>No hay áreas configuradas. El gerente puede crearlas en la pantalla “Mesas”.</div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Toca una mesa para asignarla; saldrá en la comanda de cocina.</span>
            {value && (
              <Btn kind="ghost" size="sm" onClick={() => onPick(null)}>
                Quitar mesa
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Pantalla de administración de áreas y mesas ----------
export function TablesEditor({ areas, setAreas }) {
  const [areaId, setAreaId] = useState(areas[0] && areas[0].id);
  const [selectedTable, setSelectedTable] = useState(null); // id de mesa seleccionada
  const area = areas.find((a) => a.id === areaId) || areas[0];
  const selected = area && area.tables.find((t) => t.id === selectedTable);

  const patchArea = (id, fn) => setAreas((prev) => prev.map((a) => (a.id === id ? fn(a) : a)));

  function addArea() {
    const name = window.prompt("Nombre del área nueva (p. ej. Jardín):");
    if (!name || !name.trim()) return;
    const a = { id: newId("A"), name: name.trim(), tables: [] };
    setAreas((prev) => [...prev, a]);
    setAreaId(a.id);
    setSelectedTable(null);
  }
  function renameArea() {
    const name = window.prompt("Nuevo nombre del área:", area.name);
    if (!name || !name.trim()) return;
    patchArea(area.id, (a) => ({ ...a, name: name.trim() }));
  }
  function removeArea() {
    const msg = area.tables.length
      ? `¿Eliminar el área “${area.name}” y sus ${area.tables.length} mesas? Las órdenes ya cobradas no se modifican.`
      : `¿Eliminar el área “${area.name}”?`;
    if (!window.confirm(msg)) return;
    setAreas((prev) => prev.filter((a) => a.id !== area.id));
    const rest = areas.filter((a) => a.id !== area.id);
    setAreaId(rest[0] && rest[0].id);
    setSelectedTable(null);
  }
  function addTable() {
    const t = { id: newId("T"), label: nextTableLabel(areas), ...freeSpot(area.tables) };
    patchArea(area.id, (a) => ({ ...a, tables: [...a.tables, t] }));
    setSelectedTable(t.id);
  }
  function moveTable(id, x, y) {
    patchArea(area.id, (a) => ({ ...a, tables: a.tables.map((t) => (t.id === id ? { ...t, x, y } : t)) }));
  }
  function relabelTable(label) {
    patchArea(area.id, (a) => ({ ...a, tables: a.tables.map((t) => (t.id === selected.id ? { ...t, label } : t)) }));
  }
  function removeTable() {
    if (!window.confirm(`¿Eliminar la mesa ${selected.label}?`)) return;
    patchArea(area.id, (a) => ({ ...a, tables: a.tables.filter((t) => t.id !== selected.id) }));
    setSelectedTable(null);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "22px 28px 30px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)", margin: 0 }}>Mesas y áreas</h1>
          <div style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 4 }}>
            Crea áreas (Salón, Terraza, Jardín…), agrega mesas y arrástralas para que el mapa se parezca a tu local. Al cobrar “Para aquí” se elige la mesa y sale en la comanda.
          </div>
        </div>

        {/* Áreas: pestañas + acciones */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {areas.map((a) => (
            <Pill
              key={a.id}
              active={area && a.id === area.id}
              onClick={() => {
                setAreaId(a.id);
                setSelectedTable(null);
              }}
            >
              {a.name}
              <span style={{ marginLeft: 7, fontSize: 12.5, opacity: 0.75 }}>{a.tables.length}</span>
            </Pill>
          ))}
          <Pill onClick={addArea} style={{ borderStyle: "dashed" }}>
            + Área nueva
          </Pill>
        </div>

        {area ? (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn kind="primary" size="sm" icon="plus" onClick={addTable}>
                Agregar mesa
              </Btn>
              <Btn kind="ghost" size="sm" icon="edit" onClick={renameArea}>
                Renombrar área
              </Btn>
              <Btn kind="danger" size="sm" icon="trash" onClick={removeArea}>
                Eliminar área
              </Btn>
            </div>

            <AreaMap area={area} editable selectedId={selectedTable} onTap={(t) => setSelectedTable(t.id === selectedTable ? null : t.id)} onMove={moveTable} minHeight={420} />

            {/* Panel de la mesa seleccionada */}
            {selected ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "14px 18px" }}>
                <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15.5, whiteSpace: "nowrap" }}>Mesa seleccionada</div>
                <input
                  value={selected.label}
                  onChange={(e) => relabelTable(e.target.value.slice(0, 6))}
                  aria-label="Número o nombre de la mesa"
                  style={{ width: 110, padding: "10px 14px", border: "2px solid var(--line)", borderRadius: 12, fontFamily: "var(--display)", fontSize: 19, fontWeight: 800, color: "var(--navy)", outline: "none", textAlign: "center" }}
                />
                <span style={{ fontSize: 13, color: "var(--muted)", flex: 1 }}>Cambia el número (o usa un nombre corto, p. ej. “J1”) y arrastra la mesa en el mapa para moverla.</span>
                <Btn kind="danger" size="sm" icon="trash" onClick={removeTable}>
                  Eliminar mesa
                </Btn>
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: "var(--muted)", textAlign: "center" }}>Toca una mesa para renombrarla o eliminarla · arrástrala para moverla.</div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 60, fontWeight: 700 }}>No hay áreas todavía: crea la primera con “+ Área nueva”.</div>
        )}
      </div>
    </div>
  );
}
