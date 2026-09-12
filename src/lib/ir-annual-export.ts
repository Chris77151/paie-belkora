/**
 * Exports de l'état annuel de l'IR : PDF (gabarit documentaire commun) et tableur (.xlsx)
 * présenté « façon finance ».
 *
 * Le PDF porte EN CLAIR la couverture réelle de l'exercice : un état édité sur sept mois validés
 * sans le dire laisserait croire à un exercice complet, et l'écart passerait tel quel dans la
 * déclaration. La ligne d'arrêté et l'encart des mois manquants ne sont donc pas décoratifs.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { dateFr } from "./format";
import {
  IR_ANNUAL_DISCLAIMER,
  irAnnualCoverageLine,
  type IrAnnualState,
} from "./ir-annual";
import {
  ALERT,
  FONT,
  FS,
  M,
  afterTable,
  asciiSpaces,
  drawFullHeader,
  drawTitleBox,
  ensure,
  firmLogoPath,
  firmPalette,
  lineHeight,
  loadLogo,
  paintFooters,
  tableStyles,
  type Cursor,
} from "./pdf-kit";

export const IR_ANNUAL_TITLE = "ÉTAT ANNUEL DE L'IMPÔT SUR LE REVENU — TRAITEMENTS ET SALAIRES";

/** Nom de fichier normalisé (ASCII) : Etat_IR_Annuel_<année>.<ext>. */
export function irAnnualFileName(year: number, ext: string): string {
  return `Etat_IR_Annuel_${year}.${ext}`;
}

/** En-têtes du tableau nominatif — mêmes libellés en PDF et en Excel (un seul jeu de colonnes). */
export const IR_ANNUAL_HEADERS = [
  "N°", "Matricule", "Nom", "Prénom", "CIN", "N° CNSS",
  "Sit. fam.", "Pers. à charge", "Mois payés", "Jours",
  "Brut annuel", "Exonérations", "Brut imposable",
  "Frais prof.", "CNSS", "AMO", "Total déductions",
  "Net imposable", "IR brut", "Charges famille", "IR retenu", "Net perçu",
] as const;

/* -------------------------------------------------- PDF -------------------------------------------------- */

/**
 * Bande d'indicateurs en cartes. L'IR retenu — le montant que la déclaration porte — est mis en
 * exergue ; un état partiel ou un salarié sans n° CNSS ressort en rouge, parce que l'un fausse
 * la déclaration et l'autre en bloque le dépôt.
 */
function drawKpiCards(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, st: IrAnnualState): void {
  const partiel = st.monthsMissing.length > 0;
  const cards: { label: string; value: string; alert?: boolean }[] = [
    { label: "Salariés déclarés", value: String(st.totals.count) },
    { label: "Mois validés", value: `${st.monthsCovered.length} / 12`, alert: partiel },
    { label: "Brut annuel", value: mad0(st.totals.brutAnnuel) },
    { label: "Brut imposable", value: mad0(st.totals.brutImposableAnnuel) },
    { label: "IR retenu", value: mad0(st.totals.irRetenuAnnuel) },
    { label: "Sans n° CNSS", value: String(st.missingCnss), alert: st.missingCnss > 0 },
  ];
  const pw = doc.internal.pageSize.getWidth();
  const gap = 3;
  const cardW = (pw - 2 * M - gap * (cards.length - 1)) / cards.length;
  const cardH = 14;
  const y = cur.y;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    const hot = !!c.alert;
    doc.setFillColor(...pal.tint);
    doc.setDrawColor(...(hot ? ALERT : pal.olive)).setLineWidth(hot ? 0.5 : 0.3);
    doc.roundedRect(x, y, cardW, cardH, 1.4, 1.4, "FD");
    doc.setFont(FONT, "normal").setFontSize(FS.micro - 0.6).setTextColor(...pal.muted);
    doc.text(asciiSpaces(c.label), x + cardW / 2, y + 5, { align: "center", maxWidth: cardW - 3 });
    doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...(hot ? ALERT : pal.deep));
    doc.text(asciiSpaces(c.value), x + cardW / 2, y + 11.2, { align: "center", maxWidth: cardW - 3 });
  });
  cur.y = y + cardH;
}

/** Montant sans décimales pour les cartes (les totaux détaillés restent au centime en tableau). */
function mad0(n: number): string {
  return `${Math.round(n).toLocaleString("en-US").replace(/,/g, " ")} DH`;
}

/** Montant au centime, séparateur d'espace — cohérent avec les autres états de l'application. */
function num(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");
}

/** Paragraphe replié à la largeur utile. Fait avancer le curseur. */
function note(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, text: string, bold = false, alert = false): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont(FONT, bold ? "bold" : "normal").setFontSize(FS.note).setTextColor(...(alert ? ALERT : pal.muted));
  const lines = doc.splitTextToSize(asciiSpaces(text), pw - 2 * M) as string[];
  const lh = lineHeight(FS.note);
  ensure(cur, lines.length * lh);
  for (const line of lines) {
    doc.text(line, M, cur.y);
    cur.y += lh;
  }
}

/** Construit le PDF de l'état (sans le sauvegarder) — testable hors navigateur. */
export async function buildIrAnnualPdf(st: IrAnnualState): Promise<jsPDF> {
  const { firm } = st;
  const pal = firmPalette(firm);
  // Paysage : le pont « brut → imposable → net imposable → IR » doit se lire d'une traite sur la
  // ligne. Le couper en portrait obligerait à sauter d'une page à l'autre pour recouper un
  // salarié, ce qui est exactement ce qu'un contrôleur vient faire.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setProperties({ title: `État annuel IR ${st.year} — ${firm.name}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, `${IR_ANNUAL_TITLE} — EXERCICE ${st.year}`, cur.y) + 7;

  const partiel = st.monthsMissing.length > 0;
  note(doc, pal, cur, irAnnualCoverageLine(st), partiel, partiel);
  cur.y += 3;

  drawKpiCards(doc, pal, cur, st);
  cur.y += 7;

  /* --- Tableau nominatif --- */
  autoTable(doc, {
    startY: cur.y,
    head: [[...IR_ANNUAL_HEADERS]],
    body: st.rows.map((r) => [
      String(r.order), r.matricule || "—", r.nom, r.prenom, r.cin || "—", r.cnss || "—",
      r.situationFamille || "—", String(r.personnesACharge), String(r.moisPayes), num(r.joursTravailles),
      num(r.brutAnnuel), num(r.exonerationsAnnuelles), num(r.brutImposableAnnuel),
      num(r.fraisProAnnuels), num(r.cnssAnnuel), num(r.amoAnnuel), num(r.deductionsAnnuelles),
      num(r.netImposableAnnuel), num(r.irBrutAnnuel), num(r.chargesFamilleAnnuelles),
      num(r.irRetenuAnnuel), num(r.netPercuAnnuel),
    ]),
    foot: [[
      "", "", `Total (${st.totals.count})`, "", "", "", "", "",
      String(st.totals.moisPayes), num(st.totals.joursTravailles),
      num(st.totals.brutAnnuel), num(st.totals.exonerationsAnnuelles), num(st.totals.brutImposableAnnuel),
      num(st.totals.fraisProAnnuels), num(st.totals.cnssAnnuel), num(st.totals.amoAnnuel),
      num(st.totals.deductionsAnnuelles), num(st.totals.netImposableAnnuel),
      num(st.totals.irBrutAnnuel), num(st.totals.chargesFamilleAnnuelles),
      num(st.totals.irRetenuAnnuel), num(st.totals.netPercuAnnuel),
    ]],
    ...tableStyles(pal),
    styles: { ...tableStyles(pal).styles, fontSize: 6.2, cellPadding: 1.2, halign: "right" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 16, halign: "left" },
      2: { cellWidth: 26, halign: "left" },
      3: { cellWidth: 22, halign: "left" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 16, halign: "center" },
      7: { cellWidth: 12, halign: "center" },
      8: { cellWidth: 12, halign: "center" },
      9: { cellWidth: 11, halign: "center" },
    },
    footStyles: { fontStyle: "bold", fillColor: pal.tint, textColor: pal.deep },
    // Un salarié sans n° CNSS ressort en rouge : son absence bloque le dépôt.
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 5 && st.rows[d.row.index]?.cnss.trim() === "") {
        d.cell.styles.textColor = ALERT;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  afterTable(cur, 8);

  /* --- Contrôle de cohérence + réserve --- */
  ensure(cur, 30);
  note(doc, pal, cur, "Contrôle de cohérence", true);
  cur.y += 1;
  note(
    doc, pal, cur,
    `Brut imposable ${num(st.totals.brutImposableAnnuel)} - déductions ${num(st.totals.deductionsAnnuelles)} `
    + `= net imposable ${num(st.totals.netImposableAnnuel)}. `
    + `IR brut ${num(st.totals.irBrutAnnuel)} - charges de famille ${num(st.totals.chargesFamilleAnnuelles)} `
    + `= IR retenu ${num(st.totals.irRetenuAnnuel)}.`,
  );
  if (st.missingCnss > 0 || st.missingCin > 0) {
    cur.y += 2;
    note(
      doc, pal, cur,
      `${st.missingCnss} salarié(s) sans n° CNSS et ${st.missingCin} sans CIN : à régulariser avant le dépôt.`,
      true, true,
    );
  }
  cur.y += 3;
  note(doc, pal, cur, IR_ANNUAL_DISCLAIMER);

  /* --- Arrêté et signature --- */
  cur.y += 6;
  ensure(cur, 26);
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont(FONT, "normal").setFontSize(FS.body).setTextColor(...pal.ink);
  doc.text(
    asciiSpaces(`Arrêté le présent état à ${st.totals.count} salarié(s), pour un IR retenu de ${num(st.totals.irRetenuAnnuel)} DH.`),
    M, cur.y,
  );
  cur.y += lineHeight(FS.body) * 2;
  doc.text(asciiSpaces(`${firm.city ?? ""}, le ${dateFr(new Date().toISOString().slice(0, 10))}`), pw - M, cur.y, { align: "right" });
  cur.y += lineHeight(FS.body);
  doc.setFontSize(FS.note).setTextColor(...pal.muted);
  doc.text(asciiSpaces("(Signature et cachet de l'employeur)"), pw - M, cur.y, { align: "right" });
  cur.y += 10;
  doc.setDrawColor(...pal.olive).setLineWidth(0.3).line(pw - M - 60, cur.y, pw - M, cur.y);

  paintFooters(doc, firm, pal);
  return doc;
}

export async function exportIrAnnualPdf(st: IrAnnualState): Promise<{ blob: Blob; filename: string }> {
  const doc = await buildIrAnnualPdf(st);
  const filename = irAnnualFileName(st.year, "pdf");
  const blob = doc.output("blob");
  doc.save(filename);
  return { blob, filename };
}

/* -------------------------------------------------- Excel « façon finance » -------------------------------------------------- */

/**
 * Classeur à deux onglets : « État IR » (une ligne par salarié, ligne de total) et « Synthèse ».
 *
 * Présentation finance : titre et sous-titre fusionnés, formats de nombres normalisés
 * (séparateur de milliers, deux décimales sur les montants), filtre automatique, volets figés
 * sur l'identité, largeurs de colonnes ajustées — mêmes conventions que le livre de paie, pour
 * qu'un même lecteur retrouve ses repères d'un état à l'autre.
 */
export function exportIrAnnualXlsx(st: IrAnnualState): void {
  const { firm } = st;
  const LAST_COL = IR_ANNUAL_HEADERS.length - 1;
  const HEADER_ROW = 3; // 0-based : [0] titre, [1] sous-titre, [2] vide, [3] en-têtes

  const rows: (string | number)[][] = [
    [`${IR_ANNUAL_TITLE} — EXERCICE ${st.year}`],
    [`${firm.name}${firm.if_fiscal ? ` — IF ${firm.if_fiscal}` : ""}${firm.ice ? ` — ICE ${firm.ice}` : ""} · ${irAnnualCoverageLine(st)}`],
    [],
    [...IR_ANNUAL_HEADERS],
  ];

  for (const r of st.rows) {
    rows.push([
      r.order, r.matricule, r.nom, r.prenom, r.cin, r.cnss,
      r.situationFamille, r.personnesACharge, r.moisPayes, r.joursTravailles,
      r.brutAnnuel, r.exonerationsAnnuelles, r.brutImposableAnnuel,
      r.fraisProAnnuels, r.cnssAnnuel, r.amoAnnuel, r.deductionsAnnuelles,
      r.netImposableAnnuel, r.irBrutAnnuel, r.chargesFamilleAnnuelles,
      r.irRetenuAnnuel, r.netPercuAnnuel,
    ]);
  }
  rows.push([
    "", "", `Total (${st.totals.count})`, "", "", "", "",
    "", st.totals.moisPayes, st.totals.joursTravailles,
    st.totals.brutAnnuel, st.totals.exonerationsAnnuelles, st.totals.brutImposableAnnuel,
    st.totals.fraisProAnnuels, st.totals.cnssAnnuel, st.totals.amoAnnuel, st.totals.deductionsAnnuelles,
    st.totals.netImposableAnnuel, st.totals.irBrutAnnuel, st.totals.chargesFamilleAnnuelles,
    st.totals.irRetenuAnnuel, st.totals.netPercuAnnuel,
  ]);

  const firstDataRow = HEADER_ROW + 1;
  const lastDataRow = firstDataRow + st.rows.length - 1;
  const totalRow = lastDataRow + 1;

  const ws = XLSX.utils.aoa_to_sheet(rows);

  const MONEY = "#,##0.00";
  const INT = "0";
  const fmtByCol: Record<number, string> = {};
  for (let c = 10; c <= LAST_COL; c += 1) fmtByCol[c] = MONEY;
  fmtByCol[7] = INT; // personnes à charge
  fmtByCol[8] = INT; // mois payés
  fmtByCol[9] = "#,##0.##"; // jours
  for (let r = firstDataRow; r <= totalRow; r += 1) {
    for (const key of Object.keys(fmtByCol)) {
      const c = Number(key);
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = fmtByCol[c];
    }
  }

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: LAST_COL } },
  ];
  ws["!autofilter"] = {
    ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: Math.max(lastDataRow, firstDataRow), c: LAST_COL })}`,
  };
  // Volets figés : en-têtes et colonnes d'identité (jusqu'au prénom) restent visibles au défilement.
  ws["!freeze"] = {
    xSplit: 4, ySplit: firstDataRow,
    topLeftCell: XLSX.utils.encode_cell({ r: firstDataRow, c: 4 }),
    activePane: "bottomRight", state: "frozen",
  };
  ws["!cols"] = [
    { wch: 5 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 13 }, { wch: 14 },
    { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 9 },
    { wch: 14 }, { wch: 13 }, { wch: 15 },
    { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 13 }, { wch: 14 },
  ];
  ws["!rows"] = [{ hpt: 20 }, { hpt: 15 }];

  const synthese = [
    { Indicateur: "Exercice", Valeur: st.year },
    { Indicateur: "Société", Valeur: firm.name },
    { Indicateur: "Identifiant fiscal", Valeur: firm.if_fiscal ?? "" },
    { Indicateur: "ICE", Valeur: firm.ice ?? "" },
    { Indicateur: "Couverture de l'exercice", Valeur: irAnnualCoverageLine(st) },
    { Indicateur: "Salariés déclarés", Valeur: st.totals.count },
    { Indicateur: "Bulletins cumulés", Valeur: st.totals.moisPayes },
    { Indicateur: "Brut annuel", Valeur: st.totals.brutAnnuel },
    { Indicateur: "Indemnités exonérées", Valeur: st.totals.exonerationsAnnuelles },
    { Indicateur: "Brut imposable", Valeur: st.totals.brutImposableAnnuel },
    { Indicateur: "Frais professionnels", Valeur: st.totals.fraisProAnnuels },
    { Indicateur: "CNSS salariale", Valeur: st.totals.cnssAnnuel },
    { Indicateur: "AMO salariale", Valeur: st.totals.amoAnnuel },
    { Indicateur: "Total des déductions", Valeur: st.totals.deductionsAnnuelles },
    { Indicateur: "Net imposable", Valeur: st.totals.netImposableAnnuel },
    { Indicateur: "IR brut", Valeur: st.totals.irBrutAnnuel },
    { Indicateur: "Charges de famille imputées", Valeur: st.totals.chargesFamilleAnnuelles },
    { Indicateur: "IR RETENU À LA SOURCE", Valeur: st.totals.irRetenuAnnuel },
    { Indicateur: "Net perçu", Valeur: st.totals.netPercuAnnuel },
    { Indicateur: "Salariés sans n° CNSS", Valeur: st.missingCnss },
    { Indicateur: "Salariés sans CIN", Valeur: st.missingCin },
    { Indicateur: "Réserve", Valeur: IR_ANNUAL_DISCLAIMER },
  ];
  const wsS = XLSX.utils.json_to_sheet(synthese);
  wsS["!cols"] = [{ wch: 32 }, { wch: 70 }];
  for (let r = 1; r <= synthese.length; r += 1) {
    const cell = wsS[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && cell.t === "n" && r >= 7) cell.z = MONEY;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "État IR");
  XLSX.utils.book_append_sheet(wb, wsS, "Synthèse");
  XLSX.writeFile(wb, irAnnualFileName(st.year, "xlsx"));
}
