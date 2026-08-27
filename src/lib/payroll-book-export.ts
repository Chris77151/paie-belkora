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
import { dateFr, num, pct, periodLabel } from "./format";
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
  // A3 PAYSAGE : le registre officiel porte 33 colonnes (double page) ; l'A3 leur donne une
  // largeur lisible. Le socle pdf-kit lit `getWidth()`/`getHeight()`, donc en-tête, titre et pied
  // s'adaptent automatiquement au format.
  const doc = new jsPDF({ unit: "mm", format: "a3", orientation: "landscape" });
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
  const rate = (n: number) => (n ? pct(n) : "");
  // « Taux · ancienneté » = taux figé du bulletin (si prime) + ancienneté en ANNÉES (tenure live).
  const ancText = (r: PayrollBook["rows"][number]) => {
    const parts: string[] = [];
    if (r.seniorityRate) parts.push(pct(r.seniorityRate));
    if (r.hireDate) parts.push(`${r.seniorityYears} an${r.seniorityYears > 1 ? "s" : ""}`);
    return parts.join(" · ");
  };
  const head = [
    [
      { content: "N° ordre", rowSpan: 2 },
      { content: "N° bulletin", rowSpan: 2 },
      { content: "Période", rowSpan: 2 },
      { content: "Nom et prénom", rowSpan: 2 },
      { content: "Emploi", rowSpan: 2 },
      { content: "Naissance", rowSpan: 2 },
      { content: "Entrée", rowSpan: 2 },
      { content: "N° CNSS", rowSpan: 2 },
      { content: "Sit. fam.", rowSpan: 2 },
      { content: "Nb déd.", rowSpan: 2 },
      { content: "Période payée (Heures / Jours)", colSpan: 6 },
      { content: "Salaire de base", rowSpan: 2 },
      { content: "Ancienneté", rowSpan: 2 },
      { content: "Taux · anc.", rowSpan: 2 },
      { content: "Primes / Ind.", rowSpan: 2 },
      { content: "Salaire brut", rowSpan: 2 },
      { content: "À déduire", rowSpan: 2 },
      { content: "À ajouter", rowSpan: 2 },
      { content: "Salaire imposable", rowSpan: 2 },
      { content: "Frais professionnels", colSpan: 2 },
      { content: "À déduire (retenues)", colSpan: 4 },
      { content: "Salaire net", rowSpan: 2 },
      { content: "Avances", rowSpan: 2 },
      { content: "Net à payer", rowSpan: 2 },
    ],
    ["H.N.", "H.S. 25", "H.S. 50", "H.S. 100", "Jours", "Total", "Montant", "Taux", "C.N.S.S", "AMO", "I.R.", "Total"],
  ];
  const body = b.rows.map((r) => [
    String(r.order),
    r.bulletin || "—",
    r.period,
    r.name,
    r.emploi || "—",
    r.birthDate ? dateFr(r.birthDate) : "—",
    r.hireDate ? dateFr(r.hireDate) : "—",
    r.cnss || "—",
    r.maritalStatus || "—",
    String(r.dependents),
    hrs(r.hoursNormal),
    hrs(r.hoursOt25),
    hrs(r.hoursOt50),
    hrs(r.hoursOt100),
    hrs(r.daysWorked),
    hrs(r.totalHours),
    money(r.salaireBase),
    money(r.primeAnciennete),
    ancText(r),
    money(r.primesIndemnites),
    money(r.salaireBrut),
    money(r.imposableADeduire),
    money(r.imposableAAjouter),
    money(r.sbi),
    money(r.fraisPro),
    rate(r.fraisPro ? r.fraisProRate : 0),
    money(r.cnssSalarie),
    money(r.amoSalarie),
    money(r.ir),
    money(r.totalRetenues),
    money(r.netAPayer),
    money(r.avances),
    money(r.netFinal),
  ]);
  const totalRow = [
    "", "", `Total (${b.totals.count})`, "", "", "", "", "", "", "",
    "", "", "", "", hrs(b.totals.daysWorked), hrs(b.totals.totalHours),
    money(b.totals.salaireBase),
    money(b.totals.primeAnciennete),
    "",
    money(b.totals.primesIndemnites),
    money(b.totals.salaireBrut),
    money(b.totals.imposableADeduire),
    money(b.totals.imposableAAjouter),
    money(b.totals.sbi),
    money(b.totals.fraisPro),
    "",
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
    styles: { ...styles.styles, fontSize: 6.4, cellPadding: 0.8, overflow: "linebreak" },
    headStyles: { ...styles.headStyles, fontSize: 6.4, halign: "center", valign: "middle" },
    alternateRowStyles: { fillColor: [...pal.tint] },
    columnStyles: {
      0: { halign: "right", cellWidth: 7 },
      1: { halign: "center", cellWidth: 12 },
      2: { halign: "center", cellWidth: 12 },
      3: { halign: "left", cellWidth: 30 },
      4: { halign: "left", cellWidth: 20 },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "center", cellWidth: 15 },
      7: { halign: "left", cellWidth: 16 },
      8: { halign: "left", cellWidth: 12 },
      9: { halign: "right", cellWidth: 7 },
      10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" }, 13: { halign: "right" },
      14: { halign: "right" }, 15: { halign: "right" }, 16: { halign: "right" }, 17: { halign: "right" },
      18: { halign: "right" }, 19: { halign: "right" }, 20: { halign: "right" }, 21: { halign: "right" },
      22: { halign: "right" }, 23: { halign: "right" }, 24: { halign: "right" }, 25: { halign: "right" },
      26: { halign: "right" }, 27: { halign: "right" }, 28: { halign: "right" }, 29: { halign: "right" },
      30: { halign: "right" }, 31: { halign: "right" }, 32: { halign: "right" },
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
      "Livre de paie (art. 371 du Code du Travail) établi à partir des bulletins validés, à conserver au moins deux ans (art. 373). N° ordre = numéro de ligne du registre ; N° du bulletin = numéro séquentiel du bulletin (AAAAMM-NNN, remis à 001 chaque mois). Montants en dirhams. Salaire imposable = salaire brut - à déduire + à ajouter. Frais professionnels = abattement fiscal informatif (n'entre pas dans les retenues). Total des retenues = CNSS + AMO + IR. Net à payer = salaire net - avances.",
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
    "Salaire de base", "Ancienneté", "Taux ancienneté", "Ancienneté (années)", "Primes/Indemnités",
    "Salaire brut", "À déduire (imposable)", "À ajouter (imposable)", "Salaire imposable (SBI)",
    "Frais professionnels", "Taux frais prof.",
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
      r.salaireBase, r.primeAnciennete, r.seniorityRate, r.seniorityYears, r.primesIndemnites,
      r.salaireBrut, r.imposableADeduire, r.imposableAAjouter, r.sbi,
      r.fraisPro, r.fraisProRate,
      r.cnssSalarie, r.amoSalarie, r.ir, r.totalRetenues,
      r.netAPayer, r.avances, r.netFinal,
    ]);
  }
  rows.push([
    "", "", "", `Total (${b.totals.count})`, "", "", "", "", "", "",
    "", "", "", "", b.totals.daysWorked, b.totals.totalHours,
    b.totals.salaireBase, b.totals.primeAnciennete, "", "", b.totals.primesIndemnites,
    b.totals.salaireBrut, b.totals.imposableADeduire, b.totals.imposableAAjouter, b.totals.sbi,
    b.totals.fraisPro, "",
    b.totals.cnssSalarie, b.totals.amoSalarie,
    b.totals.ir, b.totals.totalRetenues, b.totals.netAPayer, b.totals.avances, b.totals.netFinal,
  ]);

  const LAST_COL = 33; // 34 colonnes (0..33) — ajout de « Ancienneté (années) » en 19
  const HEADER_ROW = 3; // 0-based : [0] titre, [1] sous-titre, [2] vide, [3] en-têtes
  const firstDataRow = HEADER_ROW + 1;
  const lastDataRow = firstDataRow + b.rows.length - 1;
  const totalRow = lastDataRow + 1;

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // --- Présentation « finance » : formats de nombres normalisés (séparateur de milliers, 2
  //     décimales pour les montants, pourcentage pour les taux, entier pour les heures/jours). ---
  const MONEY = "#,##0.00";
  const HOURS = "#,##0.##";
  const PERCENT = "0.00%";
  const INT = "0";
  const fmtByCol: Record<number, string> = {};
  for (const c of [16, 17, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33]) fmtByCol[c] = MONEY;
  for (const c of [10, 11, 12, 13, 14, 15]) fmtByCol[c] = HOURS;
  for (const c of [18, 26]) fmtByCol[c] = PERCENT;
  fmtByCol[19] = INT; // Ancienneté (années)
  for (let r = firstDataRow; r <= totalRow; r++) {
    for (const key of Object.keys(fmtByCol)) {
      const c = Number(key);
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = fmtByCol[c];
    }
  }

  // Titre + sous-titre fusionnés sur toute la largeur.
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: LAST_COL } },
  ];
  // Filtre automatique sur la ligne d'en-têtes + les données (pas la ligne de total).
  ws["!autofilter"] = {
    ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: lastDataRow, c: LAST_COL })}`,
  };
  // Volets figés : en-têtes (4 lignes) et colonnes d'identité (N° + nom) toujours visibles.
  ws["!freeze"] = { xSplit: 4, ySplit: firstDataRow, topLeftCell: XLSX.utils.encode_cell({ r: firstDataRow, c: 4 }), activePane: "bottomRight", state: "frozen" };

  ws["!cols"] = [
    { wch: 7 }, { wch: 12 }, { wch: 9 }, { wch: 28 }, { wch: 20 }, { wch: 13 },
    { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 14 },
    { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
    { wch: 15 }, { wch: 11 }, { wch: 13 },
  ];
  ws["!rows"] = [{ hpt: 20 }, { hpt: 15 }]; // titre un peu plus haut

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Livre de paie");
  XLSX.writeFile(wb, payrollBookFileName(b, "xlsx"));
}
