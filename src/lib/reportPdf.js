/* Café del Valle POS — genera y descarga el PDF del reporte (jsPDF + autotable).
   Todo se empaqueta con la app: funciona sin internet. */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { money } from "./format.js";
import { toDateInput, moneyDiff } from "./reportStats.js";

const VERDE = [74, 90, 36]; // #4a5a24, el olivo del logo
const CAFE = [139, 90, 43]; // #8b5a2b

const dateLabel = (ts) =>
  new Date(ts).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });

export function downloadReportPdf({ periodLabel, from, to, kpis, shifts, profit }) {
  const doc = new jsPDF(); // A4 vertical

  // ---- encabezado ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...VERDE);
  doc.text("Café del Valle", 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(...CAFE);
  doc.text("Reporte de ventas", 14, 27);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Período: ${periodLabel} · ${dateLabel(from)} – ${dateLabel(to)}`, 14, 35);
  doc.text(`Generado: ${new Date().toLocaleString("es-GT")}`, 14, 40);
  doc.setDrawColor(...CAFE);
  doc.setLineWidth(0.6);
  doc.line(14, 44, 196, 44);

  // ---- KPIs y totales ----
  autoTable(doc, {
    startY: 50,
    head: [["Indicador", "Valor"]],
    body: [
      ["Ventas totales", money(kpis.total)],
      ["Órdenes cobradas", String(kpis.count)],
      ["Ticket promedio", money(kpis.avg)],
      ["Propinas", money(kpis.tips)],
      ["Gastos", money(kpis.expensesTotal)],
      ["Efectivo", money(kpis.cash)],
      ["Tarjeta", money(kpis.card)],
      ...(kpis.voided ? [["Órdenes anuladas", String(kpis.voided)]] : []),
    ],
    theme: "grid",
    headStyles: { fillColor: VERDE, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });

  // ---- ganancia neta ----
  if (profit) {
    const yG = doc.lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...VERDE);
    doc.text("Ganancia neta", 14, yG);

    autoTable(doc, {
      startY: yG + 4,
      head: [["Concepto", "Monto"]],
      body: [
        ["Ingresos por ventas (sin propina)", money(profit.revenue)],
        ["Costo de ingredientes", "-" + money(profit.cogs)],
        ["Gastos", "-" + money(profit.expenses)],
        [profit.net >= 0 ? "Ganancia neta" : "Pérdida", money(Math.abs(profit.net))],
        ["Margen sobre ventas", profit.revenue > 0 ? (profit.margin * 100).toFixed(1) + "%" : "-"],
      ],
      theme: "grid",
      headStyles: { fillColor: VERDE, fontStyle: "bold" },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (data) => {
        // La fila del resultado se resalta: es la cifra que se va a mirar.
        if (data.section === "body" && data.row.index === 3) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = profit.net >= 0 ? [50, 130, 80] : [180, 50, 50];
        }
      },
    });

    // Los supuestos también van en el PDF: se imprime y circula sin contexto.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    let nota = "Costo calculado con las recetas del menu y el precio de ingrediente vigente hoy.";
    if (profit.linesSinReceta > 0) {
      nota += ` ${profit.linesSinReceta} linea(s) vendida(s) sin receta cargada: su costo no se pudo calcular.`;
    }
    doc.text(doc.splitTextToSize(nota, 182), 14, doc.lastAutoTable.finalY + 5);
  }

  // ---- arqueos de caja ----
  const y = doc.lastAutoTable.finalY + (profit ? 18 : 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...VERDE);
  doc.text("Arqueos de caja", 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [["Cierre", "Fondo", "Ventas efectivo", "Tarjeta", "Entradas", "Gastos efectivo", "Esperado", "Contado", "Diferencia"]],
    body: shifts.length
      ? shifts.map((s) => [
          s.closedAtLabel || dateLabel(s.closedAt),
          money(s.openingCash),
          money(s.cashSales),
          s.cardSales ? money(s.cardSales) : "-",
          s.cashIn ? money(s.cashIn) : "-",
          money(s.cashExpenses),
          money(s.expected),
          money(s.counted),
          moneyDiff(s.diff),
        ])
      : [[{ content: "Sin cierres de caja en el período", colSpan: 9, styles: { halign: "center", textColor: 120 } }]],
    theme: "grid",
    headStyles: { fillColor: VERDE, fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5, halign: "right" },
    columnStyles: { 0: { halign: "left" } },
    didParseCell: (data) => {
      // resalta diferencias de arqueo distintas de cero
      if (data.section === "body" && data.column.index === 8 && shifts.length) {
        const diff = shifts[data.row.index]?.diff || 0;
        if (diff < 0) data.cell.styles.textColor = [180, 50, 50];
        else if (diff > 0) data.cell.styles.textColor = [50, 130, 80];
      }
    },
  });

  // ---- pie ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Café del Valle · página ${i} de ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`cafe-del-valle-reporte-${toDateInput(from)}_${toDateInput(to)}.pdf`);
}
