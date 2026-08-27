/* FUWA POS — armado de los dos papeles que salen del sistema.

   comanda  → cocina. Qué preparar y para qué mesa. SIN precios: al cocinero no
              le sirven y ocupan la columna donde va la cantidad.
   ticket   → cliente. La cuenta completa, con todos los items (los de cocina y
              los de barra) porque es lo que se cobra.

   Las dos se arman desde el payload guardado en print_jobs, no desde la orden
   viva. Es deliberado: si un ticket se reintenta media hora después, tiene que
   salir igual que cuando se generó, aunque la orden ya se haya editado. */

import { Ticket, COLS_80 } from "./escpos.js";

const Q = (n) => "Q" + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

const subtitulo = (l) =>
  [l.size && l.size.name, ...(l.mods || []).map((m) => m.name)].filter(Boolean).join(", ");

/* ------------------------------------------------------------- comanda */
export function buildComanda(p) {
  const t = new Ticket(COLS_80);

  t.align("center").bold(true);
  /* Doble alto y ancho: el cocinero lee esto de reojo desde la plancha.
     La cancelación además va subrayada y con banda de asteriscos arriba y
     abajo: es el único papel que pide DEJAR de hacer algo, y confundirlo con
     una comanda normal significa preparar justo lo que se acaba de cancelar. */
  if (p.cancelacion) {
    t.line("*".repeat(t.cols));
    t.size(0x11).underline(true).line("CANCELAR").underline(false).size(0x00);
    t.line("*".repeat(t.cols));
  } else {
    t.size(0x11).line(p.reimpresion ? "*** REIMPRESION ***" : p.agregado ? "*** AGREGADO ***" : "COMANDA");
    t.size(0x00);
  }

  t.size(0x11).line("#" + p.number).size(0x00);
  t.bold(false);

  if (p.table) t.size(0x01).bold(true).line("MESA " + p.table.label).bold(false).size(0x00);
  else t.line(p.orderType || "Para llevar");

  t.line(p.time || "");
  t.align("left").rule("=");

  for (const l of p.lines) {
    t.bold(true).size(0x01);
    t.line((p.cancelacion ? "NO HACER: " : "") + l.qty + " x " + l.name);
    t.size(0x00).bold(false);
    const sub = subtitulo(l);
    if (sub) t.wrap(sub, 4);
    // La nota va destacada: es donde vienen las alergias y los "sin cebolla".
    if (l.note) t.bold(true).wrap(">> " + l.note, 4).bold(false);
    t.line();
  }

  if (p.cancelacion && p.motivo) t.wrap("Motivo: " + p.motivo);

  t.rule("=");
  t.align("center").line(p.cashier || "");
  // La comanda NO abre cajón: en cocina no hay.
  return t.cut().build();
}

/* -------------------------------------------------------- ticket cliente */
export function buildTicket(p) {
  const t = new Ticket(COLS_80);

  t.align("center").bold(true).size(0x11).line(p.business || "FUWA").size(0x00);
  if (p.tagline) t.line(p.tagline);
  if (p.address) t.wrap(p.address);
  if (p.nit) t.line("NIT: " + p.nit);
  t.bold(false).feed(1);

  t.align("left");
  t.row("Orden #" + p.number, p.time || "");
  t.row(p.orderType || "", p.table ? "Mesa " + p.table.label : "");
  t.row("Atendio", p.cashier || "");
  t.rule();

  for (const l of p.lines) {
    const importe = Q(l.lineTotal);
    // El nombre puede no caber junto al precio; row() lo baja solo.
    t.row(l.qty + " " + l.name, importe);
    const sub = subtitulo(l);
    if (sub) t.wrap(sub, 4);
    if (l.note) t.wrap("* " + l.note, 4);
  }

  t.rule();
  t.row("Subtotal", Q(p.subtotal));
  if (p.tip > 0) t.row("Propina", Q(p.tip));
  t.bold(true).size(0x01).row("TOTAL", Q(p.total)).size(0x00).bold(false);
  t.feed(1);

  t.row("Forma de pago", p.method || "");
  if (p.received != null && p.method === "efectivo") {
    t.row("Recibido", Q(p.received));
    t.row("Cambio", Q(p.change));
  }

  t.feed(1).align("center");
  t.line("Gracias por su visita");
  if (p.footer) t.wrap(p.footer);

  // El cajón solo se abre si de verdad entró efectivo a la caja.
  if (p.method === "efectivo") t.drawer();
  return t.cut().build();
}

export function render(job) {
  const p = JSON.parse(job.payload);
  return job.kind === "comanda" ? buildComanda(p) : buildTicket(p);
}
