/* FUWA POS — persistencia de CONFIG (menú, modificadores, categorías, tweaks,
   marca de último respaldo) con localStorage como caché y fallback offline.

   Desde la migración a SQLite, este módulo solo maneja las claves kv de baja
   concurrencia (last-write-wins es correcto para config). Lo transaccional
   (órdenes, gastos, turnos, usuarios) vive en src/lib/serverData.js con
   endpoints dedicados e idempotentes.

   bootstrapStorage() corre ANTES de montar React (main.jsx) y deja el estado
   en un caché síncrono, así usePersistentState conserva su firma original. */
import { useEffect, useRef, useState } from "react";
import { LS } from "./storage-core.js";
import { apiFetch, getToken, setOnline, startRetryLoop, onReconnect, isOnline } from "./api.js";

export { LS };
export { isOnline, onConnectionChange } from "./api.js";

// Claves de config sincronizadas con la tabla kv del servidor (mantener en
// sync con KV_KEYS de server/db.js). fuwa_user es solo de este navegador.
// fuwa_tweaks ya no se usa (la apariencia es fija); se deja por compatibilidad
// con los respaldos anteriores. Ver server/db.js.
const KV_KEYS = ["fuwa_menu", "fuwa_mods", "fuwa_cats", "fuwa_areas", "fuwa_tweaks", "fuwa_last_backup"];
const LOCAL_ONLY_KEYS = ["fuwa_user"];
const DIRTY_KEY = "fuwa_dirty_keys"; // claves escritas mientras el servidor estaba caído

let serverCache = null; // config del GET /api/state (o null si offline/sin sesión)

/* Claves editadas sin conexión, con la HORA de la edición.

   Antes era una simple lista de nombres, y esa falta de fecha causó un
   incidente real: una tablet con `fuwa_menu` marcada de una sesión anterior
   subió su copia vieja al reconectar y borró el menú completo que se acababa de
   cargar. Con la hora, el servidor puede rechazar una subida más vieja que lo
   que ya tiene. Se lee tolerando el formato antiguo (array de strings). */
function getDirty() {
  const raw = LS.get(DIRTY_KEY, {});
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((k) => [k, 0])); // formato viejo
  return raw && typeof raw === "object" ? raw : {};
}
const dirtyKeys = () => Object.keys(getDirty());
const markDirty = (key) => LS.set(DIRTY_KEY, { ...getDirty(), [key]: Date.now() });
const clearDirty = () => LS.set(DIRTY_KEY, {});

/* Sube las claves pendientes. Si el servidor contesta que su versión es más
   reciente (409 rancio), NO se insiste: se adopta la del servidor. Perder una
   edición local vieja es mucho menos grave que borrar la configuración buena. */
async function pushKeys(keys) {
  const dirty = getDirty();
  for (const k of keys) {
    if (!KV_KEYS.includes(k)) continue;
    const raw = localStorage.getItem(k);
    if (raw == null) continue;
    const editedAt = dirty[k] || 0;
    try {
      await apiFetch(`/api/state/${k}?editedAt=${editedAt}`, { method: "PUT", body: JSON.parse(raw) });
    } catch (err) {
      if (err.offline) throw err; // se reintenta al reconectar
      if (err.data && err.data.rancio) {
        LS.set(k, err.data.value);
        if (serverCache) serverCache[k] = err.data.value;
        const subs = listeners.get(k);
        if (subs) for (const fn of subs) fn(err.data.value);
        console.warn(`[config] ${k}: el servidor tenía una versión más reciente; se descartó la copia local vieja`);
      }
      /* valor corrupto o clave rechazada: no se re-sube */
    }
  }
}

/* Carga inicial. El estado del servidor gana SALVO las claves dirty (escritas
   aquí mientras el servidor estaba caído), que se re-suben. Sin sesión (401)
   la app arranca al login usando el caché local para la apariencia. */
export async function bootstrapStorage(fullState) {
  try {
    const state = fullState || (getToken() ? await apiFetch("/api/state") : null);
    if (state) {
      const config = { ...state.config };
      const toPush = dirtyKeys().filter((k) => KV_KEYS.includes(k) && localStorage.getItem(k) != null);
      for (const k of toPush) config[k] = LS.get(k);
      if (toPush.length) await pushKeys(toPush);
      clearDirty();
      serverCache = config;
      setOnline(true);
    }
  } catch (err) {
    if (!err.offline) setOnline(true); // el server respondió (p. ej. 401): hay conexión
    serverCache = null;
  }
  // Si vuelve la conexión, re-sube lo que quedó dirty.
  onReconnect(async () => {
    const dirty = dirtyKeys();
    if (!dirty.length) return;
    try {
      await pushKeys(dirty);
      clearDirty();
    } catch {
      /* sigue caído */
    }
  });
  startRetryLoop();
}

/* ---- config que llega del servidor (sync multi-tablet) ----

   Antes, la config solo se leía UNA vez, al cargar la página. Si el gerente
   creaba un área o editaba el menú en otra tablet, las demás no se enteraban
   nunca: seguían con la copia que tenían al arrancar. Peor aún, esa copia vieja
   podía re-subirse y borrar lo que el gerente acababa de crear.

   Ahora los hooks se suscriben por clave y el sync les empuja los cambios. */
const pending = new Map(); // key -> { timer, value } — escrituras con debounce
const listeners = new Map(); // key -> Set<fn>

function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => {
    const set = listeners.get(key);
    if (set) set.delete(fn);
  };
}

/* Aplica la config del servidor a los hooks montados. Nunca pisa una clave con
   una escritura local en vuelo (pending) o pendiente de subir (dirty): lo que
   el usuario acaba de editar en ESTA tablet siempre gana. */
export function applyServerConfig(config) {
  if (!config) return;
  if (!serverCache) serverCache = {};
  const dirty = getDirty();
  for (const key of KV_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) continue;
    if (pending.has(key) || dirty[key] !== undefined) continue; // edición local en curso
    if (localStorage.getItem(key) === JSON.stringify(value)) continue; // sin cambios
    serverCache[key] = value;
    LS.set(key, value);
    const subs = listeners.get(key);
    if (subs) for (const fn of subs) fn(value);
  }
}

/* Recarga la config del servidor. Se llama AL INICIAR SESIÓN porque
   bootstrapStorage corre antes de montar React, cuando todavía no hay token
   (pantalla de login) y por tanto se queda sin config: sin esto la tablet
   arranca con la config de su localStorage y nunca ve la del gerente. */
export async function reloadConfig() {
  if (!getToken()) return;
  try {
    const state = await apiFetch("/api/state");
    applyServerConfig(state.config);
  } catch {
    /* sin conexión: se sigue usando el caché local */
  }
}

// ---- escrituras al servidor con debounce por clave ----
function scheduleServerWrite(key, value) {
  if (!KV_KEYS.includes(key)) return;
  if (!isOnline() || !getToken()) {
    markDirty(key);
    return;
  }
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => flushKey(key), 500);
  pending.set(key, { timer, value });
}

async function flushKey(key) {
  const entry = pending.get(key);
  if (!entry) return;
  pending.delete(key);
  try {
    await apiFetch("/api/state/" + key, { method: "PUT", body: entry.value });
  } catch (err) {
    if (err.offline) markDirty(key);
    /* 401: la app ya está volviendo al login; el valor queda en localStorage */
  }
}

// Al cerrar/ocultar la pestaña, vacía lo pendiente. fetch keepalive (y no
// sendBeacon) porque el endpoint requiere el header Authorization.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    const token = getToken();
    for (const [key, entry] of pending) {
      clearTimeout(entry.timer);
      if (!token) {
        markDirty(key);
        continue;
      }
      try {
        fetch("/api/state/" + key, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify(entry.value),
        });
      } catch {
        markDirty(key);
      }
    }
    pending.clear();
  });
}

// Estado de React respaldado por el servidor, con localStorage como caché.
// Misma firma de siempre; solo para claves de config y fuwa_user.
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    if (serverCache && !LOCAL_ONLY_KEYS.includes(key) && serverCache[key] !== null && serverCache[key] !== undefined) {
      return serverCache[key];
    }
    return LS.get(key, initial);
  });
  const first = useRef(true);
  const fromServer = useRef(false);
  useEffect(() => {
    LS.set(key, value); // caché local siempre, síncrono
    if (first.current) {
      first.current = false; // el primer render solo re-escribiría lo recién leído
      return;
    }
    if (fromServer.current) {
      // Valor que acaba de llegar de otra tablet: subirlo de nuevo solo
      // generaría un eco y una escritura inútil.
      fromServer.current = false;
      return;
    }
    scheduleServerWrite(key, value);
  }, [key, value]);

  // Cambios hechos en OTRA tablet, que llegan por el sync (o al iniciar sesión).
  useEffect(
    () =>
      subscribe(key, (next) => {
        fromServer.current = true;
        setValue(next);
      }),
    [key]
  );

  // Sincronización entre pestañas del mismo navegador (config y sesión).
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== key || e.newValue == null) return;
      try {
        const next = JSON.parse(e.newValue);
        setValue((prev) => (JSON.stringify(prev) === e.newValue ? prev : next));
      } catch {
        /* valor no-JSON: se ignora */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [value, setValue];
}
