/* Corre las pruebas de regresión de Café del Valle.

   Uso:  npm test              (todas)
         npm test -- 02        (solo la que empieza por "02")

   La base del negocio NO se toca: cada suite levanta su propio servidor contra
   una carpeta desechable (ver CDV_DATA_DIR en harness.mjs).

   La suite 05 necesita la app compilada, así que corre `npm run build` antes
   si no existe dist/, y levanta el servidor ella misma. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..", "..");
const DATOS_UI = path.join(os.tmpdir(), "cdv-pruebas-ui");
const PUERTO_UI = 5212;

const filtro = process.argv[2] || "";
const suites = fs
  .readdirSync(__dirname)
  .filter((f) => /^\d\d-.*\.mjs$/.test(f))
  .filter((f) => !filtro || f.startsWith(filtro))
  .sort();

const correr = (archivo, env = {}) =>
  new Promise((res) => {
    const p = spawn(process.execPath, [path.join(__dirname, archivo)], {
      cwd: RAIZ,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    p.on("exit", (code) => res(code || 0));
  });

let fallaron = 0;

// Las suites de navegador (05 y 06) sirven la app compilada.
if (suites.some((s) => /^0[56]/.test(s)) && !fs.existsSync(path.join(RAIZ, "dist", "index.html"))) {
  console.log("· compilando la app (dist/) …");
  spawnSync("npm", ["run", "build"], { cwd: RAIZ, stdio: "inherit", shell: true });
}

for (const s of suites) {
  console.log(`\n${"█".repeat(64)}\n██  ${s}\n${"█".repeat(64)}`);

  if (s.startsWith("05")) {
    // Interfaz: hace falta dist/ y un servidor sirviéndolo.
    if (!fs.existsSync(path.join(RAIZ, "dist", "index.html"))) {
      console.log("· compilando la app (dist/) …");
      spawnSync("npm", ["run", "build"], { cwd: RAIZ, stdio: "inherit" });
    }
    fs.rmSync(DATOS_UI, { recursive: true, force: true });
    fs.mkdirSync(DATOS_UI, { recursive: true });
    const srv = spawn(process.execPath, [path.join(RAIZ, "server", "index.js")], {
      env: {
        ...process.env,
        CDV_DATA_DIR: DATOS_UI,
        PORT: String(PUERTO_UI),
        HOST: "127.0.0.1",
        NODE_ENV: "",
        BACKUP_AUTO: "off",
        PRINTER_CAJA: "file://" + path.join(DATOS_UI, "tickets"),
        PRINTER_COCINA: "file://" + path.join(DATOS_UI, "tickets"),
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    // Se espera a que conteste, no un tiempo fijo.
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PUERTO_UI}/api/health`);
        if (r.ok) break;
      } catch { /* aún no */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    fallaron += (await correr(s, { UI_URL: `http://127.0.0.1:${PUERTO_UI}` })) ? 1 : 0;
    srv.kill("SIGTERM");
  } else {
    fallaron += (await correr(s)) ? 1 : 0;
  }
}

console.log(`\n${"═".repeat(64)}`);
console.log(fallaron ? `${fallaron} suite(s) con fallos` : `todas las suites pasaron (${suites.length})`);
process.exit(fallaron ? 1 : 0);
