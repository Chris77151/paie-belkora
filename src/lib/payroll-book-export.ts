/**
 * Exports du livre de paie : PDF (paysage, socle `pdf-kit`) et tableur (.xlsx, toutes colonnes).
 *
 * Le PDF reprend l'en-tête société, le pied paginé et la palette communs à toute l'application.
 * Il présente les colonnes essentielles du registre officiel (identité, période payée, rémunération,
 * retenues, net) ; l'Excel porte l'INTÉGRALITÉ des colonnes (dont le détail des heures et l'état
 * civil) pour l'archivage et le contrôle. Aucune donnée n'est recalculée : tout vient des bulletins.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { dateFr, num, periodLabel } from "./format";
import {
  FONT,
  FS,
  M,
  afterTable,
  asciiSpaces,
  drawFullHeader,
  drawTitleBox,
  firmLogoPath,
  firmPalette,
  loadLogo,
  paintFooters,
  tableStyles,
  type Cursor,
} from "./pdf-kit";
import type { PayrollBook } from "./payroll-book";

/** Libellé du périmètre : « juillet 2026 » (mois filtré) ou « Année 2026 » (tout). */
function scopeLabel(b: PayrollBook): string {
  return b.month != null ? periodLabel(b.year, b.month) : `Année ${b.year}`;
}

/** Nom de fichier normalisé : Livre_Paie_<firm>_<aaaa>[-mm].<ext> */
export function payrollBookFileName(b: PayrollBook, ext: string): string {
  const suffix = b.month != null ? `${b.year}-${String(b.month).padStart(2, "0")}` : `${b.year}`;
  return `Livre_Paie_${b.firm.id}_${suffix}.${ext}`;
}

/** Montant pour le PDF : « 6 000,00 » ; vide si nul (allège le tableau dense). */
const money = (n: number) => (n ? num(n) : "");
const hrs = (n: number) => (n ? num(n) : "");

/** Construit le PDF du livre de paie (sans le sauvegarder) — testable hors navigateur. */
export async function buildPayrollBookPdf(b: PayrollBook): Promise<jsPDF> {
  const pal = firmPalette(b.firm);
  // Paysage : le registre porte de nombreuses colonnes ; le socle pdf-kit adapte en-tête et pied.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setProperties({ title: `Livre de paie — ${b.firm.name} — ${scopeLabel(b)}` });
  const logo = await loadLogo(firmLogoPath(b.firm));
  const cur: Cursor = { doc, firm: b.firm, pal, y: drawFullHeader(doc, b.firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, "Livre de paie", cur.y) + 8;

  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(asciiSpaces(`${scopeLabel(b)}  —  ${b.totals.count} bulletin(s)`), M, cur.y);
  cur.y += 6;

  const head = [
    "N°", "Période", "Nom et prénom", "N° CNSS", "Jours", "H.N.", "H.S.",
    "Base", "Ancien.", "Primes/Ind.", "Brut", "SBI", "CNSS", "AMO", "IR", "Net à payer",
  ];
  const body = b.rows.map((r) => [
    String(r.order),
    r.period,
    r.name,
    r.cnss || "—",
    hrs(r.daysWorked),
    hrs(r.hoursNormal),
    hrs(r.hoursOt25 + r.hoursOt50 + r.hoursOt100),
    money(r.salaireBase),
    money(r.primeAnciennete),
    money(r.primesIndemnites),
    money(r.salaireBrut),
    money(r.sbi),
    money(r.cnssSalarie),
    money(r.amoSalarie),
    money(r.ir),
    money(r.netAPayer),
  ]);
  const totalRow = [
    "", "", `Total (${b.totals.count})`, "",
    hrs(b.totals.daysWorked), "", "",
    money(b.totals.salaireBase),
    money(b.totals.primeAnciennete),
    money(b.totals.primesIndemnites),
    money(b.totals.salaireBrut),
    money(b.totals.sbi),
    money(b.totals.cnssSalarie),
    money(b.totals.amoSalarie),
    money(b.totals.ir),
    money(b.totals.netAPayer),
  ];
  const totalIdx = body.length;
  const styles = tableStyles(pal);

  autoTable(doc, {
    startY: cur.y,
    head: [head],
    body: [...body, totalRow],
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 6.6, cellPadding: 1 },
    headStyles: { ...styles.headStyles, fontSize: 6.6, halign: "center" },
    alternateRowStyles: { fillColor: [...pal.tint] },
    columnStyles: {
      0: { halign: "right", cellWidth: 8 },
      1: { halign: "center", cellWidth: 15 },
      2: { cellWidth: 38 },
      3: { cellWidth: 20 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right" },
      11: { halign: "right" },
      12: { halign: "right" },
      13: { halign: "right" },
      14: { halign: "right" },
      15: { halign: "right" },
    },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === totalIdx) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
      }
    },
  });
  afterTable(cur, 6);

  doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
  doc.text(
    asciiSpaces(
      "Livre de paie (art. 371 du Code du Travail) établi à partir des bulletins validés — à conserver au moins deux ans (art. 373). Montants en dirhams ; retenues salariales = CNSS + AMO + IR.",
    ),
    M,
    cur.y,
    { maxWidth: doc.internal.pageSize.getWidth() - 2 * M },
  );

  paintFooters(doc, b.firm, pal);
  return doc;
}

export async function exportPayrollBookPdf(b: PayrollBook): Promise<void> {
  const doc = await buildPayrollBookPdf(b);
  doc.save(payrollBookFileName(b, "pdf"));
}

/** Export tableur — INTÉGRALITÉ des colonnes du registre (identité complète + détail des heures). */
export function exportPayrollBookXlsx(b: PayrollBook): void {
  const header = [
    "N° ordre", "N° bulletin", "Période", "Nom et prénom", "Emploi", "Date de naissance",
    "Date d'entrée", "N° CNSS", "Situation de famille", "Personnes à charge",
    "H.N.", "H.S. 25%", "H.S. 50%", "H.S. 100%", "Jours travaillés", "Total heures",
    "Salaire de base", "Ancienneté", "Taux ancienneté %", "Primes/Indemnités",
    "Salaire brut", "SBI", "CNSS sal.", "AMO sal.", "IR", "Total retenues", "Net à payer",
  ];
  const rows: (string | number)[][] = [
    [`Livre de paie — ${b.firm.name} — ${scopeLabel(b)}`],
    [`${b.totals.count} bulletin(s) — établi à partir des bulletins validés (art. 371 du Code du Travail)`],
    [],
    header,
  ];
  for (const r of b.rows) {
    rows.push([
      r.order, r.bulletin, r.period, r.name, r.emploi, r.birthDate ? dateFr(r.birthDate) : "",
      r.hireDate ? dateFr(r.hireDate) : "", r.cnss ?? "", r.maritalStatus ?? "", r.dependents,
      r.hoursNormal, r.hoursOt25, r.hoursOt50, r.hoursOt100, r.daysWorked, r.totalHours,
      r.salaireBase, r.primeAnciennete, round1(r.seniorityRate * 100), r.primesIndemnites,
      r.salaireBrut, r.sbi, r.cnssSalarie, r.amoSalarie, r.ir, r.totalRetenues, r.netAPayer,
    ]);
  }
  rows.push([
    "", "", "", `Total (${b.totals.count})`, "", "", "", "", "", "",
    "", "", "", "", b.totals.daysWorked, b.totals.totalHours,
    b.totals.salaireBase, b.totals.primeAnciennete, "", b.totals.primesIndemnites,
    b.totals.salaireBrut, b.totals.sbi, b.totals.cnssSalarie, b.totals.amoSalarie,
    b.totals.ir, b.totals.totalRetenues, b.totals.netAPayer,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 7 }, { wch: 12 }, { wch: 9 }, { wch: 26 }, { wch: 20 }, { wch: 13 },
    { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 13 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Livre de paie");
  XLSX.writeFile(wb, payrollBookFileName(b, "xlsx"));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
