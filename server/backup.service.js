/* FUWA POS — respaldo automático diario.

   Escribe una copia completa al día en server/data/backups/ y, si está
   configurado, la manda fuera del local. Lo de "fuera del local" es lo que
   importa de verdad: un respaldo que vive en el mismo disco que la base no
   sirve de nada el día que ese disco falla, y ese es justo el día que se usa.

   Programación por comprobación, no por reloj. Un cron a las 3 a. m. no sirve
   aquí: la mini PC de una cafetería se apaga al cerrar. En vez de esperar una
   hora exacta, cada 15 minutos se pregunta "¿ya existe el respaldo de hoy?" y
   si no existe y la hora ya pasó, se hace. Así, encender el equipo a las 7 a. m.
   dispara el respaldo que se habría perdido de madrugada.

   Configuración (.env):
     BACKUP_AUTO=on|off          activar (por defecto on)
     BACKUP_HORA=3               hora a partir de la cual se respalda
     BACKUP_CONSERVAR=30         días de copias locales que se guardan
     BACKUP_COPIA=<carpeta>      copia a una carpeta (Drive Desktop, OneDrive,
                                 unidad de red, USB). Ver README.
     BACKUP_DRIVE_CREDENCIALES=<ruta al json de la cuenta de servicio>
     BACKUP_DRIVE_CARPETA=<id de la carpeta de Drive> */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const INTERVALO_MS = 15 * 60 * 1000;

// aaaa-mm-dd en hora local: el nombre del archivo tiene que coincidir con el
// día que el negocio reconoce, no con UTC.
function claveDia(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------ Google Drive
/* Subida con cuenta de servicio, sin dependencias: se firma un JWT con la
   llave privada del JSON de credenciales y se cambia por un token de acceso.
   `googleapis` traería medio SDK para hacer estas tres peticiones. */
function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenDeAcceso(cred) {
  const ahora = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  }));
  const firma = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).end()
    .sign(cred.private_key);
  const jwt = `${header}.${claims}.${base64url(firma)}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Drive no dio token: ${data.error_description || data.error || r.status}`);
  return data.access_token;
}

/* Busca un archivo con el mismo nombre en la carpeta y lo reemplaza en vez de
   crear otro. Sin esto, reintentar una subida deja duplicados. */
async function idExistente(token, carpeta, nombre) {
  const q = encodeURIComponent(`name='${nombre}' and '${carpeta}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.files && d.files[0] ? d.files[0].id : null;
}

async function subirADrive(cred, carpeta, nombre, contenido) {
  const token = await tokenDeAcceso(cred);
  const existente = await idExistente(token, carpeta, nombre);
  const limite = "fuwa" + crypto.randomBytes(8).toString("hex");
  // En una actualización NO se manda `parents`: Drive lo rechaza.
  const meta = existente ? { name: nombre } : { name: nombre, parents: [carpeta] };
  const cuerpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${limite}\r\nContent-Type: application/json\r\n\r\n${contenido}\r\n--${limite}--`;

  const url = existente
    ? `https://www.googleapis.com/upload/drive/v3/files/${existente}?uploadType=multipart&supportsAllDrives=true`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";

  const r = await fetch(url, {
    method: existente ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    /* La cuenta de servicio no tiene almacenamiento propio en cuentas
       personales de Gmail. Es el error más probable de toda esta ruta, así que
       se traduce en vez de dejar el JSON crudo de Google. */
    if (/storageQuotaExceeded|quota/i.test(t)) {
      throw new Error("la cuenta de servicio no tiene espacio propio en Drive: usa una unidad compartida de Google Workspace, o mejor la opción BACKUP_COPIA con Google Drive para escritorio");
    }
    throw new Error(`Drive rechazó la subida (${r.status}): ${t.slice(0, 200)}`);
  }
  return true;
}

// ------------------------------------------------------------------ servicio
export function createBackupService({ exportData, dataDir, log = console }) {
  const activo = (process.env.BACKUP_AUTO || "on").toLowerCase() !== "off";
  const hora = Math.min(23, Math.max(0, Number(process.env.BACKUP_HORA ?? 3) || 0));
  const conservar = Math.max(1, Number(process.env.BACKUP_CONSERVAR ?? 30) || 30);
  const carpetaCopia = (process.env.BACKUP_COPIA || "").trim();
  const driveCarpeta = (process.env.BACKUP_DRIVE_CARPETA || "").trim();
  const driveCredRuta = (process.env.BACKUP_DRIVE_CREDENCIALES || "").trim();
  const dir = path.join(dataDir, "backups");

  let driveCred = null;
  if (driveCarpeta && driveCredRuta) {
    try {
      driveCred = JSON.parse(fs.readFileSync(driveCredRuta, "utf8"));
      if (!driveCred.client_email || !driveCred.private_key) throw new Error("faltan client_email o private_key");
    } catch (e) {
      driveCred = null;
      log.warn(`[respaldo] credenciales de Drive inválidas (${e.message}); se respaldará solo en local`);
    }
  }

  let ultimo = null; // { archivo, fecha, remoto, error }
  let estadoCarpeta = null;
  let corriendo = false;
  let timer = null;

  /* Comprobación de la carpeta de copia al arrancar.

     Sin esto, una ruta mal escrita —o la unidad G: de Google Drive, que solo
     existe dentro de la sesión del usuario que inició Drive— no se descubre
     hasta el respaldo de las 3 a. m., y se descubre en el log que nadie lee.
     Aquí se escribe y se borra un archivo de prueba: es la única forma de saber
     que la carpeta existe Y se puede escribir en ella. */
  function revisarCarpeta() {
    if (!carpetaCopia) return null;
    const testigo = path.join(carpetaCopia, ".fuwa-prueba");
    try {
      fs.mkdirSync(carpetaCopia, { recursive: true });
      fs.writeFileSync(testigo, "ok");
      fs.unlinkSync(testigo);
      return { ok: true };
    } catch (e) {
      const pista = /^[A-Z]:\\/i.test(carpetaCopia)
        ? " Si es la unidad de Google Drive, recuerda que solo existe mientras la sesión de Windows que inició Drive esté abierta: usa el modo «Duplicar archivos» y apunta a la carpeta real dentro de C:\\Users\\..."
        : "";
      return { ok: false, error: `no se puede escribir en ${carpetaCopia}: ${e.code || e.message}.${pista}` };
    }
  }

  const nombreDe = (dia) => `fuwa-${dia}.json`;
  const rutaDe = (dia) => path.join(dir, nombreDe(dia));
  const existeHoy = () => fs.existsSync(rutaDe(claveDia()));

  /* Borra las copias más viejas que `conservar` días. Se ordena por nombre, que
     al ser aaaa-mm-dd equivale a ordenar por fecha. */
  function rotar() {
    let archivos;
    try {
      archivos = fs.readdirSync(dir).filter((f) => /^fuwa-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    } catch { return 0; }
    const sobran = archivos.slice(0, Math.max(0, archivos.length - conservar));
    for (const f of sobran) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* ya no está */ }
    }
    return sobran.length;
  }

  async function ejecutar({ forzado = false } = {}) {
    if (corriendo) return { ok: false, motivo: "ya hay un respaldo en curso" };
    if (!forzado && existeHoy()) return { ok: true, motivo: "el respaldo de hoy ya existe", archivo: rutaDe(claveDia()) };
    corriendo = true;
    const dia = claveDia();
    try {
      fs.mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(exportData(), null, 0);

      /* Se escribe a un temporal y se renombra. Si se corta la luz a media
         escritura —que en una cafetería pasa— el rename atómico evita quedarse
         con un archivo truncado que parece un respaldo válido. */
      const tmp = rutaDe(dia) + ".parcial";
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, rutaDe(dia));

      const borradas = rotar();
      const resultado = { ok: true, archivo: rutaDe(dia), fecha: Date.now(), bytes: Buffer.byteLength(json), borradas, remoto: null, error: null };

      // --- copia fuera del equipo ---
      if (carpetaCopia) {
        try {
          fs.mkdirSync(carpetaCopia, { recursive: true });
          fs.copyFileSync(rutaDe(dia), path.join(carpetaCopia, nombreDe(dia)));
          resultado.remoto = "carpeta";
        } catch (e) {
          resultado.error = `no se pudo copiar a ${carpetaCopia}: ${e.message}`;
          log.warn("[respaldo] " + resultado.error);
        }
      }
      if (driveCred && driveCarpeta) {
        try {
          await subirADrive(driveCred, driveCarpeta, nombreDe(dia), json);
          resultado.remoto = resultado.remoto ? resultado.remoto + "+drive" : "drive";
        } catch (e) {
          resultado.error = `Drive: ${e.message}`;
          log.warn("[respaldo] " + resultado.error);
        }
      }

      ultimo = resultado;
      log.log(`[respaldo] ${nombreDe(dia)} · ${(resultado.bytes / 1024).toFixed(0)} KB` +
        (resultado.remoto ? ` · copiado a ${resultado.remoto}` : " · solo local") +
        (borradas ? ` · ${borradas} copia(s) vieja(s) borrada(s)` : ""));
      return resultado;
    } catch (e) {
      ultimo = { ok: false, fecha: Date.now(), error: e.message };
      log.error("[respaldo] falló: " + e.message);
      return ultimo;
    } finally {
      corriendo = false;
    }
  }

  function revisar() {
    if (!activo) return;
    if (existeHoy()) return;
    if (new Date().getHours() < hora) return;
    ejecutar();
  }

  return {
    start() {
      if (!activo) return log.log("[respaldo] automático desactivado (BACKUP_AUTO=off)");
      const destino = [carpetaCopia && "carpeta", driveCred && driveCarpeta && "Drive"].filter(Boolean).join(" + ");
      log.log(`[respaldo] diario a partir de las ${hora}:00 · se conservan ${conservar} días · ${destino || "solo local"}`);
      if (driveCarpeta && !driveCred) log.warn("[respaldo] Drive configurado pero sin credenciales válidas");
      estadoCarpeta = revisarCarpeta();
      if (estadoCarpeta && !estadoCarpeta.ok) log.warn("[respaldo] " + estadoCarpeta.error);
      else if (estadoCarpeta) log.log(`[respaldo] carpeta de copia verificada: ${carpetaCopia}`);
      if (timer) return;
      timer = setInterval(revisar, INTERVALO_MS);
      timer.unref?.();
      revisar(); // al arrancar: si la PC estuvo apagada, se recupera aquí
    },
    stop() { clearInterval(timer); timer = null; },
    ejecutar,
    estado: () => {
      let copias = [];
      try {
        copias = fs.readdirSync(dir).filter((f) => /^fuwa-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
      } catch { /* aún no hay carpeta */ }
      return {
        activo, hora, conservar,
        destino: {
          carpeta: carpetaCopia || null,
          drive: !!(driveCred && driveCarpeta),
          // null si no hay carpeta configurada; si la hay, si se puede escribir.
          carpetaOk: estadoCarpeta ? estadoCarpeta.ok : null,
          carpetaError: estadoCarpeta && !estadoCarpeta.ok ? estadoCarpeta.error : null,
        },
        hoyListo: existeHoy(),
        ultimo,
        copias: copias.slice(0, 10).map((f) => {
          const st = fs.statSync(path.join(dir, f));
          return { archivo: f, bytes: st.size, fecha: st.mtimeMs };
        }),
      };
    },
  };
}
