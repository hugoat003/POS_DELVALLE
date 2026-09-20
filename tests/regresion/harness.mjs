/* Arnés de las pruebas de regresión.

   Levanta el servidor contra una base DESECHABLE y expone un cliente HTTP
   autenticado. Nunca toca server/data: la carpeta de datos se fija con
   CDV_DATA_DIR bajo el temporal del sistema, porque estas pruebas borran su
   base entre corridas y apuntar a la del negocio sería catastrófico. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Raíz del proyecto (tests/regresion → ... → raíz).
export const RAIZ = path.join(__dirname, "..", "..");
// Carpeta de datos desechable, fuera del proyecto.
export const DATOS = path.join(os.tmpdir(), "cdv-pruebas");
// Se conserva el nombre anterior por compatibilidad con las pruebas escritas.
export const LAB = RAIZ;

let proc = null;
let PORT = 5199;
export const base = () => `http://127.0.0.1:${PORT}`;

export async function arranca({ puerto = 5199, limpia = true, env = {} } = {}) {
  PORT = puerto;
  const dataDir = DATOS;
  if (limpia) fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  proc = spawn(process.execPath, [path.join(RAIZ, "server", "index.js")], {
    env: {
      ...process.env,
      CDV_DATA_DIR: dataDir, // <- la base del negocio queda intacta
      PORT: String(puerto),
      HOST: "127.0.0.1",
      NODE_ENV: "",
      BACKUP_AUTO: "off",
      PRINTER_CAJA: "file://" + path.join(dataDir, "tickets"),
      PRINTER_COCINA: "file://" + path.join(dataDir, "tickets"),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  proc.stdout.on("data", (d) => logs.push(String(d)));
  proc.stderr.on("data", (d) => logs.push(String(d)));
  proc.logs = logs;

  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base() + "/api/health");
      if (r.ok) return proc;
    } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("el servidor no arrancó:\n" + logs.join(""));
}

export async function para() {
  if (!proc) return;
  proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  proc = null;
}
export const logs = () => (proc ? proc.logs.join("") : "");

// ------------------------------------------------------------- cliente HTTP
export function cliente(token = null) {
  const c = {
    token,
    async req(method, ruta, body) {
      const r = await fetch(base() + ruta, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(c.token ? { Authorization: "Bearer " + c.token } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = await r.json().catch(() => null);
      return { status: r.status, ok: r.ok, data };
    },
    get: (r) => c.req("GET", r),
    post: (r, b) => c.req("POST", r, b),
    put: (r, b) => c.req("PUT", r, b),
    del: (r) => c.req("DELETE", r),
    async login(userId, pin) {
      const r = await c.post("/api/login", { userId, pin });
      if (!r.ok) throw new Error("login falló: " + JSON.stringify(r.data));
      c.token = r.data.token;
      return r.data.user;
    },
  };
  return c;
}

// --------------------------------------------------------------- aserciones
let ok = 0;
const fallos = [];
let grupo = "";
export function seccion(n) {
  grupo = n;
  console.log(`\n── ${n}`);
}
export function check(desc, cond, detalle) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${desc}`);
  } else {
    fallos.push(`[${grupo}] ${desc}${detalle ? " · " + detalle : ""}`);
    console.log(`  ✗ ${desc}${detalle ? "  · " + detalle : ""}`);
  }
}
export const eq = (desc, a, b) => check(desc, a === b, `esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)}`);
export const cerca = (desc, a, b, tol = 0.011) =>
  check(desc, Math.abs(a - b) <= tol, `esperado ≈${b}, vino ${a}`);
export function resumen(titulo) {
  console.log(`\n${"═".repeat(60)}\n${titulo}: ${ok} pasaron, ${fallos.length} fallaron`);
  if (fallos.length) {
    console.log("\nFALLOS:");
    fallos.forEach((f) => console.log("  ✗ " + f));
  }
  return fallos.length;
}
export const contadores = () => ({ ok, fallos: [...fallos] });

// ------------------------------------------------------- utilidades de datos
let n = 0;
export const uid = (p = "L") => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Línea de carrito con el shape que espera el servidor.
export function linea({ productId, name, catId, price, qty = 1, size = null, mods = [] }) {
  return { uid: uid(), productId, name, catId, basePrice: price, qty, size, mods, note: "" };
}
export const pagoEfectivo = (subtotal, tip = 0) => ({
  method: "efectivo", subtotal, tip, total: subtotal + tip, received: subtotal + tip, change: 0,
});
