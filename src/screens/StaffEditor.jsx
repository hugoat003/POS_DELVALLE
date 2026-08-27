/* FUWA POS — administración de empleados: agregar / editar / eliminar usuarios.
   Guarda contra la API del servidor (el PIN viaja plano y el server lo hashea
   con scrypt; en producción siempre detrás de HTTPS). */
import { useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn, Pill, overlay, sheet, iconBtn } from "../components/ui.jsx";
import { ROLES } from "../auth/users.js";
import { Avatar, RoleBadge } from "../auth/Avatar.jsx";

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

function StaffForm({ initial, onCancel, onSave, onDelete, canDelete }) {
  const [name, setName] = useState(initial.name || "");
  const [role, setRole] = useState(initial.role || "cajero");
  // El PIN guardado es un hash: no se puede mostrar. Vacío = no cambiarlo.
  const [pin, setPin] = useState("");
  const [hue, setHue] = useState(initial.hue != null ? initial.hue : 200);
  const isNew = !initial.id;
  const valid = name.trim() && (isNew ? /^\d{4}$/.test(pin) : pin === "" || /^\d{4}$/.test(pin));

  async function save() {
    // PIN nuevo → el servidor lo hashea; sin PIN → conserva el actual.
    onSave({ id: initial.id || "u_" + Date.now().toString(36), name: name.trim(), role, hue, ...(pin ? { pin } : {}) });
  }

  return (
    <div onClick={onCancel} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 460, display: "flex", flexDirection: "column" }}>
        <div style={{ background: `oklch(0.92 0.05 ${hue})`, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)" }}>{isNew ? "Nuevo empleado" : "Editar empleado"}</div>
          <button onClick={onCancel} style={iconBtn}>
            <Icon name="x" size={22} />
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar user={{ name: name || "?", hue }} size={64} />
            <div style={{ flex: 1 }}>
              <Field label="Nombre completo">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mariko Tanaka" style={inp} />
              </Field>
            </div>
          </div>
          <Field label="Rol">
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(ROLES).map(([id, r]) => (
                <Pill key={id} active={role === id} color={r.color} onClick={() => setRole(id)}>
                  {r.label}
                </Pill>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>
              {(ROLES[role] || {}).desc || ""}
            </div>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 16 }}>
            <Field label={isNew ? "PIN (4 dígitos)" : "Nuevo PIN (opcional)"}>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder={isNew ? "0000" : "••••"}
                style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, letterSpacing: 4, textAlign: "center" }}
              />
            </Field>
            <Field label={`Color · tono ${hue}`}>
              <input type="range" min={0} max={360} value={hue} onChange={(e) => setHue(parseInt(e.target.value, 10))} style={{ width: "100%", marginTop: 16, accentColor: `oklch(0.55 0.11 ${hue})` }} />
            </Field>
          </div>
        </div>
        <div style={{ borderTop: "2px solid var(--line)", padding: "16px 24px", display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
          {!isNew && (
            <Btn kind="danger" size="md" icon="trash" disabled={!canDelete} onClick={() => onDelete(initial.id)}>
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

export function StaffEditor({ users, onSave, onDelete, currentUser }) {
  const [editing, setEditing] = useState(null);

  const adminCount = users.filter((u) => u.role === "admin").length;

  async function upsert(u) {
    if (await onSave(u)) setEditing(null);
  }
  async function remove(id) {
    if (await onDelete(id)) setEditing(null);
  }
  // No se puede eliminar al usuario en sesión ni al último gerente.
  function canDelete(u) {
    if (!u || !u.id) return false;
    if (currentUser && u.id === currentUser.id) return false;
    if (u.role === "admin" && adminCount <= 1) return false;
    return true;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "22px 32px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: 0 }}>Empleados</h1>
          <Btn kind="primary" size="md" icon="plus" onClick={() => setEditing({})}>
            Agregar empleado
          </Btn>
        </div>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>Administra el equipo de FUWA: nombre, rol, PIN y color. {users.length} empleados.</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setEditing(u)}
              style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: 16, cursor: "pointer", textAlign: "left", transition: "border-color .12s ease, transform .1s ease" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--navy)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.transform = "none";
              }}
            >
              <Avatar user={u} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                  {u.name}
                  {currentUser && u.id === currentUser.id && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--gold)", background: "color-mix(in oklch, var(--gold) 16%, white)", padding: "1px 8px", borderRadius: 999 }}>tú</span>}
                </div>
                <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
                  <RoleBadge role={u.role} small />
                  <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>PIN ••••</span>
                </div>
              </div>
              <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 800 }}>
                <Icon name="edit" size={14} /> Editar
              </span>
            </button>
          ))}
        </div>
      </div>
      {editing && <StaffForm initial={editing} onCancel={() => setEditing(null)} onSave={upsert} onDelete={remove} canDelete={canDelete(editing)} />}
    </div>
  );
}
