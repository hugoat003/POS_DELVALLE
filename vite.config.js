import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// FUWA POS — desarrollo y build con Vite + React.
export default defineConfig({
  plugins: [react()],
  // host: true expone el dev server en la red local (probar desde celular/tablet).
  server: { open: true, host: true, proxy: { "/api": "http://localhost:5174" } },
});
