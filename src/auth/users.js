/* Café del Valle POS — usuarios de prueba, roles y permisos de navegación. */

// Roles y permisos de navegación
export const ROLES = {
  admin: {
    label: "Gerente",
    color: "oklch(0.48 0.08 130)",
    desc: "Acceso completo: caja, menú, inventario, reportes y empleados.",
    nav: ["order", "accounts", "kds", "history", "expenses", "closeshift", "menu", "tables", "inventory", "summary", "reports", "staff", "tools"],
  },
  // El cajero ve Inventario para registrar las mermas del día, pero no puede
  // crear ni editar ingredientes ni ver costos (eso lo controla canManage).
  cajero: {
    label: "Cajero/Barista",
    color: "oklch(0.50 0.09 70)",
    desc: "Toma órdenes, cobra, registra gastos y cierra caja. En Inventario solo puede registrar mermas.",
    nav: ["order", "accounts", "history", "expenses", "closeshift", "inventory"],
  },
  // La barra no cobra ni ve dinero: solo el tablero de comandas.
  barra: {
    label: "Barra",
    color: "oklch(0.52 0.08 45)",
    desc: "Solo el tablero de barra (KDS): ve las comandas y las marca como listas.",
    nav: ["kds"],
  },
};

// Fuente de verdad para validar el rol que llega por API.
export const ROLE_IDS = Object.keys(ROLES);

// Empleados por defecto (editables desde "Empleados"). Traen el PIN en texto
// plano solo como semilla demo: al primer arranque la app lo convierte a
// hash + salt (src/auth/pin.js) y el texto plano deja de existir.
export const DEFAULT_USERS = [
  { id: "u1", name: "María José Estrada", role: "admin", pin: "1234", hue: 120 },
  { id: "u2", name: "Luis Barrientos", role: "cajero", pin: "1111", hue: 70 },
  { id: "u3", name: "Ana Lucía Morales", role: "barra", pin: "2222", hue: 45 },
];

export function initials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}
