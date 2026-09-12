/**
 * Exports de la cartographie des risques — PDF « rapport » et Excel « façon finance ».
 *
 * Le premier jet empilait tout dans un unique tableau de dix colonnes en corps 6,6 : illisible,
 * et surtout faux du point de vue de la lecture — une cartographie se lit d'abord par la
 * SYNTHÈSE (où en est-on ?), puis par la MATRICE (où sont les risques ?), et seulement ensuite
 * par le détail. Le PDF suit désormais cet ordre, et la matrice y est réellement DESSINÉE.
 *
 * Le PDF porte EN CLAIR la réserve : une cartographie n'est ni un certificat de conformité ni
 * un rapport d'audit. Éditée sans cette mention, elle crée chez son lecteur — direction, banque,
 * commissaire aux comptes — une sécurité qu'elle ne garantit pas.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Firm, RiskAction, RiskSnapshot } from "@/data/types";
import { dateFr } from "./format";
import {
  AUTOMATION_LABEL,
  CATEGORY_LABEL,
  CONTROL_TYPE_LABEL,
  RISK_DISCLAIMER,
  STEPS,
  STEP_LABEL,
  controlGaps,
  criticityMatrix,
  exposure,
  type AssessedRisk,
} from "./risk-engine";
import { LEVEL_LABEL, LEVEL_ORDER, MAX_ABATEMENT_POINTS, levelOf, type RiskLevel } from "./risk-params";
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

/** Nom de fichier normalisé (ASCII). */
export function riskFileName(asOf: string, ext: string): string {
  return `Cartographie_Risques_Paie_${asOf}.${ext}`;
}

/** Tout ce que l'export doit connaître, au-delà des risques eux-mêmes. */
export interface RiskExportContext {
  firm: Firm;
  risks: AssessedRisk[];
  appetite: number;
  asOf: string;
  actions: RiskAction[];
  snapshots: RiskSnapshot[];
}

/* -------------------------------------------------- couleurs de niveau -------------------------------------------------- */

/**
 * Teinte de fond d'un niveau de gravité. Sémantique de risque, DISTINCTE de la couleur de
 * marque : un vert d'entreprise sur une case « critique » tromperait l'œil.
 */
const LEVEL_FILL: Record<RiskLevel, [number, number, number]> = {
  faible: [226, 240, 226],
  modere: [253, 245, 214],
  eleve: [253, 226, 197],
  critique: [248, 209, 208],
};
const LEVEL_INK: Record<RiskLevel, [number, number, number]> = {
  faible: [38, 105, 47],
  modere: [138, 97, 0],
  eleve: [176, 84, 12],
  critique: [166, 43, 34],
};

/* -------------------------------------------------- primitives PDF -------------------------------------------------- */

const nf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Paragraphe replié à la largeur utile. Fait avancer le curseur. */
function note(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, text: string, opts: { bold?: boolean; alert?: boolean; size?: number } = {}): void {
  const pw = doc.internal.pageSize.getWidth();
  const size = opts.size ?? FS.note;
  doc.setFont(FONT, opts.bold ? "bold" : "normal").setFontSize(size).setTextColor(...(opts.alert ? ALERT : pal.muted));
  const lines = doc.splitTextToSize(asciiSpaces(text), pw - 2 * M) as string[];
  const lh = lineHeight(size);
  ensure(cur, lines.length * lh);
  for (const line of lines) {
    doc.text(line, M, cur.y);
    cur.y += lh;
  }
}

/** Titre de section : capitales espacées en vert de marque, souligné d'un filet d'accent. */
function section(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, title: string): void {
  const pw = doc.internal.pageSize.getWidth();
  ensure(cur, 14);
  cur.y += 2;
  doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...pal.deep);
  doc.text(asciiSpaces(title.toUpperCase()), M, cur.y, { charSpace: 0.4 });
  cur.y += 2.2;
  doc.setDrawColor(...pal.olive).setLineWidth(0.5).line(M, cur.y, pw - M, cur.y);
  cur.y += 5;
}

/**
 * Bande d'indicateurs. Le nombre de risques HORS APPÉTENCE est mis en exergue : c'est la seule
 * valeur de la synthèse qui appelle une décision, elle ne doit pas se noyer dans les autres.
 */
function drawKpis(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, e: ReturnType<typeof exposure>, appetite: number): void {
  const cards: { label: string; value: string; sub?: string; alert?: boolean }[] = [
    { label: "Risques cartographiés", value: String(e.count) },
    { label: "Exposition brute", value: nf(e.grossTotal), sub: "à dispositif nul" },
    { label: "Exposition résiduelle", value: nf(e.residualTotal), sub: `-${e.reductionPct} % après contrôles` },
    { label: "Hors appétence", value: String(e.aboveAppetite), sub: `seuil ${appetite}`, alert: e.aboveAppetite > 0 },
    { label: "Contrôles prouvés", value: `${e.controlsProven}/${e.controlsTotal}` },
  ];
  const pw = doc.internal.pageSize.getWidth();
  const gap = 3.5;
  const cardW = (pw - 2 * M - gap * (cards.length - 1)) / cards.length;
  const cardH = 19;
  const y = cur.y;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    const hot = !!c.alert;
    doc.setFillColor(...(hot ? [253, 240, 239] as [number, number, number] : pal.tint));
    doc.setDrawColor(...(hot ? ALERT : pal.olive)).setLineWidth(hot ? 0.55 : 0.3);
    doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, "FD");
    doc.setFont(FONT, "normal").setFontSize(FS.micro - 0.4).setTextColor(...pal.muted);
    doc.text(asciiSpaces(c.label), x + cardW / 2, y + 5.2, { align: "center", maxWidth: cardW - 3 });
    doc.setFont(FONT, "bold").setFontSize(14).setTextColor(...(hot ? ALERT : pal.deep));
    doc.text(asciiSpaces(c.value), x + cardW / 2, y + 12.2, { align: "center", maxWidth: cardW - 3 });
    if (c.sub) {
      doc.setFont(FONT, "normal").setFontSize(FS.micro - 1).setTextColor(...pal.muted);
      doc.text(asciiSpaces(c.sub), x + cardW / 2, y + 16.4, { align: "center", maxWidth: cardW - 3 });
    }
  });
  cur.y = y + cardH;
}

/**
 * Matrice de criticité 5 x 5, réellement dessinée — c'est l'objet que le lecteur attend d'une
 * cartographie, et qu'un tableau de chiffres ne remplace pas. Deux grilles côte à côte, brute et
 * résiduelle, pour que le DÉPLACEMENT saute aux yeux.
 */
function drawMatrices(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, risks: AssessedRisk[]): void {
  const pw = doc.internal.pageSize.getWidth();
  const gutter = 14;
  const gridW = (pw - 2 * M - gutter) / 2;
  const cell = Math.min(gridW / 5, 17);
  const gridH = cell * 5;

  ensure(cur, gridH + 24);
  const top = cur.y;

  (["gross", "residual"] as const).forEach((axis, gi) => {
    const grid = criticityMatrix(risks, axis);
    const x0 = M + gi * (gridW + gutter) + 6; // 6 mm réservés à l'échelle d'impact
    const label = axis === "gross" ? "BRUT (à dispositif nul)" : "RÉSIDUEL (après contrôles)";

    doc.setFont(FONT, "bold").setFontSize(FS.note).setTextColor(...pal.deep);
    doc.text(asciiSpaces(label), x0 + (cell * 5) / 2, top, { align: "center" });

    const gTop = top + 3;
    for (let imp = 5; imp >= 1; imp -= 1) {
      const row = 5 - imp;
      const y = gTop + row * cell;
      // Échelle d'impact, en ordonnée.
      doc.setFont(FONT, "normal").setFontSize(FS.micro - 1).setTextColor(...pal.muted);
      doc.text(String(imp), x0 - 2.5, y + cell / 2 + 1, { align: "center" });

      for (let lik = 1; lik <= 5; lik += 1) {
        const x = x0 + (lik - 1) * cell;
        const lvl = levelOf(imp * lik);
        const refs = grid[imp - 1][lik - 1];
        doc.setFillColor(...LEVEL_FILL[lvl]);
        doc.setDrawColor(255, 255, 255).setLineWidth(0.6);
        doc.rect(x, y, cell, cell, "FD");
        if (refs.length > 0) {
          doc.setFont(FONT, "bold").setFontSize(refs.length > 3 ? FS.micro - 1.6 : FS.micro - 0.4).setTextColor(...LEVEL_INK[lvl]);
          // Au-delà de trois références, on affiche le compte : entasser rendrait la case illisible.
          const txt = refs.length > 3 ? `${refs.length} risques` : refs.join(" ");
          doc.text(asciiSpaces(txt), x + cell / 2, y + cell / 2 + 1, { align: "center", maxWidth: cell - 1.5 });
        }
      }
    }
    // Échelle de probabilité, en abscisse.
    doc.setFont(FONT, "normal").setFontSize(FS.micro - 1).setTextColor(...pal.muted);
    for (let lik = 1; lik <= 5; lik += 1) {
      doc.text(String(lik), x0 + (lik - 1) * cell + cell / 2, gTop + gridH + 3.4, { align: "center" });
    }
    doc.setFontSize(FS.micro - 1.4);
    doc.text("Probabilité ->", x0 + (cell * 5) / 2, gTop + gridH + 7, { align: "center" });
    doc.text("Impact ^", x0 - 2.5, gTop - 1.5, { align: "center" });
  });

  cur.y = top + 3 + gridH + 9;

  // Légende des niveaux.
  let lx = M;
  doc.setFontSize(FS.micro - 0.6);
  for (const lvl of LEVEL_ORDER) {
    doc.setFillColor(...LEVEL_FILL[lvl]);
    doc.setDrawColor(...LEVEL_INK[lvl]).setLineWidth(0.25);
    doc.rect(lx, cur.y - 2.6, 4, 3.2, "FD");
    doc.setFont(FONT, "normal").setTextColor(...pal.muted);
    doc.text(asciiSpaces(LEVEL_LABEL[lvl]), lx + 5.4, cur.y);
    lx += 5.4 + doc.getTextWidth(LEVEL_LABEL[lvl]) + 7;
  }
  cur.y += 5;
}

/** Barres comparatives brut / résiduel par niveau — le déplacement de l'exposition, en une image. */
function drawShift(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, e: ReturnType<typeof exposure>): void {
  const pw = doc.internal.pageSize.getWidth();
  const labelW = 24;
  const barMax = pw - 2 * M - labelW - 26;
  const max = Math.max(1, e.count);
  ensure(cur, LEVEL_ORDER.length * 10 + 6);

  for (const lvl of LEVEL_ORDER) {
    const g = e.grossByLevel[lvl];
    const r = e.residualByLevel[lvl];
    const y = cur.y;
    doc.setFont(FONT, "normal").setFontSize(FS.micro).setTextColor(...pal.ink);
    doc.text(asciiSpaces(LEVEL_LABEL[lvl]), M, y + 3);

    // Barre pâle = brut, barre pleine = résiduel.
    doc.setFillColor(214, 214, 210);
    doc.rect(M + labelW, y, Math.max(0.4, (g / max) * barMax), 3, "F");
    doc.setFillColor(...LEVEL_INK[lvl]);
    doc.rect(M + labelW, y + 4, Math.max(0.4, (r / max) * barMax), 3, "F");

    doc.setFontSize(FS.micro - 0.6).setTextColor(...pal.muted);
    doc.text(asciiSpaces(`${g} -> ${r}`), pw - M, y + 5.4, { align: "right" });
    cur.y = y + 10;
  }
  doc.setFont(FONT, "italic").setFontSize(FS.micro - 1).setTextColor(...pal.muted);
  doc.text(asciiSpaces("Barre pâle : brut. Barre pleine : résiduel."), M, cur.y + 1);
  cur.y += 5;
}

/* -------------------------------------------------- PDF -------------------------------------------------- */

/** Construit le PDF (sans le sauvegarder) — testable hors navigateur. */
export async function buildRiskPdf(ctx: RiskExportContext): Promise<jsPDF> {
  const { firm, risks, appetite, asOf, actions, snapshots } = ctx;
  const pal = firmPalette(firm);
  // Portrait : le rapport se lit en sections, pas en tableau géant. Les seuls tableaux larges
  // (registre par étape) tiennent en portrait une fois la colonne « événement » repliée.
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `Cartographie des risques — ${firm.name}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, RISK_DOC_TITLE, cur.y) + 6;
  note(doc, pal, cur, `Arrêtée au ${dateFr(asOf)} — appétence : score résiduel maximal accepté ${appetite}.`);
  cur.y += 4;

  const e = exposure(risks);

  /* --- 1. Synthèse --- */
  drawKpis(doc, pal, cur, e, appetite);
  cur.y += 6;

  /* --- 2. Matrice de criticité --- */
  section(doc, pal, cur, "Matrice de criticité");
  drawMatrices(doc, pal, cur, risks);
  cur.y += 3;

  /* --- 3. Déplacement de l'exposition --- */
  section(doc, pal, cur, "Déplacement de l'exposition");
  drawShift(doc, pal, cur, e);
  cur.y += 2;

  /* --- 4. Registre, une table par étape du processus --- */
  const byStep = STEPS.map((st) => ({ step: st, items: risks.filter((r) => r.step === st) })).filter((g) => g.items.length > 0);
  for (const g of byStep) {
    ensure(cur, 34);
    section(doc, pal, cur, STEP_LABEL[g.step]);
    autoTable(doc, {
      startY: cur.y,
      head: [["Réf", "Événement de risque", "Brut", "Contrôles", "Résiduel", "Traitement"]],
      body: g.items.map((r) => [
        r.ref,
        `${r.event}\n${CATEGORY_LABEL[r.category]} · ${r.basis}`,
        `${r.grossLikelihood}x${r.grossImpact}=${r.grossScore}\n${LEVEL_LABEL[r.grossLevel]}`,
        `${r.provenCount}/${r.assessedControls.length}\nprouvés`,
        `${r.residualLikelihood}x${r.residualImpact}=${r.residualScore}\n${LEVEL_LABEL[r.residualLevel]}`,
        r.aboveAppetite ? "Réduire" : "Accepter",
      ]),
      ...tableStyles(pal),
      styles: { ...tableStyles(pal).styles, fontSize: 7, cellPadding: 1.6, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 11, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 82 },
        2: { cellWidth: 19, halign: "center" },
        3: { cellWidth: 17, halign: "center" },
        4: { cellWidth: 19, halign: "center" },
        5: { cellWidth: 18, halign: "center" },
      },
      // La cellule résiduelle prend la teinte de son niveau : la gravité se lit sans relire le mot.
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const r = g.items[d.row.index];
        if (!r) return;
        if (d.column.index === 4) {
          d.cell.styles.fillColor = LEVEL_FILL[r.residualLevel];
          d.cell.styles.textColor = LEVEL_INK[r.residualLevel];
          d.cell.styles.fontStyle = "bold";
        }
        if (d.column.index === 2) d.cell.styles.textColor = [110, 110, 105];
        if (d.column.index === 5 && r.aboveAppetite) {
          d.cell.styles.textColor = ALERT;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    afterTable(cur, 5);
  }

  /* --- 5. Angles morts --- */
  const gaps = controlGaps(risks);
  if (gaps.length > 0) {
    ensure(cur, 34);
    section(doc, pal, cur, "Angles morts — contrôles qui n'abattent rien");
    note(doc, pal, cur, "Ces contrôles figurent au dispositif mais rien ne prouve leur application. Ils ne sont pas neutres : ils créent l'illusion d'une maîtrise et détournent l'attention d'une exposition réelle.");
    cur.y += 2;
    autoTable(doc, {
      startY: cur.y,
      head: [["Contrôle attendu", "Nature", "Axe", "Risques", "Ce qui manque"]],
      body: gaps.map((gp) => [
        gp.control.label,
        `${CONTROL_TYPE_LABEL[gp.control.type]}\n${AUTOMATION_LABEL[gp.control.automation]}`,
        gp.axis === "likelihood" ? "Probabilité" : "Impact",
        gp.refs.join(", "),
        gp.control.note ?? (gp.control.proof ? FACT_LABEL[gp.control.proof] : "Contrôle déclaratif, non constatable"),
      ]),
      ...tableStyles(pal),
      styles: { ...tableStyles(pal).styles, fontSize: 7, cellPadding: 1.6, valign: "top" },
      columnStyles: {
        0: { cellWidth: 56 },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 22 },
        4: { cellWidth: 46 },
      },
    });
    afterTable(cur, 5);
  }

  /* --- 6. Plan de traitement --- */
  if (actions.length > 0) {
    ensure(cur, 30);
    section(doc, pal, cur, "Plan de traitement");
    autoTable(doc, {
      startY: cur.y,
      head: [["Risque", "Action", "Responsable", "Échéance", "État", "Avanc."]],
      body: [...actions]
        .sort((a, b) => a.due.localeCompare(b.due))
        .map((a) => [
          a.risk_ref, a.action, a.owner || "—", a.due ? dateFr(a.due) : "—",
          ACTION_LABEL[a.status] ?? a.status, `${a.progress} %`,
        ]),
      ...tableStyles(pal),
      styles: { ...tableStyles(pal).styles, fontSize: 7, cellPadding: 1.6, valign: "top" },
      columnStyles: {
        0: { cellWidth: 14, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 74 },
        2: { cellWidth: 28 },
        3: { cellWidth: 20, halign: "center" },
        4: { cellWidth: 18, halign: "center" },
        5: { cellWidth: 12, halign: "right" },
      },
      // Une action en retard et non close ressort en rouge : c'est l'information utile du tableau.
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const sorted = [...actions].sort((x, y) => x.due.localeCompare(y.due));
        const a = sorted[d.row.index];
        if (a && d.column.index === 3 && a.due && a.due < asOf && a.status !== "fait" && a.status !== "abandonne") {
          d.cell.styles.textColor = ALERT;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    afterTable(cur, 5);
  }

  /* --- 7. Suivi dans le temps --- */
  if (snapshots.length > 0) {
    ensure(cur, 26);
    section(doc, pal, cur, "Suivi de l'amélioration");
    const ordered = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
    autoTable(doc, {
      startY: cur.y,
      head: [["Arrêté au", "Risques", "Brut", "Résiduel", "Réduction", "Hors appétence", "Contrôles prouvés"]],
      body: ordered.map((sn, i) => {
        const prev = i > 0 ? ordered[i - 1] : null;
        const delta = prev ? sn.residualTotal - prev.residualTotal : null;
        const red = sn.grossTotal > 0 ? Math.round(((sn.grossTotal - sn.residualTotal) / sn.grossTotal) * 100) : 0;
        return [
          dateFr(sn.asOf), String(sn.count), nf(sn.grossTotal),
          delta == null ? nf(sn.residualTotal) : `${nf(sn.residualTotal)} (${delta > 0 ? "+" : ""}${nf(delta)})`,
          `${red} %`, String(sn.aboveAppetite), `${sn.controlsProven}/${sn.controlsTotal}`,
        ];
      }),
      ...tableStyles(pal),
      styles: { ...tableStyles(pal).styles, fontSize: 7.2, cellPadding: 1.6, halign: "center" },
      columnStyles: { 0: { halign: "left" } },
    });
    afterTable(cur, 5);
  }

  /* --- 8. Méthode et réserve --- */
  ensure(cur, 40);
  section(doc, pal, cur, "Méthode et réserve");
  note(
    doc, pal, cur,
    "Le brut est coté à dispositif NUL — comme si aucun contrôle n'existait. Le résiduel n'est pas "
    + "saisi, il est CALCULÉ : un contrôle préventif abat la probabilité, un contrôle détectif ou "
    + "correctif abat l'impact, à hauteur de son poids multiplié par son degré d'automatisation. "
    + `L'abattement est plafonné à ${MAX_ABATEMENT_POINTS} points par axe, plancher 1 : aucun `
    + "dispositif ne fait descendre un risque critique au niveau négligeable. Un contrôle non "
    + "prouvé n'abat rien.",
  );
  cur.y += 3;
  note(doc, pal, cur, RISK_DISCLAIMER, { size: FS.micro });

  paintFooters(doc, firm, pal);
  return doc;
}

const ACTION_LABEL: Record<string, string> = {
  a_lancer: "À lancer", en_cours: "En cours", fait: "Fait", abandonne: "Abandonnée",
};

export async function exportRiskPdf(ctx: RiskExportContext): Promise<{ blob: Blob; filename: string }> {
  const doc = await buildRiskPdf(ctx);
  const filename = riskFileName(ctx.asOf, "pdf");
  const blob = doc.output("blob");
  doc.save(filename);
  return { blob, filename };
}

/* -------------------------------------------------- Excel « façon finance » -------------------------------------------------- */

const MONEY = "#,##0.00";
const INT = "0";
const PCT = "0 %";

/** Applique un format de nombre à une plage de colonnes. */
function applyFormats(ws: XLSX.WorkSheet, fmtByCol: Record<number, string>, from: number, to: number): void {
  for (let r = from; r <= to; r += 1) {
    for (const key of Object.keys(fmtByCol)) {
      const c = Number(key);
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = fmtByCol[c];
    }
  }
}

/**
 * Classeur à cinq onglets — Registre, Contrôles, Matrice, Plan d'action, Suivi.
 *
 * Présentation finance alignée sur le livre de paie : titre et sous-titre fusionnés, formats de
 * nombres normalisés, filtre automatique, volets figés, largeurs ajustées. Le premier jet
 * utilisait `json_to_sheet` sans aucun de ces attributs — techniquement un export, visuellement
 * un déversement.
 */
export function exportRiskXlsx(ctx: RiskExportContext): void {
  const { firm, risks, appetite, asOf, actions, snapshots } = ctx;
  const e = exposure(risks);
  const wb = XLSX.utils.book_new();

  /* --- Onglet 1 : Registre --- */
  const HEAD = [
    "N°", "Réf", "Étape", "Catégorie", "Événement de risque", "Base normative",
    "P brut", "I brut", "Score brut", "Niveau brut",
    "Contrôles prouvés", "Contrôles total", "Abat. P", "Abat. I",
    "P rés.", "I rés.", "Score rés.", "Niveau rés.",
    "Réduction", "Réduction %", "Hors appétence", "Traitement",
  ];
  const LAST = HEAD.length - 1;
  const HEADER_ROW = 3;
  const rows: (string | number)[][] = [
    [`${RISK_DOC_TITLE} — ${firm.name}`],
    [`Arrêtée au ${dateFr(asOf)} · appétence ${appetite} · ${e.count} risques · exposition ${e.grossTotal} -> ${e.residualTotal} (-${e.reductionPct} %)`],
    [],
    HEAD,
  ];
  risks.forEach((r, i) => rows.push([
    i + 1, r.ref, STEP_LABEL[r.step], CATEGORY_LABEL[r.category], r.event, r.basis,
    r.grossLikelihood, r.grossImpact, r.grossScore, LEVEL_LABEL[r.grossLevel],
    r.provenCount, r.assessedControls.length, r.abatementLikelihood, r.abatementImpact,
    r.residualLikelihood, r.residualImpact, r.residualScore, LEVEL_LABEL[r.residualLevel],
    r.reduction, r.reductionPct / 100, r.aboveAppetite ? "Oui" : "Non", r.aboveAppetite ? "Réduire" : "Accepter",
  ]));
  rows.push([
    "", "", `Total (${e.count})`, "", "", "", "", "", e.grossTotal, "", e.controlsProven, e.controlsTotal,
    "", "", "", "", e.residualTotal, "", e.grossTotal - e.residualTotal, e.reductionPct / 100, String(e.aboveAppetite), "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const first = HEADER_ROW + 1;
  const last = first + risks.length; // inclut la ligne de total
  applyFormats(ws, {
    6: INT, 7: INT, 8: INT, 10: INT, 11: INT, 12: INT, 13: INT,
    14: INT, 15: INT, 16: INT, 18: INT, 19: "0%",
  }, first, last);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: LAST } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: LAST } },
  ];
  ws["!autofilter"] = {
    ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: Math.max(first, last - 1), c: LAST })}`,
  };
  ws["!freeze"] = {
    xSplit: 2, ySplit: first, topLeftCell: XLSX.utils.encode_cell({ r: first, c: 2 }),
    activePane: "bottomRight", state: "frozen",
  };
  ws["!cols"] = [
    { wch: 5 }, { wch: 7 }, { wch: 26 }, { wch: 20 }, { wch: 90 }, { wch: 38 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 9 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 11 }, { wch: 14 }, { wch: 12 },
  ];
  ws["!rows"] = [{ hpt: 20 }, { hpt: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, "Registre");

  /* --- Onglet 2 : Contrôles --- */
  const cHead = ["Réf risque", "Étape", "Contrôle", "Nature", "Axe abattu", "Mise en oeuvre", "Poids", "Prouvé", "Preuve attendue", "Abattement", "Observation"];
  const cRows: (string | number)[][] = [
    ["DISPOSITIF DE MAÎTRISE — détail des contrôles"],
    [`${firm.name} · arrêté au ${dateFr(asOf)} · ${e.controlsProven} contrôles prouvés sur ${e.controlsTotal}`],
    [],
    cHead,
  ];
  for (const r of risks) {
    for (const ct of r.assessedControls) {
      cRows.push([
        r.ref, STEP_LABEL[r.step], ct.label, CONTROL_TYPE_LABEL[ct.type],
        ct.axis === "likelihood" ? "Probabilité" : "Impact",
        AUTOMATION_LABEL[ct.automation], ct.strength, ct.proven ? "Oui" : "Non",
        ct.proof ? FACT_LABEL[ct.proof] : "Déclaratif — non constatable",
        ct.abatement, ct.note ?? "",
      ]);
    }
  }
  const wsC = XLSX.utils.aoa_to_sheet(cRows);
  applyFormats(wsC, { 9: MONEY }, 4, cRows.length - 1);
  wsC["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: cHead.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: cHead.length - 1 } },
  ];
  wsC["!autofilter"] = { ref: `A4:${XLSX.utils.encode_cell({ r: Math.max(4, cRows.length - 1), c: cHead.length - 1 })}` };
  wsC["!freeze"] = { xSplit: 1, ySplit: 4, topLeftCell: "B5", activePane: "bottomRight", state: "frozen" };
  wsC["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 76 }, { wch: 12 }, { wch: 13 }, { wch: 17 }, { wch: 8 }, { wch: 8 }, { wch: 44 }, { wch: 12 }, { wch: 64 }];
  wsC["!rows"] = [{ hpt: 20 }, { hpt: 15 }];
  XLSX.utils.book_append_sheet(wb, wsC, "Contrôles");

  /* --- Onglet 3 : Matrice (deux grilles 5x5 lisibles telles quelles) --- */
  const mRows: (string | number)[][] = [["MATRICE DE CRITICITÉ"], [`${firm.name} · arrêtée au ${dateFr(asOf)}`], []];
  for (const axis of ["gross", "residual"] as const) {
    const grid = criticityMatrix(risks, axis);
    mRows.push([axis === "gross" ? "BRUT (à dispositif nul)" : "RÉSIDUEL (après contrôles)"]);
    mRows.push(["Impact \\ Probabilité", "1", "2", "3", "4", "5"]);
    for (let imp = 5; imp >= 1; imp -= 1) {
      mRows.push([imp, ...Array.from({ length: 5 }, (_, i) => grid[imp - 1][i].join(" "))]);
    }
    mRows.push([]);
  }
  mRows.push(["Légende", ...LEVEL_ORDER.map((l) => `${LEVEL_LABEL[l]}`)]);
  const wsM = XLSX.utils.aoa_to_sheet(mRows);
  wsM["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
  wsM["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  wsM["!rows"] = [{ hpt: 20 }, { hpt: 15 }];
  XLSX.utils.book_append_sheet(wb, wsM, "Matrice");

  /* --- Onglet 4 : Plan d'action --- */
  const aHead = ["Risque", "Action", "Responsable", "Échéance", "État", "Avancement", "En retard", "Notes"];
  const aRows: (string | number)[][] = [
    ["PLAN DE TRAITEMENT"],
    [`${firm.name} · ${actions.length} action(s) · ${e.aboveAppetite} risque(s) hors appétence`],
    [],
    aHead,
  ];
  for (const a of [...actions].sort((x, y) => x.due.localeCompare(y.due))) {
    const late = !!a.due && a.due < asOf && a.status !== "fait" && a.status !== "abandonne";
    aRows.push([a.risk_ref, a.action, a.owner, a.due, ACTION_LABEL[a.status] ?? a.status, a.progress / 100, late ? "OUI" : "", a.notes ?? ""]);
  }
  const wsA = XLSX.utils.aoa_to_sheet(aRows);
  applyFormats(wsA, { 5: PCT }, 4, aRows.length - 1);
  wsA["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: aHead.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: aHead.length - 1 } }];
  wsA["!autofilter"] = { ref: `A4:${XLSX.utils.encode_cell({ r: Math.max(4, aRows.length - 1), c: aHead.length - 1 })}` };
  wsA["!freeze"] = { xSplit: 1, ySplit: 4, topLeftCell: "B5", activePane: "bottomRight", state: "frozen" };
  wsA["!cols"] = [{ wch: 10 }, { wch: 70 }, { wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 50 }];
  wsA["!rows"] = [{ hpt: 20 }, { hpt: 15 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Plan d'action");

  /* --- Onglet 5 : Suivi de l'amélioration --- */
  const sHead = ["Arrêté au", "Pris le", "Par", "Risques", "Brut", "Résiduel", "Δ résiduel", "Réduction %", "Hors appétence", "Contrôles prouvés", "Contrôles total", "Libellé"];
  const sRows: (string | number)[][] = [
    ["SUIVI DE L'AMÉLIORATION — instantanés datés"],
    [`${firm.name} · ${snapshots.length} point(s) de mesure`],
    [],
    sHead,
  ];
  const ordered = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
  ordered.forEach((sn, i) => {
    const prev = i > 0 ? ordered[i - 1] : null;
    const red = sn.grossTotal > 0 ? (sn.grossTotal - sn.residualTotal) / sn.grossTotal : 0;
    sRows.push([
      sn.asOf, sn.taken_at.slice(0, 10), sn.taken_by ?? "", sn.count, sn.grossTotal, sn.residualTotal,
      prev ? sn.residualTotal - prev.residualTotal : "", red, sn.aboveAppetite,
      sn.controlsProven, sn.controlsTotal, sn.label ?? "",
    ]);
  });
  const wsS = XLSX.utils.aoa_to_sheet(sRows);
  applyFormats(wsS, { 3: INT, 4: INT, 5: INT, 6: INT, 7: "0 %", 8: INT, 9: INT, 10: INT }, 4, sRows.length - 1);
  wsS["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: sHead.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: sHead.length - 1 } }];
  wsS["!freeze"] = { xSplit: 1, ySplit: 4, topLeftCell: "B5", activePane: "bottomRight", state: "frozen" };
  wsS["!cols"] = [{ wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 34 }];
  wsS["!rows"] = [{ hpt: 20 }, { hpt: 15 }];
  XLSX.utils.book_append_sheet(wb, wsS, "Suivi");

  XLSX.writeFile(wb, riskFileName(asOf, "xlsx"));
}
