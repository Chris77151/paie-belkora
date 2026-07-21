/**
 * Export des écritures comptables de paie : XML, Excel (.xlsx), PDF.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Firm } from "@/data/types";
import type { JournalEntry } from "./payroll-accounting";

const n2 = (v: number) => v.toFixed(2);
const nFr = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");

function download(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------ XML ------------------------------ */
export function exportEntriesXml(entries: JournalEntry[], firm: Firm, period: string) {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(`<ecritures-comptables generateur="Belkora Paie" societe="${esc(firm.name)}" ice="${esc(firm.ice ?? "")}" periode="${esc(period)}">`);
  for (const e of entries) {
    lines.push(`  <ecriture journal="${esc(e.journal)}" date="${e.date}" reference="${esc(e.reference)}" equilibree="${e.balanced}">`);
    lines.push(`    <libelle>${esc(e.description)}</libelle>`);
    for (const l of e.lines) {
      lines.push(
        `    <ligne compte="${esc(l.account)}" libelle="${esc(l.label)}" debit="${n2(l.debit)}" credit="${n2(l.credit)}"/>`,
      );
    }
    lines.push(`    <totaux debit="${n2(e.totalDebit)}" credit="${n2(e.totalCredit)}"/>`);
    lines.push("  </ecriture>");
  }
  lines.push("</ecritures-comptables>");
  download(lines.join("\n"), `ecritures_paie_${period}.xml`, "application/xml;charset=utf-8");
}

/* ------------------------------ Excel ------------------------------ */
export function exportEntriesXlsx(entries: JournalEntry[], firm: Firm, period: string) {
  const rows: (string | number)[][] = [];
  rows.push([`Écritures comptables de paie — ${firm.name} — ${period}`]);
  rows.push([]);
  for (const e of entries) {
    rows.push([`Journal ${e.journal}`, e.reference, e.date, e.description]);
    rows.push(["Compte", "Libellé", "Débit", "Crédit"]);
    for (const l of e.lines) rows.push([l.account, l.label, l.debit || "", l.credit || ""]);
    rows.push(["", "TOTAL", e.totalDebit, e.totalCredit]);
    rows.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 46 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Écritures");
  XLSX.writeFile(wb, `ecritures_paie_${period}.xlsx`);
}

/* ------------------------------ PDF ------------------------------ */
export function exportEntriesPdf(entries: JournalEntry[], firm: Firm, period: string) {
  buildEntriesDoc(entries, firm, period).save(`ecritures_paie_${period}.pdf`);
}

/** Construit le document PDF des écritures (sans le sauvegarder) — testable hors navigateur. */
export function buildEntriesDoc(entries: JournalEntry[], firm: Firm, period: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green: [number, number, number] = [139, 162, 95];
  const ink: [number, number, number] = [40, 52, 44];
  const M = 14;

  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...ink);
  doc.text("Écritures comptables de paie", M, 18);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100, 100, 100);
  doc.text(`${firm.name} — Période ${period}`, M, 24);

  let y = 30;
  for (const e of entries) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...ink);
    doc.text(`Journal ${e.journal} · ${e.reference} · ${e.date}`, M, y);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110, 110, 110);
    doc.text(e.description, M, y + 4.5);
    autoTable(doc, {
      startY: y + 7,
      head: [["Compte", "Libellé", "Débit", "Crédit"]],
      body: [
        ...e.lines.map((l) => [l.account, l.label, l.debit ? nFr(l.debit) : "", l.credit ? nFr(l.credit) : ""]),
        ["", "TOTAL", nFr(e.totalDebit), nFr(e.totalCredit)],
      ],
      theme: "grid",
      styles: { fontSize: 8.3, lineColor: [214, 218, 208], cellPadding: 1.4 },
      headStyles: { fillColor: green, textColor: 255, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 24 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 32 } },
      margin: { left: M, right: M },
      didParseCell: (d) => {
        if (d.row.index === e.lines.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [236, 240, 226]; }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(7.5).setTextColor(e.balanced ? 80 : 200, e.balanced ? 130 : 40, 60);
    doc.text(e.balanced ? "Écriture équilibrée (débit = crédit)." : "DÉSÉQUILIBRE — à vérifier.", M, y);
    y += 8;
    if (y > 260) { doc.addPage(); y = 20; }
  }
  doc.setFontSize(7).setTextColor(150, 150, 150);
  doc.text("Genere par Belkora Paie - PCGE/CGNC. Ecritures a valider avant integration comptable.", M, 288);
  return doc;
}
