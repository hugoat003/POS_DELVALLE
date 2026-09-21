/* Carga la carta de Café del Valle en el servidor que está corriendo.

     node deploy/menu/cargar.mjs                    (usuario u1, PIN 1234)
     node deploy/menu/cargar.mjs --pin 4821 --usuario u1
     node deploy/menu/cargar.mjs --url http://localhost:5174 --forzar

   Escribe por la API (PUT /api/state/:clave) y no directo a la base: así el
   servidor sube la revisión y las tablets reciben el menú en su siguiente sync.

   Seguridad, por si alguien lo corre de nuevo con el negocio ya operando:
     · Sin --forzar solo carga sobre el menú de PRUEBA que trae el sistema. Si el
       menú ya es el de la carta (o tiene productos que no conoce) se detiene:
       volver a cargarlo borraría los precios y las recetas que los encargados
       hayan editado desde entonces.
     · Antes de escribir guarda lo que había en server/data/menu-anterior-*.json. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS as PRUEBA } from "../../src/data.js";
import { CATEGORIES, MODS, PRODUCTS } from "./cafe-del-valle.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const URL_BASE = arg("url", "http://localhost:" + (process.env.PORT || 5174));
const forzar = process.argv.includes("--forzar");

async function api(metodo, ruta, cuerpo, token) {
  const r = await fetch(URL_BASE + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${data && data.error ? data.error : ""}`);
  return data;
}

const login = await api("POST", "/api/login", { userId: arg("usuario", "u1"), pin: arg("pin", "1234") });
const token = login.token;
console.log(`sesión como ${login.user.name} (${login.user.role})`);

const actual = await api("GET", "/api/state", undefined, token);
const menuActual = actual.config.cdv_menu || [];
const idsPrueba = new Set(PRUEBA.map((p) => p.id));
const idsNuevos = new Set(PRODUCTS.map((p) => p.id));
const yaCargado = menuActual.some((p) => idsNuevos.has(p.id));
const ajeno = menuActual.filter((p) => !idsPrueba.has(p.id) && !idsNuevos.has(p.id));

if (!forzar && (yaCargado || ajeno.length)) {
  console.error(
    yaCargado
      ? "El menú de la carta YA está cargado. Volver a cargarlo pisaría los cambios de los encargados."
      : `El menú tiene ${ajeno.length} producto(s) que no son de prueba (${ajeno[0].name}…).`
  );
  console.error("Si de verdad quieres reemplazarlo, repite con --forzar (se guarda copia del actual).");
  process.exit(2);
}

const copia = path.join(RAIZ, "server", "data", `menu-anterior-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.mkdirSync(path.dirname(copia), { recursive: true });
fs.writeFileSync(copia, JSON.stringify({ cdv_menu: actual.config.cdv_menu, cdv_mods: actual.config.cdv_mods, cdv_cats: actual.config.cdv_cats }, null, 2));
console.log("copia del menú anterior: " + path.relative(RAIZ, copia));

await api("PUT", "/api/state/cdv_cats", CATEGORIES, token);
await api("PUT", "/api/state/cdv_mods", MODS, token);
await api("PUT", "/api/state/cdv_menu", PRODUCTS, token);

const porCat = CATEGORIES.map((c) => `${c.name}: ${PRODUCTS.filter((p) => p.cat === c.id).length}`);
console.log(`\nCargados ${PRODUCTS.length} productos en ${CATEGORIES.length} categorías`);
console.log("  " + porCat.join("\n  "));
