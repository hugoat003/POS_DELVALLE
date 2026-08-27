/* FUWA POS — codificador ESC/POS para impresoras térmicas de 80 mm.

   Por qué propio y no `node-thermal-printer`: esa librería resuelve la parte
   fácil (TCP, que son bytes crudos por un socket) y para USB en Windows depende
   del módulo nativo `printer`, que hay que compilar con node-gyp y las Build
   Tools de Visual Studio en la mini PC del cliente. Justo la impresora que TIENE
   que funcionar cuando todo lo demás falla sería la que depende de que un
   compilador nativo haya salido bien en una máquina que no puedo probar.

   Esto son ~150 líneas sin dependencias que producen los mismos bytes, corren
   igual en Windows/Linux/macOS y se pueden testear sin hardware.

   Referencia: ESC/POS de Epson, que la 3nstar RPT009 implementa.
   Papel de 80 mm = 48 caracteres por línea en Font A. */

const ESC = 0x1b;
const GS = 0x1d;

export const COLS_80 = 48;
export const COLS_58 = 32;

/* La RPT009 sale de fábrica en la página de códigos PC437, que no tiene
   acentos ni ñ. CP858 (página 19) sí los tiene y es la que usan casi todas las
   térmicas chinas y las Epson. Se selecciona en el init y se codifica cada
   texto contra esta tabla.

   Sin esto, "Café con Leche Pequeño" sale como "CafÚ con Leche Peque±o" en el
   papel — que es exactamente el tipo de detalle que hace que el cliente sienta
   que el sistema está mal hecho. */
const CP858 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ü": 0x81, "ñ": 0xa4,
  "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "Ü": 0x9a, "Ñ": 0xa5,
  "¿": 0xa8, "¡": 0xad, "°": 0xf8, "€": 0xd5, "·": 0xfa,
};

// Sustitutos para lo que ni siquiera CP858 tiene. El emoji del menú es el caso
// real: sin esto, un "🍵" imprime basura binaria que puede descuadrar la línea.
// Escapes Unicode a propósito: las comillas tipográficas son indistinguibles
// de las rectas al leer el código, y una de ellas rompe el literal.
const FALLBACK = {
  "–": "-", "—": "-",      // – —
  "“": '"', "”": '"',      // “ ”
  "‘": "'", "’": "'",      // ‘ ’
  "…": "...", "™": "TM", "®": "R", "©": "C",
};

export function encodeText(str) {
  const out = [];
  for (const ch of String(str == null ? "" : str)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }          // ASCII
    if (CP858[ch] != null) { out.push(CP858[ch]); continue; } // acentos
    const sub = FALLBACK[ch];
    if (sub) { for (const c of sub) out.push(c.charCodeAt(0)); continue; }
    // Lo que no se puede representar se descarta en vez de imprimir ruido.
    // Los emoji caen aquí; el texto del producto sigue siendo legible.
    if (code > 0xff) continue;
    out.push(0x3f); // '?'
  }
  return Buffer.from(out);
}

/* Ancho visible de un texto ya codificado. Se cuenta sobre puntos de código
   porque un emoji descartado ocupa 0 columnas en el papel: contar sobre la
   cadena original descuadraría las columnas de precio. */
export const visibleWidth = (s) => encodeText(s).length;

export class Ticket {
  constructor(cols = COLS_80) {
    this.cols = cols;
    this.parts = [];
    this.raw(ESC, 0x40);        // ESC @  — reset
    this.raw(ESC, 0x74, 0x13);  // ESC t 19 — página de códigos CP858
  }

  raw(...bytes) { this.parts.push(Buffer.from(bytes)); return this; }
  bytes(buf) { this.parts.push(buf); return this; }

  align(a) { return this.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  underline(on) { return this.raw(ESC, 0x2d, on ? 1 : 0); }
  /* GS ! con el ancho/alto en los nibbles. n=0 normal, 0x11 doble en ambos.
     Doble alto solo (0x01) es lo que se usa para el número de orden: se lee
     desde lejos sin gastar el doble de papel. */
  size(n) { return this.raw(GS, 0x21, n); }

  text(s) { return this.bytes(encodeText(s)); }
  line(s = "") { return this.text(s).raw(0x0a); }
  feed(n = 1) { return this.raw(ESC, 0x64, n); }
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }

  /* Corta el papel dejando margen para que el corte no se coma la última línea.
     GS V 66 es corte parcial: deja una pestaña que evita que el ticket caiga al
     suelo, que es lo que se quiere en cocina. */
  cut() { return this.feed(4).raw(GS, 0x56, 66, 0); }

  /* Abre el cajón de dinero (pin 2). Solo tiene efecto en la impresora de caja,
     que es donde está conectado; en la de cocina el comando se ignora. */
  drawer() { return this.raw(ESC, 0x70, 0, 25, 250); }

  // Texto a la izquierda y valor pegado a la derecha, rellenando con espacios.
  row(left, right) {
    const l = String(left), r = String(right);
    const gap = this.cols - visibleWidth(l) - visibleWidth(r);
    if (gap < 1) {
      // No cabe en una línea: el valor baja alineado a la derecha en vez de
      // desbordar y romper la columna.
      this.line(l);
      return this.line(" ".repeat(Math.max(0, this.cols - visibleWidth(r))) + r);
    }
    return this.line(l + " ".repeat(gap) + r);
  }

  /* Envuelve respetando palabras, con sangría para las líneas siguientes. Se
     usa en nombres largos de producto y en las notas del mesero. */
  wrap(s, indent = 0) {
    const width = this.cols - indent;
    const pad = " ".repeat(indent);
    let cur = "";
    for (const word of String(s).split(/\s+/).filter(Boolean)) {
      if (!cur) { cur = word; continue; }
      if (visibleWidth(cur) + 1 + visibleWidth(word) <= width) cur += " " + word;
      else { this.line(pad + cur); cur = word; }
    }
    if (cur) this.line(pad + cur);
    return this;
  }

  build() { return Buffer.concat(this.parts); }
}

/* ------------------------------------------------------- previsualización

   Reconstruye el papel legible a partir de los bytes que se le mandan a la
   impresora. Es la única forma de revisar el formato sin hardware, así que
   tiene que decodificar de verdad: recortar los comandos por su longitud real y
   deshacer CP858. Un preview hecho a ojo (borrar ESC y el byte siguiente)
   deja basura y descuadra las columnas, que es exactamente lo que uno está
   tratando de verificar. */
const LARGOS_ESC = { 0x40: 2, 0x74: 3, 0x61: 3, 0x45: 3, 0x2d: 3, 0x64: 3, 0x70: 5, 0x21: 3 };
const LARGOS_GS = { 0x21: 3, 0x56: 4, 0x42: 3 };
const DE_CP858 = Object.fromEntries(Object.entries(CP858).map(([ch, b]) => [b, ch]));

export function previewText(buf) {
  let out = "";
  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b === ESC || b === GS) {
      const tabla = b === ESC ? LARGOS_ESC : LARGOS_GS;
      const largo = tabla[buf[i + 1]];
      // Un comando desconocido se salta como ESC + 1 byte: es mejor perder un
      // carácter en el preview que desalinear todo lo que sigue.
      i += largo || 2;
      continue;
    }
    if (b === 0x0a) { out += "\n"; i += 1; continue; }
    out += b < 0x80 ? String.fromCharCode(b) : DE_CP858[b] || "?";
    i += 1;
  }
  return out;
}
