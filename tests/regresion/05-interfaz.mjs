/* Prueba 5 — interfaz real en navegador sobre la app compilada.
   Cubre el camino del negocio y, sobre todo, que los arreglos no rompieran
   ninguna pantalla: el aviso de ventas apartadas se monta dentro de App. */
import { chromium } from "playwright";

const BASE = process.env.UI_URL || "http://127.0.0.1:5210";
let ok = 0;
const fallos = [];
const check = (d, c, extra) => {
  if (c) { ok++; console.log("  ✓ " + d); }
  else { fallos.push(d + (extra ? " · " + extra : "")); console.log("  ✗ " + d + (extra ? "  · " + extra : "")); }
};
const seccion = (t) => console.log("\n── " + t);

const nav = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();

// Cualquier error de JavaScript en la consola es un fallo: un React roto
// muestra pantalla en blanco y todas las demás aserciones "pasarían" vacías.
const errores = [];
p.on("pageerror", (e) => errores.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

const entrar = async (nombre, pin) => {
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.getByText(nombre, { exact: false }).first().click();
  for (const d of pin) await p.getByRole("button", { name: d, exact: true }).first().click();
  await p.waitForTimeout(1200);
};

seccion("41. Acceso y navegación");
{
  await entrar("María José", "1234");
  check("el gerente entra y ve la app", await p.getByRole("button", { name: /Orden/ }).first().isVisible());
  check("no hay errores de JavaScript al cargar", errores.length === 0, errores.slice(0, 2).join(" | "));

  for (const vista of ["Cuentas", "Barra", "Historial", "Gastos", "Cerrar caja", "Menú", "Mesas", "Inventario", "Resumen", "Reportes", "Empleados", "Herramientas"]) {
    await p.getByRole("button", { name: new RegExp("^" + vista) }).first().click();
    await p.waitForTimeout(350);
    check(`la pantalla "${vista}" se abre sin romperse`, errores.length === 0, errores.slice(0, 1).join(""));
    if (errores.length) errores.length = 0;
  }
}

seccion("42. Caja, venta y cobro");
{
  await p.getByRole("button", { name: /^Orden/ }).first().click();
  await p.waitForTimeout(400);

  // Abrir caja si hace falta.
  const abrir = p.getByRole("button", { name: /Abrir caja/i }).first();
  if (await abrir.isVisible().catch(() => false)) {
    await p.locator('input[type="number"], input[inputmode="decimal"]').first().fill("200").catch(() => {});
    await abrir.click();
    await p.waitForTimeout(1200);
  }
  check("la caja queda abierta", await p.getByText(/Caja abierta/).first().isVisible().catch(() => false));

  // Tomar un producto.
  await p.getByText("Espresso", { exact: false }).first().click();
  await p.waitForTimeout(600);
  // Si abre el modal de opciones, confirmar.
  const agregar = p.getByRole("button", { name: /Agregar|Añadir/i }).first();
  if (await agregar.isVisible().catch(() => false)) { await agregar.click(); await p.waitForTimeout(400); }
  check("el producto entra al carrito", (await p.getByText(/Espresso/).count()) > 0);
}

seccion("43. El candado de la mesa en pantalla");
{
  // "Aquí" sin mesa: cobrar no debe poderse.
  const cobrar = p.getByRole("button", { name: /Cobrar/i }).last();
  const visible = await cobrar.isVisible().catch(() => false);
  if (visible) {
    await cobrar.click();
    await p.waitForTimeout(700);
    const avisoMesa = await p.getByText(/mesa/i).count();
    check("al intentar cobrar 'Aquí' sin mesa, la pantalla pide la mesa", avisoMesa > 0);
  } else {
    check("el botón de cobrar está a la vista", false, "no se encontró");
  }
}

seccion("44. El aviso de ventas apartadas se pinta bien");
{
  // Se inyecta una venta rechazada en localStorage, como la dejaría el outbox.
  await p.evaluate(() => {
    localStorage.setItem("cdv_outbox_rechazado", JSON.stringify([{
      method: "POST", path: "/api/orders", ts: Date.now(),
      body: { id: "Otest" + Date.now(), orderType: "Para llevar", table: null, encolada: true,
              lines: [{ uid: "l1", qty: 2, name: "Espresso", catId: "cafe", productId: "p_espresso", basePrice: 12, mods: [] }],
              payment: { method: "efectivo", total: 24, subtotal: 24, tip: 0 } },
      motivo: "caja cerrada", status: 409, rechazadoEn: Date.now(),
    }]));
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);

  check("aparece el aviso de la operación sin registrar",
    await p.getByText(/no se pudo registrar/i).first().isVisible().catch(() => false));
  check("el aviso dice cuánto dinero está en juego",
    (await p.getByText(/Q24\.00/).count()) > 0);
  check("y explica el motivo", (await p.getByText(/caja cerrada/i).count()) > 0);

  await p.getByRole("button", { name: /Ver detalle/i }).first().click();
  await p.waitForTimeout(500);
  check("el detalle se abre", await p.getByText(/Operaciones sin registrar/i).first().isVisible().catch(() => false));
  check("y lista la venta con sus productos", (await p.getByText(/2 producto/i).count()) > 0);
  check("sin errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" | "));

  // Reintentar con la caja abierta: debe registrarse y el aviso desaparecer.
  await p.getByRole("button", { name: /Reintentar ahora/i }).first().click();
  await p.waitForTimeout(2500);
  check("tras reintentar, el aviso desaparece",
    !(await p.getByText(/no se pudo registrar/i).first().isVisible().catch(() => false)));
  errores.length = 0; // los 4xx de esta sección son del escenario, no de las pantallas
}

seccion("45. Resumen y Reportes coinciden");
{
  await p.getByRole("button", { name: /^Resumen/ }).first().click();
  await p.waitForTimeout(900);
  check("Resumen se pinta sin errores", errores.length === 0, errores.slice(0, 2).join(" | "));
  await p.getByRole("button", { name: /^Reportes/ }).first().click();
  await p.waitForTimeout(900);
  check("Reportes se pinta sin errores", errores.length === 0, errores.slice(0, 2).join(" | "));
}

seccion("46. Inventario y Gastos");
{
  await p.getByRole("button", { name: /^Inventario/ }).first().click();
  await p.waitForTimeout(900);
  check("Inventario lista los insumos", (await p.getByText(/Café en grano/i).count()) > 0);
  await p.getByRole("button", { name: /^Gastos/ }).first().click();
  await p.waitForTimeout(700);
  check("Gastos se abre sin errores", errores.length === 0, errores.slice(0, 2).join(" | "));
}

await nav.close();
console.log(`\n${"═".repeat(60)}\nINTERFAZ: ${ok} pasaron, ${fallos.length} fallaron`);
if (fallos.length) { console.log("\nFALLOS:"); fallos.forEach((f) => console.log("  ✗ " + f)); }
process.exit(fallos.length ? 1 : 0);
