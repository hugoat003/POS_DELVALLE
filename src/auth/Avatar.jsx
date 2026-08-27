/* FUWA POS — avatar de usuario e insignia de rol (reutilizados por login y topbar). */
import { ROLES, initials } from "./users.js";

export function Avatar({ user, size = 56, ring }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        background: `oklch(0.92 0.05 ${user.hue})`,
        color: `oklch(0.45 0.11 ${user.hue})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--display)",
        fontWeight: 800,
        fontSize: size * 0.36,
        border: ring ? `3px solid oklch(0.55 0.11 ${user.hue})` : "none",
      }}
    >
      {initials(user.name)}
    </div>
  );
}

export function RoleBadge({ role, small }) {
  // Sin fallback, un rol desconocido (venido de un respaldo viejo o de la API)
  // tumbaba el Login entero al leer .color de undefined.
  const r = ROLES[role] || ROLES.cajero;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: small ? "2px 9px" : "4px 12px",
        borderRadius: 999,
        background: "color-mix(in oklch, " + r.color + " 14%, white)",
        color: r.color,
        fontWeight: 800,
        fontSize: small ? 11.5 : 13,
      }}
    >
      ● {r.label}
    </span>
  );
}
