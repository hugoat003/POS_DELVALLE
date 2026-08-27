import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { bootstrapServerState } from "./lib/serverData.js";
import { bootstrapStorage } from "./lib/storage.js";
import "./styles.css";

// Carga el estado desde el servidor ANTES de montar React, para que los hooks
// puedan inicializar de forma síncrona (sin parpadeos ni carreras):
// - bootstrapServerState: turno, órdenes, gastos, usuarios (SQLite vía API)
// - bootstrapStorage: config kv (menú, tweaks…) con caché en localStorage
// Si el servidor no responde o no hay sesión, arranca con los cachés locales.
(async () => {
  const fullState = await bootstrapServerState();
  await bootstrapStorage(fullState);
})().finally(() => {
  createRoot(document.getElementById("root")).render(<App />);
});
