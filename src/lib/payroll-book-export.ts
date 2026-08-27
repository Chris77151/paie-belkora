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
import { DOC_TITLES } from "./doc-titles";
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

  cur.y = drawTitleBox(doc, pal, DOC_TITLES.livrePaie, cur.y) + 8;

  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(asciiSpaces(`${scopeLabel(b)}  —  ${b.totals.count} bulletin(s)`), M, cur.y);
  cur.y += 6;

  // En-têtes GROUPÉS calqués sur le registre officiel (2 pages) : identité · période payée
  // (H.N / H.S / Jours / Total) · rémunération · pont brut→imposable (à déduire / à ajouter) ·
  // retenues (CNSS / AMO / IR / Total) · net.
  const head = [
    [
      { content: "N°", rowSpan: 2 },
      { content: "Période", rowSpan: 2 },
      { content: "Nom et prénom", rowSpan: 2 },
      { content: "Entrée", rowSpan: 2 },
      { content: "N° CNSS", rowSpan: 2 },
      { content: "Nb déd.", rowSpan: 2 },
      { content: "Période payée (H / J)", colSpan: 4 },
      { content: "Salaire de base", rowSpan: 2 },
      { content: "Ancien.", rowSpan: 2 },
      { content: "Primes / Ind.", rowSpan: 2 },
      { content: "Salaire brut", rowSpan: 2 },
      { content: "À déduire", rowSpan: 2 },
      { content: "À ajouter", rowSpan: 2 },
      { content: "Salaire imposable", rowSpan: 2 },
      { content: "Frais prof.", rowSpan: 2 },
      { content: "À déduire (retenues)", colSpan: 4 },
      { content: "Salaire net", rowSpan: 2 },
      { content: "Avances", rowSpan: 2 },
      { content: "Net à payer", rowSpan: 2 },
    ],
    ["H.N.", "H.S.", "Jours", "Total", "C.N.S.S", "AMO", "I.R.", "Total"],
  ];
  const body = b.rows.map((r) => [
    String(r.order),
    r.period,
    r.name,
    r.hireDate ? dateFr(r.hireDate) : "—",
    r.cnss || "—",
    String(r.dependents),
    hrs(r.hoursNormal),
    hrs(r.hoursOt25 + r.hoursOt50 + r.hoursOt100),
    hrs(r.daysWorked),
    hrs(r.totalHours),
    money(r.salaireBase),
    money(r.primeAnciennete),
    money(r.primesIndemnites),
    money(r.salaireBrut),
    money(r.imposableADeduire),
    money(r.imposableAAjouter),
    money(r.sbi),
    money(r.fraisPro),
    money(r.cnssSalarie),
    money(r.amoSalarie),
    money(r.ir),
    money(r.totalRetenues),
    money(r.netAPayer),
    money(r.avances),
    money(r.netFinal),
  ]);
  const totalRow = [
    "", "", `Total (${b.totals.count})`, "", "", "",
    "", "", hrs(b.totals.daysWorked), hrs(b.totals.totalHours),
    money(b.totals.salaireBase),
    money(b.totals.primeAnciennete),
    money(b.totals.primesIndemnites),
    money(b.totals.salaireBrut),
    money(b.totals.imposableADeduire),
    money(b.totals.imposableAAjouter),
    money(b.totals.sbi),
    money(b.totals.fraisPro),
    money(b.totals.cnssSalarie),
    money(b.totals.amoSalarie),
    money(b.totals.ir),
    money(b.totals.totalRetenues),
    money(b.totals.netAPayer),
    money(b.totals.avances),
    money(b.totals.netFinal),
  ];
  const totalIdx = body.length;
  const styles = tableStyles(pal);

  autoTable(doc, {
    startY: cur.y,
    head,
    body: [...body, totalRow],
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 5.6, cellPadding: 0.7, overflow: "linebreak" },
    headStyles: { ...styles.headStyles, fontSize: 5.6, halign: "center", valign: "middle" },
    alternateRowStyles: { fillColor: [...pal.tint] },
    columnStyles: {
      0: { halign: "right", cellWidth: 6 },
      1: { halign: "center", cellWidth: 11 },
      2: { halign: "left", cellWidth: 26 },
      3: { halign: "center", cellWidth: 13 },
      4: { halign: "left", cellWidth: 15 },
      5: { halign: "right", cellWidth: 7 },
      6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
      10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" }, 13: { halign: "right" },
      14: { halign: "right" }, 15: { halign: "right" }, 16: { halign: "right" }, 17: { halign: "right" },
      18: { halign: "right" }, 19: { halign: "right" }, 20: { halign: "right" }, 21: { halign: "right" },
      22: { halign: "right" }, 23: { halign: "right" }, 24: { halign: "right" },
    },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === totalIdx) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
      }
    },
  });
  afterTable(cur, 6);

  // Note de bas de tableau — lisible (corps « note », encre de marque) et SANS le signe moins
  // « − » (U+2212) que les polices standard de jsPDF ne savent pas rendre (il s'affichait « " »).
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(
    asciiSpaces(
      "Livre de paie (art. 371 du Code du Travail) établi à partir des bulletins validés, à conserver au moins deux ans (art. 373). Montants en dirhams. Salaire imposable = salaire brut - à déduire + à ajouter. Frais professionnels = abattement fiscal informatif (n'entre pas dans les retenues). Total des retenues = CNSS + AMO + IR. Net à payer = salaire net - avances.",
    ),
    M,
    cur.y,
    { maxWidth: doc.internal.pageSize.getWidth() - 2 * M, lineHeightFactor: 1.3 },
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
    "Salaire brut", "À déduire (imposable)", "À ajouter (imposable)", "Salaire imposable (SBI)",
    "Frais professionnels", "Taux frais prof. %",
    "CNSS sal.", "AMO sal.", "IR", "Total retenues",
    "Salaire net à payer", "Avances", "Net à payer",
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
      r.salaireBrut, r.imposableADeduire, r.imposableAAjouter, r.sbi,
      r.fraisPro, round1(r.fraisProRate * 100),
      r.cnssSalarie, r.amoSalarie, r.ir, r.totalRetenues,
      r.netAPayer, r.avances, r.netFinal,
    ]);
  }
  rows.push([
    "", "", "", `Total (${b.totals.count})`, "", "", "", "", "", "",
    "", "", "", "", b.totals.daysWorked, b.totals.totalHours,
    b.totals.salaireBase, b.totals.primeAnciennete, "", b.totals.primesIndemnites,
    b.totals.salaireBrut, b.totals.imposableADeduire, b.totals.imposableAAjouter, b.totals.sbi,
    b.totals.fraisPro, "",
    b.totals.cnssSalarie, b.totals.amoSalarie,
    b.totals.ir, b.totals.totalRetenues, b.totals.netAPayer, b.totals.avances, b.totals.netFinal,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 7 }, { wch: 12 }, { wch: 9 }, { wch: 26 }, { wch: 20 }, { wch: 13 },
    { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 13 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
    { wch: 15 }, { wch: 11 }, { wch: 13 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Livre de paie");
  XLSX.writeFile(wb, payrollBookFileName(b, "xlsx"));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
