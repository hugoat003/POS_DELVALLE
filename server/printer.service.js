/* FUWA POS — salida física a las impresoras térmicas.

   Dos destinos con caminos distintos a propósito:

     caja   → 3nstar RPT009 por USB, colgada de la mini PC de caja. Es la que
              imprime la cuenta del cliente y NO puede depender de la red: si se
              cae el switch o el WiFi, en caja se sigue cobrando e imprimiendo.
     cocina → 3nstar RPT009 por LAN, IP fija. Recibe las comandas.

   El envío nunca es parte de la petición HTTP. La orden se guarda y el trabajo
   se encola en la MISMA transacción; este worker lo saca después. Así una
   impresora apagada no puede hacer fallar un cobro, y el papel sale solo cuando
   alguien la enciende.

   Configuración por .env, con la misma sintaxis para los dos:
     PRINTER_CAJA=windows://RPT009      (nombre del recurso compartido)
     PRINTER_COCINA=tcp://192.168.1.50:9100
     PRINTER_CAJA=file://./data/tickets  (simulación: escribe a disco)
     PRINTER_COCINA=off                  (desactivada) */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { render } from "./tickets.js";
import { previewText } from "./escpos.js";

const TCP_TIMEOUT = 6000;

/* Espera creciente entre reintentos, con tope de 5 minutos. Los primeros son
   rápidos porque la causa más común es trivial (se quedó sin papel, alguien la
   apagó un momento); a partir de ahí el problema es de verdad y machacar cada
   5 s no lo arregla. Nunca se abandona: el trabajo se queda pendiente hasta que
   imprima, que es el requisito de "sin perder la orden". */
const BACKOFF = [5e3, 15e3, 45e3, 90e3, 180e3, 300e3];
const esperaTras = (intentos) => BACKOFF[Math.min(intentos, BACKOFF.length - 1)];

// ------------------------------------------------------------- drivers
function parseTarget(uri) {
  const raw = String(uri || "off").trim();
  if (!raw || raw === "off") return { kind: "off" };
  const m = raw.match(/^(\w+):\/\/(.+)$/);
  if (!m) return { kind: "off", error: `configuración inválida: ${raw}` };
  const [, proto, rest] = m;
  if (proto === "tcp") {
    const [host, port] = rest.split(":");
    return { kind: "tcp", host, port: Number(port) || 9100 };
  }
  if (proto === "windows") {
    // "RPT009" → \\localhost\RPT009 · "PC-CAJA/RPT009" → \\PC-CAJA\RPT009
    const parts = rest.split("/").filter(Boolean);
    const [host, share] = parts.length > 1 ? parts : ["localhost", parts[0]];
    return { kind: "windows", unc: `\\\\${host}\\${share}` };
  }
  if (proto === "file") return { kind: "file", dir: rest };
  return { kind: "off", error: `protocolo desconocido: ${proto}` };
}

/* Traduce el error de red a algo accionable.

   Los dos fallos habituales al montar una impresora significan cosas opuestas y
   se arreglan de forma distinta, pero el código crudo no lo dice:

     ECONNREFUSED → hay un equipo en esa IP, pero el puerto está cerrado. La IP
                    es correcta; lo que falla es el puerto o el modo de la
                    impresora. O peor: esa IP se la quedó OTRO aparato.
     ETIMEDOUT    → no hay nadie en esa IP. Está apagada, mal escrita o en otra
                    subred.

   Confundirlos hace perder una tarde entera revisando lo que no es. */
function explicarRed(e, host, port) {
  const code = e && e.code;
  if (code === "ECONNREFUSED")
    return `${host} respondió pero rechazó el puerto ${port}. La IP existe: revisa que la impresora esté en modo RAW/puerto 9100, o que esa IP no se la haya quedado otro aparato de la red.`;
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH")
    return `no hay respuesta en ${host}:${port}. La impresora está apagada, la IP está mal escrita, o está en otra subred que la caja.`;
  if (code === "ENETUNREACH") return `la red de ${host} no es alcanzable desde esta computadora: revisa que la caja y la impresora estén en la misma red.`;
  if (code === "EHOSTDOWN") return `${host} está apagada.`;
  return `${host}:${port} — ${(e && e.message) || code || "error de red"}`;
}

/* Bytes crudos por el puerto 9100 (RAW/JetDirect). Es lo que habla la RPT009 en
   red y no necesita driver de ningún tipo. */
function sendTcp({ host, port }, buf) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let cerrado = false;
    const fin = (err) => {
      if (cerrado) return;
      cerrado = true;
      sock.destroy();
      err ? reject(err) : resolve();
    };
    sock.setTimeout(TCP_TIMEOUT);
    sock.on("timeout", () => fin(new Error(explicarRed({ code: "ETIMEDOUT" }, host, port))));
    sock.on("error", (e) => fin(new Error(explicarRed(e, host, port))));
    sock.connect(port, host, () => {
      // El callback de write solo confirma que salió del buffer local; para una
      // térmica es lo máximo que se puede saber sin protocolo de estado.
      sock.write(buf, (err) => (err ? fin(err) : fin()));
    });
  });
}

/* Windows: se escribe el binario a un temporal y se copia al recurso
   compartido. `copy /b` manda los bytes tal cual, sin que el spooler los
   reinterprete como texto.

   Requisito en la mini PC: compartir la impresora con ese nombre. Conviene
   instalarla con el driver "Generic / Text Only" para que no intente rasterizar
   los comandos ESC/POS. */
function sendWindows({ unc }, buf) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `fuwa-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    try { fs.writeFileSync(tmp, buf); } catch (e) { return reject(e); }
    execFile("cmd", ["/c", "copy", "/b", tmp, unc], { timeout: 15000 }, (err, _out, stderr) => {
      fs.promises.unlink(tmp).catch(() => {});
      if (err) return reject(new Error(String(stderr || err.message).trim()));
      resolve();
    });
  });
}

/* Simulación. Escribe el binario y una versión legible al lado, para poder
   revisar el formato sin hardware — que es como se desarrolló todo esto. */
function sendFile({ dir }, buf, job) {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const base = path.join(dir, `${job.kind}-${job.id}`);
      fs.writeFileSync(base + ".bin", buf);
      // El .txt sale en UTF-8 con los acentos ya deshechos de CP858, para poder
      // leerlo en cualquier editor y contar columnas.
      fs.writeFileSync(base + ".txt", previewText(buf), "utf8");
      resolve();
    } catch (e) { reject(e); }
  });
}

async function enviar(target, buf, job) {
  if (target.kind === "off") throw new Error(target.error || "impresora desactivada");
  if (target.kind === "tcp") return sendTcp(target, buf);
  if (target.kind === "windows") return sendWindows(target, buf);
  if (target.kind === "file") return sendFile(target, buf, job);
  throw new Error("driver desconocido: " + target.kind);
}

// --------------------------------------------------------------- worker
export function createPrinterService({ db, intervalMs = 4000 }) {
  const targets = {
    caja: parseTarget(process.env.PRINTER_CAJA),
    cocina: parseTarget(process.env.PRINTER_COCINA),
  };
  for (const [n, t] of Object.entries(targets)) {
    if (t.error) console.warn(`[impresora] ${n}: ${t.error}`);
    else console.log(`[impresora] ${n}: ${t.kind === "off" ? "desactivada" : t.kind}`);
  }
  const subred = revisarSubred();
  if (subred) console.warn("[impresora] OJO: " + subred);

  let corriendo = false;
  let timer = null;

  /* Aviso de subred equivocada.

     El equipo se prueba en una red y se instala en otra: la oficina es
     192.168.1.x y el local 192.168.0.x. Si el .env quedó con la IP del otro
     sitio, la impresora nunca responde y el síntoma —"no salen las comandas"—
     no señala al archivo de configuración por ningún lado.

     Aquí se compara la subred /24 de la impresora contra las de este equipo y
     se dice al arrancar, no cuando alguien esté esperando un pedido. */
  function revisarSubred() {
    const t = targets.cocina;
    if (!t || t.kind !== "tcp") return null;
    const mias = [];
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs || []) {
        if (a.family === "IPv4" && !a.internal) mias.push(a.address);
      }
    }
    if (!mias.length) return null;
    const red = (ip) => ip.split(".").slice(0, 3).join(".");
    if (mias.some((m) => red(m) === red(t.host))) return null;
    return `la impresora de cocina (${t.host}) está en otra red que este equipo (${mias.join(", ")}). ` +
      `Revisa PRINTER_COCINA en el .env: ¿es la plantilla del sitio correcto?`;
  }

  async function tick() {
    if (corriendo) return; // un ciclo lento no debe solaparse con el siguiente
    corriendo = true;
    try {
      for (const job of db.dueJobs(Date.now())) {
        const target = targets[job.target] || { kind: "off" };
        /* Destino desactivado: se descarta en el acto en vez de reintentar.
           Reintentar contra una impresora que no existe no la va a hacer
           aparecer, y el trabajo se quedaría pendiente para siempre inflando la
           alerta de papeles atorados hasta volverla inútil. */
        if (target.kind === "off") {
          db.markJobDiscarded(job.id, target.error || `impresora "${job.target}" desactivada`);
          continue;
        }
        try {
          await enviar(target, render(job), job);
          db.markJobDone(job.id);
        } catch (e) {
          const msg = String(e.message || e).slice(0, 300);
          db.markJobRetry(job.id, msg, Date.now() + esperaTras(job.attempts));
          // Solo se avisa en el primer fallo: si la impresora lleva horas
          // apagada, no tiene sentido llenar el log con la misma línea.
          if (job.attempts === 0) console.warn(`[impresora] ${job.target} falló (${job.kind} ${job.id}): ${msg}`);
        }
      }
      db.pruneOldJobs(Date.now() - 7 * 24 * 3600e3);
    } catch (e) {
      console.error("[impresora] error en el ciclo:", e.message);
    } finally {
      corriendo = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
      timer.unref?.();
      tick();
    },
    stop() { clearInterval(timer); timer = null; },
    flush: tick,
    status: () => ({
      destinos: Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, v.kind])),
      pendientes: db.pendingJobCount(),
    }),
  };
}
