/**
 * Exports de la cartographie des risques : PDF (gabarit documentaire commun) et tableur (.xlsx).
 *
 * Le PDF porte EN CLAIR la réserve : une cartographie n'est ni un certificat de conformité ni un
 * rapport d'audit. Éditée sans cette mention, elle crée chez son lecteur — direction, banque,
 * commissaire aux comptes — une sécurité qu'elle ne garantit pas.
 *
 * Aucune donnée nominative n'est exportée : le moteur n'en produit pas.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Firm } from "@/data/types";
import { dateFr } from "./format";
import {
  AUTOMATION_LABEL,
  CATEGORY_LABEL,
  CONTROL_TYPE_LABEL,
  RISK_DISCLAIMER,
  STEP_LABEL,
  controlGaps,
  exposure,
  type AssessedRisk,
} from "./risk-engine";
import { LEVEL_LABEL, LEVEL_ORDER, MAX_ABATEMENT_POINTS } from "./risk-params";
import { FACT_LABEL } from "./risk-facts";
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

export const RISK_DOC_TITLE = "CARTOGRAPHIE DES RISQUES — PROCESSUS PAIE";

/** Nom de fichier normalisé (ASCII) : Cartographie_Risques_Paie_<date>.<ext>. */
export function riskFileName(asOf: string, ext: string): string {
  return `Cartographie_Risques_Paie_${asOf}.${ext}`;
}

/** « 4 × 5 = 20 · Critique » — la cotation lisible d'un coup d'œil. */
function score(l: number, i: number, level: string): string {
  return `${l} x ${i} = ${l * i} - ${level}`;
}

/* -------------------------------------------------- PDF -------------------------------------------------- */

/**
 * Bande d'indicateurs en cartes. Le nombre de risques HORS APPÉTENCE est mis en exergue : c'est
 * la seule valeur de la synthèse qui appelle une décision, elle ne doit pas se noyer.
 */
function drawKpiCards(
  doc: jsPDF,
  pal: ReturnType<typeof firmPalette>,
  cur: Cursor,
  e: ReturnType<typeof exposure>,
): void {
  const cards: { label: string; value: string; alert?: boolean }[] = [
    { label: "Risques cartographiés", value: String(e.count) },
    { label: "Exposition brute", value: String(e.grossTotal) },
    { label: "Exposition résiduelle", value: String(e.residualTotal) },
    { label: "Réduction", value: `${e.reductionPct} %` },
    { label: "Hors appétence", value: String(e.aboveAppetite), alert: e.aboveAppetite > 0 },
    { label: "Contrôles prouvés", value: `${e.controlsProven}/${e.controlsTotal}` },
  ];
  const pw = doc.internal.pageSize.getWidth();
  const gap = 3;
  const cardW = (pw - 2 * M - gap * (cards.length - 1)) / cards.length;
  const cardH = 14;
  const y = cur.y;
  cards.forEach((c, idx) => {
    const x = M + idx * (cardW + gap);
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

/** Un paragraphe de note, replié à la largeur utile. Fait avancer le curseur. */
function note(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, text: string, bold = false): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont(FONT, bold ? "bold" : "normal").setFontSize(FS.note).setTextColor(...pal.muted);
  const lines = doc.splitTextToSize(asciiSpaces(text), pw - 2 * M) as string[];
  const lh = lineHeight(FS.note);
  ensure(cur, lines.length * lh);
  for (const line of lines) {
    doc.text(line, M, cur.y);
    cur.y += lh;
  }
}

/** Construit le PDF de la cartographie (sans le sauvegarder) — testable hors navigateur. */
export async function buildRiskPdf(firm: Firm, risks: AssessedRisk[], appetite: number, asOf: string): Promise<jsPDF> {
  const pal = firmPalette(firm);
  // Paysage : la ligne porte le brut, le dispositif et le résiduel côte à côte — c'est
  // précisément la comparaison que le lecteur vient chercher, la couper la rendrait illisible.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setProperties({ title: `Cartographie des risques — ${firm.name}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, RISK_DOC_TITLE, cur.y) + 7;

  note(doc, pal, cur, `Arrêtée au ${dateFr(asOf)} - appétence : score résiduel maximal accepté ${appetite}.`);
  cur.y += 3;

  const e = exposure(risks);
  drawKpiCards(doc, pal, cur, e);
  cur.y += 7;

  /* --- Registre des risques --- */
  autoTable(doc, {
    startY: cur.y,
    head: [["Réf", "Étape", "Catégorie", "Événement de risque", "Base", "Brut", "Contrôles", "Résiduel", "Écart", "Traitement"]],
    body: risks.map((r) => [
      r.ref,
      STEP_LABEL[r.step],
      CATEGORY_LABEL[r.category],
      r.event,
      r.basis,
      score(r.grossLikelihood, r.grossImpact, LEVEL_LABEL[r.grossLevel]),
      `${r.provenCount}/${r.assessedControls.length} prouvés`,
      score(r.residualLikelihood, r.residualImpact, LEVEL_LABEL[r.residualLevel]),
      r.reduction > 0 ? `-${r.reduction} (-${r.reductionPct} %)` : "aucun",
      r.aboveAppetite ? "Réduire" : "Accepter",
    ]),
    ...tableStyles(pal),
    styles: { ...tableStyles(pal).styles, fontSize: 6.6, cellPadding: 1.3, valign: "top" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { cellWidth: 78 },
      4: { cellWidth: 40 },
      5: { cellWidth: 26, halign: "center" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 26, halign: "center" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 18, halign: "center" },
    },
    // Le résiduel hors appétence ressort en rouge : c'est la seule information de la table qui
    // appelle une décision immédiate.
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const r = risks[d.row.index];
      if (!r) return;
      if (d.column.index === 7 && r.aboveAppetite) {
        d.cell.styles.textColor = ALERT;
        d.cell.styles.fontStyle = "bold";
      }
      if (d.column.index === 9 && r.aboveAppetite) d.cell.styles.textColor = ALERT;
    },
  });
  afterTable(cur, 8);

  /* --- Angles morts : contrôles non prouvés --- */
  const gaps = controlGaps(risks);
  if (gaps.length > 0) {
    ensure(cur, 30);
    note(doc, pal, cur, "Angles morts - contrôles qui n'abattent rien aujourd'hui", true);
    cur.y += 2;
    autoTable(doc, {
      startY: cur.y,
      head: [["Contrôle attendu", "Nature", "Mise en oeuvre", "Axe abattu", "Risques couverts", "Ce qui manque"]],
      body: gaps.map((g) => [
        g.control.label,
        CONTROL_TYPE_LABEL[g.control.type],
        AUTOMATION_LABEL[g.control.automation],
        g.axis === "likelihood" ? "Probabilité" : "Impact",
        g.refs.join(", "),
        g.control.note ?? (g.control.proof ? FACT_LABEL[g.control.proof] : "Contrôle déclaratif, non constatable"),
      ]),
      ...tableStyles(pal),
      styles: { ...tableStyles(pal).styles, fontSize: 6.6, cellPadding: 1.3, valign: "top" },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 26, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 30 },
      },
    });
    afterTable(cur, 8);
  }

  /* --- Répartition par niveau --- */
  ensure(cur, 26);
  note(doc, pal, cur, "Déplacement de l'exposition", true);
  cur.y += 2;
  autoTable(doc, {
    startY: cur.y,
    head: [["Niveau", ...LEVEL_ORDER.map((l) => LEVEL_LABEL[l])]],
    body: [
      ["Brut", ...LEVEL_ORDER.map((l) => String(e.grossByLevel[l]))],
      ["Résiduel", ...LEVEL_ORDER.map((l) => String(e.residualByLevel[l]))],
    ],
    ...tableStyles(pal),
    styles: { ...tableStyles(pal).styles, fontSize: 7.4, halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 30 } },
  });
  afterTable(cur, 8);

  /* --- Méthode et réserve --- */
  ensure(cur, 34);
  note(doc, pal, cur, "Méthode", true);
  cur.y += 1;
  note(
    doc, pal, cur,
    "Le brut est coté à dispositif NUL - comme si aucun contrôle n'existait. Le résiduel n'est pas "
    + "saisi, il est CALCULÉ : un contrôle préventif abat la probabilité, un contrôle détectif ou "
    + "correctif abat l'impact, à hauteur de son poids multiplié par son degré d'automatisation. "
    + `L'abattement est plafonné à ${MAX_ABATEMENT_POINTS} points par axe, plancher 1 : aucun `
    + "dispositif ne fait descendre un risque critique au niveau négligeable. Un contrôle non "
    + "prouvé n'abat rien.",
  );
  cur.y += 3;
  note(doc, pal, cur, RISK_DISCLAIMER);

  paintFooters(doc, firm, pal);
  return doc;
}

export async function exportRiskPdf(firm: Firm, risks: AssessedRisk[], appetite: number, asOf: string): Promise<{ blob: Blob; filename: string }> {
  const doc = await buildRiskPdf(firm, risks, appetite, asOf);
  const filename = riskFileName(asOf, "pdf");
  const blob = doc.output("blob");
  doc.save(filename);
  return { blob, filename };
}

/* -------------------------------------------------- Excel -------------------------------------------------- */

/**
 * Classeur à trois onglets : Registre (une ligne par risque), Contrôles (une ligne par contrôle,
 * avec son état de preuve) et Synthèse. Le détail des contrôles est séparé du registre parce que
 * c'est lui qui se retravaille en revue — le registre, lui, se lit.
 */
export function exportRiskXlsx(firm: Firm, risks: AssessedRisk[], appetite: number, asOf: string): void {
  const wb = XLSX.utils.book_new();

  const registre = risks.map((r, i) => ({
    "N°": i + 1,
    "Réf": r.ref,
    "Étape": STEP_LABEL[r.step],
    "Catégorie": CATEGORY_LABEL[r.category],
    "Événement de risque": r.event,
    "Base normative": r.basis,
    "Probabilité brute": r.grossLikelihood,
    "Impact brut": r.grossImpact,
    "Score brut": r.grossScore,
    "Niveau brut": LEVEL_LABEL[r.grossLevel],
    "Contrôles prouvés": r.provenCount,
    "Contrôles total": r.assessedControls.length,
    "Abattement probabilité": r.abatementLikelihood,
    "Abattement impact": r.abatementImpact,
    "Probabilité résiduelle": r.residualLikelihood,
    "Impact résiduel": r.residualImpact,
    "Score résiduel": r.residualScore,
    "Niveau résiduel": LEVEL_LABEL[r.residualLevel],
    "Réduction (points)": r.reduction,
    "Réduction (%)": r.reductionPct / 100,
    "Hors appétence": r.aboveAppetite ? "Oui" : "Non",
    "Traitement": r.aboveAppetite ? "Réduire" : "Accepter",
  }));

  const controles = risks.flatMap((r) =>
    r.assessedControls.map((ct) => ({
      "Réf risque": r.ref,
      "Étape": STEP_LABEL[r.step],
      "Contrôle": ct.label,
      "Nature": CONTROL_TYPE_LABEL[ct.type],
      "Axe abattu": ct.axis === "likelihood" ? "Probabilité" : "Impact",
      "Mise en oeuvre": AUTOMATION_LABEL[ct.automation],
      "Poids": ct.strength,
      "Prouvé": ct.proven ? "Oui" : "Non",
      "Preuve": ct.proof ? FACT_LABEL[ct.proof] : "Déclaratif — non constatable",
      "Abattement apporté": ct.abatement,
      "Observation": ct.note ?? "",
    })),
  );

  const e = exposure(risks);
  const synthese = [
    { Indicateur: "Date d'arrêté", Valeur: asOf },
    { Indicateur: "Société", Valeur: firm.name },
    { Indicateur: "Appétence (score résiduel max accepté)", Valeur: appetite },
    { Indicateur: "Risques cartographiés", Valeur: e.count },
    { Indicateur: "Exposition brute (somme des scores)", Valeur: e.grossTotal },
    { Indicateur: "Exposition résiduelle", Valeur: e.residualTotal },
    { Indicateur: "Réduction (%)", Valeur: e.reductionPct },
    { Indicateur: "Score résiduel moyen", Valeur: e.avgResidual },
    { Indicateur: "Risques hors appétence", Valeur: e.aboveAppetite },
    { Indicateur: "Contrôles prouvés / total", Valeur: `${e.controlsProven}/${e.controlsTotal}` },
    ...LEVEL_ORDER.map((l) => ({ Indicateur: `Brut - ${LEVEL_LABEL[l]}`, Valeur: e.grossByLevel[l] })),
    ...LEVEL_ORDER.map((l) => ({ Indicateur: `Résiduel - ${LEVEL_LABEL[l]}`, Valeur: e.residualByLevel[l] })),
    { Indicateur: "Réserve", Valeur: RISK_DISCLAIMER },
  ];

  const wsR = XLSX.utils.json_to_sheet(registre);
  wsR["!cols"] = [
    { wch: 5 }, { wch: 6 }, { wch: 26 }, { wch: 20 }, { wch: 80 }, { wch: 40 },
    ...Array.from({ length: 16 }, () => ({ wch: 12 })),
  ];
  wsR["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(wsR["!ref"] ?? "A1")) };
  wsR["!freeze"] = { xSplit: 2, ySplit: 1 };

  const wsC = XLSX.utils.json_to_sheet(controles);
  wsC["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 70 }, { wch: 12 }, { wch: 13 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 44 }, { wch: 12 }, { wch: 60 }];

  const wsS = XLSX.utils.json_to_sheet(synthese);
  wsS["!cols"] = [{ wch: 44 }, { wch: 60 }];

  XLSX.utils.book_append_sheet(wb, wsR, "Registre");
  XLSX.utils.book_append_sheet(wb, wsC, "Contrôles");
  XLSX.utils.book_append_sheet(wb, wsS, "Synthèse");
  XLSX.writeFile(wb, riskFileName(asOf, "xlsx"));
}
