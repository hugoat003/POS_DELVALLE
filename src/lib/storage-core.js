/* FUWA POS — helper mínimo de localStorage (módulo aparte para que api.js y
   storage.js puedan compartirlo sin imports circulares). */
export const LS = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* almacenamiento lleno o no disponible */
    }
  },
  remove(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* no disponible */
    }
  },
};
