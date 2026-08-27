/* Café del Valle POS — humo de extremo a extremo.
   Recorre el camino crítico del negocio: login → abrir caja → tomar orden →
   cobrar → ver la venta en el historial. Es la red que avisa si el rediseño
   visual rompe algo funcional.

   Uso:  node tests/smoke.mjs            (headless)
         node tests/smoke.mjs --ver      (con ventana)
         node tests/smoke.mjs --fotos    (guarda capturas en design/capturas/)

   Requiere el servidor corriendo:  npm run server
*/
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.SMOKE_URL || "http://localhost:5174";
const VER = process.argv.includes("--ver");
const FOTOS = process.argv.includes("--fotos");
const DIR = process.argv.includes("--antes") ? "design/capturas/antes" : "design/capturas/ahora";

let pasa = 0, falla = 0;
const ok = (n, c) => { c ? (pasa++, console.log("  ✓ " + n)) : (falla++, console.log("  ✗ " + n)); };
const seccion = (t) => console.log("\n" + t);

if (FOTOS) fs.mkdirSync(DIR, { recursive: true });

const navegador = await chromium.launch({ channel: "chrome", headless: !VER });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const errores = [];
const red = [];
p.on("pageerror", (e) => errores.push(String(e)));
p.on("console", (m) => m.type() === "error" && errores.push(m.text()));
// Guardar la URL real de cada respuesta fallida: "Failed to load resource" a
// secas no dice nada útil cuando hay que diagnosticar.
p.on("response", (r) => { if (r.status() >= 400) red.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
p.on("requestfailed", (r) => red.push(`sin respuesta ${r.url()} — ${r.failure()?.errorText ?? ""}`));

const foto = async (nombre) => {
  if (FOTOS) await p.screenshot({ path: `${DIR}/${nombre}.png` });
};

try {
  // ---------------------------------------------------------------- login
  seccion("Login");
  await p.goto(BASE, { waitUntil: "networkidle" });
  await foto("01-login");
  ok("carga la pantalla de login", await p.getByText("María José Estrada").isVisible());

  await p.getByText("María José Estrada").click();
  await p.waitForTimeout(400);
  await p.keyboard.type("1234", { delay: 90 });
  await p.waitForTimeout(1400);

  const entro = await p.getByRole("button", { name: /Orden/ }).first().isVisible().catch(() => false);
  ok("el PIN 1234 entra al sistema", entro);
  if (!entro) throw new Error("no se pudo entrar; el resto del humo depende de esto");

  // ------------------------------------------------------------ abrir caja
  seccion("Turno");
  const hayApertura = await p.getByText(/Abrir caja|apertura/i).first().isVisible().catch(() => false);
  if (hayApertura) {
    await foto("02-abrir-caja");
    const btn = p.getByRole("button", { name: /Abrir/i }).last();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await p.waitForTimeout(1000);
    }
  }
  ok("la caja queda abierta", await p.getByText(/Caja abierta/i).first().isVisible().catch(() => false));
  await foto("03-orden");

  // ---------------------------------------------------------------- orden
  seccion("Tomar orden");
  const tarjetas = p.locator("button, div").filter({ hasText: /^Q\s?\d/ });
  const antes = await p.getByText(/^Q\s?\d/).count();
  ok("el menú muestra productos con precio", antes > 0);

  // El primer producto del menú, sea cual sea.
  const primero = p.locator('[style*="cursor: pointer"]').filter({ hasText: /Q\s?\d/ }).first();
  let agregado = false;
  if (await primero.isVisible().catch(() => false)) {
    await primero.click();
    await p.waitForTimeout(700);
    // Un modal de personalización puede interponerse: se acepta si aparece.
    const agregar = p.getByRole("button", { name: /Agregar|Añadir|Aceptar/i }).last();
    if (await agregar.isVisible().catch(() => false)) {
      await agregar.click();
      await p.waitForTimeout(500);
    }
    agregado = true;
  }
  ok("se puede agregar un producto al carrito", agregado);
  await foto("04-carrito");

  // ------------------------------------------------- mesa obligatoria
  /* Una orden "para aquí" no se puede cobrar sin mesa: la comanda saldría sin
     destino. "Para llevar" nunca la necesita. */
  seccion("Mesa obligatoria antes de cobrar");
  // Solo "Método de pago" es exclusivo de la pantalla de cobro: "Total a pagar"
  // y "Efectivo" también aparecen en la de orden y darían un falso positivo.
  const enCobro = () => p.getByText(/MÉTODO DE PAGO/i).first().isVisible().catch(() => false);
  const cerrarModal = async () => {
    const x = p.locator('[aria-label="Cerrar"]').first();
    if (await x.isVisible().catch(() => false)) { await x.click(); await p.waitForTimeout(450); }
  };

  await p.getByRole("button", { name: /^Para aquí/ }).first().click().catch(() => {});
  await p.waitForTimeout(500);
  await cerrarModal();
  await p.getByRole("button", { name: /^Cobrar/ }).first().click().catch(() => {});
  await p.waitForTimeout(700);
  ok("bloquea el cobro sin mesa asignada", !(await enCobro()));
  await cerrarModal();
  ok("avisa qué falta", await p.getByText(/Elegí una mesa para cobrar/).first().isVisible().catch(() => false));

  // Para llevar no exige mesa
  await p.getByRole("button", { name: /^Para llevar/ }).first().click().catch(() => {});
  await p.waitForTimeout(500);
  ok("el aviso se retira con Para llevar", !(await p.getByText(/Elegí una mesa para cobrar/).first().isVisible().catch(() => false)));

  // ---------------------------------------------------------------- cobro
  seccion("Cobrar");
  const cobrar = p.getByRole("button", { name: /Cobrar|Pagar/i }).first();
  const hayCobrar = await cobrar.isVisible().catch(() => false);
  ok("el botón de cobro está disponible", hayCobrar);
  if (hayCobrar) {
    await cobrar.click();
    await p.waitForTimeout(900);
    await foto("05-cobro");
    ok("abre la pantalla de cobro", await enCobro());
    const volver = p.getByRole("button", { name: /Volver/i }).first();
    if (await volver.isVisible().catch(() => false)) { await volver.click(); await p.waitForTimeout(600); }
  }

  // ------------------------------------------------------------ navegación
  seccion("Navegación por rol admin");
  for (const vista of ["Cuentas", "Historial", "Inventario", "Resumen", "Menú"]) {
    const b = p.getByRole("button", { name: new RegExp("^" + vista) }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      await p.waitForTimeout(700);
      await foto("06-" + vista.toLowerCase().replace(/[^a-z]/g, ""));
      ok(`abre ${vista}`, true);
    } else {
      ok(`abre ${vista}`, false);
    }
  }

  seccion("Consola y red");
  ok("sin errores de JavaScript", errores.length === 0);
  if (errores.length) errores.slice(0, 5).forEach((e) => console.log("      " + e.slice(0, 160)));
  ok("sin peticiones fallidas", red.length === 0);
  if (red.length) [...new Set(red)].slice(0, 8).forEach((e) => console.log("      " + e));
} catch (e) {
  falla++;
  console.log("\n  ✗ excepción: " + e.message);
} finally {
  await navegador.close();
}

console.log(`\n${"=".repeat(46)}\n  ${pasa} pasaron, ${falla} fallaron`);
if (FOTOS) console.log(`  capturas en ${DIR}/`);
console.log("=".repeat(46));
process.exit(falla ? 1 : 0);
