/**
 * Formulaire exhaustif d'évaluation des risques — plan d'action 2.4 + Tableau 13.
 *
 * Chaque fiche reprend : le risque (brut à dispositif nul, dispositif prouvé,
 * résiduel CALCULÉ), l'indicateur Tableau 13 (libellé, nature exposition/avéré,
 * collecte auto/manuel, seuil, responsable) avec sa VALEUR RELEVÉE EN DIRECT à
 * la date d'arrêté, l'action (responsable, échéance datée, objectif, mise en
 * œuvre), puis des champs à remplir (constat, preuve, date, signature).
 *
 * Les 5 risques hors référentiel applicatif (R26–R30) portent une cotation
 * « à valider en atelier » — le mémoire retient lui-même comme limite que les
 * cotations n'ont pas été validées en atelier. Un indicateur non constatable
 * reste manuel : son champ se remplit sur le formulaire, jamais dans le code.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AppState, Firm } from "@/data/types";
import {
  CATEGORY_LABEL, RISK_CATALOGUE, STEP_LABEL,
  type AssessedRisk,
} from "./risk-engine";
import { LEVEL_LABEL } from "./risk-params";
import { dateFr } from "./format";
import {
  ALERT, FONT, FS, M, afterTable, drawFullHeader, ensure,
  firmLogoPath, firmPalette, lineHeight, loadLogo, paintFooters, tableStyles,
  type Cursor,
} from "./pdf-kit";
import { asciiSpaces } from "./pdf-kit";
import {
  EVAL_ACTIONS, EXTRA_DEFS, computeLive, echeanceDate,
  type EvalActionDef,
} from "./risk-evaluation-data";

export interface EvaluationExportContext {
  firm: Firm;
  asOf: string;
  appetite: number;
  /** Cartographie évaluée (déjà cotée contre les faits, avec l'appétence du jour). */
  risks: AssessedRisk[];
  /** État applicatif (indicateurs relus en direct). */
  s: AppState;
}

/* -------------------------------------------------- primitives -------------------------------------------------- */

function note(
  doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, text: string,
  opts: { bold?: boolean; alert?: boolean; size?: number } = {},
): void {
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

function section(
  doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, title: string,
): void {
  ensure(cur, 14);
  cur.y += 2;
  doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...pal.deep);
  doc.text(asciiSpaces(title.toUpperCase()), M, cur.y, { charSpace: 0.4 });
  cur.y += 2.2;
  doc.setDrawColor(...pal.olive).setLineWidth(0.5).line(M, cur.y, doc.internal.pageSize.getWidth() - M, cur.y);
  cur.y += 5;
}

/** Ligne à remplir sur le formulaire : libellé + pointillés jusqu'à la marge. */
function fillLine(doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor, label: string): void {
  const pw = doc.internal.pageSize.getWidth();
  ensure(cur, 7);
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.muted);
  doc.text(asciiSpaces(label), M, cur.y);
  const w = doc.getTextWidth(asciiSpaces(label));
  doc.setDrawColor(...pal.olive).setLineWidth(0.25).setLineDashPattern([1, 1], 0);
  doc.line(M + w + 2, cur.y, pw - M, cur.y);
  doc.setLineDashPattern([], 0);
  cur.y += 7;
}

function kvTable(
  doc: jsPDF, pal: ReturnType<typeof firmPalette>, cur: Cursor,
  rows: [string, string][], head?: [string, string],
): void {
  autoTable(doc, {
    startY: cur.y,
    head: head ? [head] : undefined,
    body: rows,
    ...tableStyles(pal),
    styles: { ...tableStyles(pal).styles, fontSize: 7.6, cellPadding: 1.8 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: "bold" } },
  });
  afterTable(cur, 4);
}

/* -------------------------------------------------- construction -------------------------------------------------- */

const PLAN_LABEL = ["", "Plan 1 — huit risques prioritaires", "Plan 2 — huit risques en vigilance"] as const;

export async function buildEvaluationPdf(ctx: EvaluationExportContext): Promise<jsPDF> {
  const { firm, asOf, appetite, risks, s } = ctx;
  const pal = firmPalette(firm);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `Formulaire d'évaluation des risques — ${firm.name} — ${asOf}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  // Titre plein cadre (drawTitleBox tronquerait ce libellé long) : capitales
  // vert marque + filet d'accent, même grammaire visuelle que le socle.
  {
    const pw = doc.internal.pageSize.getWidth();
    const title = "FORMULAIRE D'ÉVALUATION DES RISQUES";
    ensure(cur, 16);
    doc.setFont(FONT, "bold").setFontSize(13).setTextColor(...pal.deep);
    doc.text(asciiSpaces(title), pw / 2, cur.y + 4, { align: "center" });
    doc.setDrawColor(...pal.olive).setLineWidth(0.6).line(M, cur.y + 7, pw - M, cur.y + 7);
    cur.y += 12;
  }
  note(doc, pal, cur,
    `Plan d'action 2.4 — Tableau 13 (fiches d'indicateurs clés, d'après Lakrari, 2013). `
    + `Société : ${firm.name} — arrêté au ${dateFr(asOf)} — appétence ${appetite}. `
    + `Les valeurs « relevé le » sont calculées dans l'application à la date d'arrêté ; `
    + `les champs pointillés se remplissent à la main, sur pièce.`,
    { size: FS.note },
  );
  cur.y += 2;

  const byRef = new Map(risks.map((r) => [r.ref, r]));
  const catalogByRef = new Map(RISK_CATALOGUE.map((d) => [d.ref, d]));
  const extraByRef = new Map(EXTRA_DEFS.map((d) => [d.ref, d]));

  /* --- Synthèse des 16 fiches --- */
  section(doc, pal, cur, "Synthèse — les 16 fiches");
  autoTable(doc, {
    startY: cur.y,
    head: [["N°", "Réf", "Action", "Résiduel / cotation", "Indicateur relevé le " + dateFr(asOf), "Alerte"]],
    body: EVAL_ACTIONS.map((a) => {
      const r = byRef.get(a.ref);
      const live = computeLive(a.ref, { s, firm, asOf });
      const cot = r
        ? `${r.residualLikelihood} × ${r.residualImpact} = ${r.residualScore} (${LEVEL_LABEL[r.residualLevel]})`
        : "à coter en atelier";
      return [
        String(a.action), a.ref, a.titre, cot,
        live ? live.valeur : "manuel (champ ci-dessous)",
        live ? (live.alerte ? "OUI" : "non") : "à constater",
      ];
    }),
    ...tableStyles(pal),
    styles: { ...tableStyles(pal).styles, fontSize: 7, cellPadding: 1.5, halign: "center" },
    columnStyles: { 2: { halign: "left" }, 4: { halign: "left" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 5 && d.cell.raw === "OUI") {
        d.cell.styles.textColor = ALERT;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  afterTable(cur, 5);

  /* --- Fiches détaillées --- */
  for (const plan of [1, 2] as const) {
    section(doc, pal, cur, PLAN_LABEL[plan]);
    for (const a of EVAL_ACTIONS.filter((x) => x.plan === plan)) {
      ensure(cur, 30);
      section(doc, pal, cur, `Action ${a.action} — ${a.ref} — ${a.titre}`);
      const r = byRef.get(a.ref);
      const def = catalogByRef.get(a.ref) ?? extraByRef.get(a.ref);
      const live = computeLive(a.ref, { s, firm, asOf });

      const cotBrut = r
        ? `${r.grossLikelihood} × ${r.grossImpact} = ${r.grossScore} (${LEVEL_LABEL[r.grossLevel]}, à dispositif nul)`
        : "— (hors référentiel applicatif : à coter en atelier avec la direction — limite n° 1 du mémoire)";
      const dispositif = r
        ? `${r.provenCount}/${r.assessedControls.length} contrôles prouvés — résiduel ${r.residualLikelihood} × ${r.residualImpact} = ${r.residualScore} (${LEVEL_LABEL[r.residualLevel]}), réduction ${r.reductionPct} % — ${r.aboveAppetite ? "HORS APPÉTENCE" : "accepté"}`
        : "— (dispositif à décrire en atelier)";
      kvTable(doc, pal, cur, [
        ["Événement", def ? `${def.event}` : ""],
        ["Base", def ? def.basis : ""],
        ["Étape / catégorie", def ? `${STEP_LABEL[def.step]} · ${CATEGORY_LABEL[def.category]}` : ""],
        ["Brut", cotBrut],
        ["Dispositif -> résiduel", dispositif],
      ]);

      const ind = a.indicateur;
      kvTable(doc, pal, cur, [
        ["Indicateur (Tableau 13)", ind.libelle],
        ["Nature", `${ind.nature} — seuil : ${ind.seuil}`],
        ["Collecte", `${ind.collecte} — ${ind.collecteNote}`],
        ["Responsable du suivi", ind.responsableSuivi],
        ["Valeur relevée le " + dateFr(asOf), live ? `${live.valeur}${live.detail ? ` — ${live.detail}` : ""}` : "MANUEL — à renseigner ci-dessous"],
        ["Verdict", live ? (live.alerte ? "ALERTE — seuil franchi, traiter" : "Sous le seuil") : "À constater sur pièce"],
      ], ["Rubrique", "Indicateur d'après Lakrari (2013), adapté"]);

      kvTable(doc, pal, cur, [
        ["Responsable", a.responsable],
        ["Échéance", `${a.echeanceLabel} — soit le ${dateFr(echeanceDate(asOf, a.echeance))} au plus tard`],
        ["Objectif", a.objectif],
        ...a.miseEnOeuvre.map((m, i): [string, string] => [i === 0 ? "Mise en œuvre" : "", `${i + 1}. ${m}`]),
        ...(a.vigilance ? [["Point de vigilance", a.vigilance] as [string, string]] : []),
      ], ["Rubrique", `Action ${a.action} — plan d'action 2.4`]);

      fillLine(doc, pal, cur, "Constat relevé : ");
      fillLine(doc, pal, cur, "Preuve jointe : ");
      fillLine(doc, pal, cur, "Date :                          Signature : ");
      cur.y += 3;
    }
  }

  /* --- Limites et revue --- */
  section(doc, pal, cur, "Limites de la cartographie et prochaine revue");
  note(doc, pal, cur,
    "Cinq limites, reprises du mémoire : (1) cotations non validées en atelier avec la direction ; "
    + "(2) base reconstituée du 5 au 15 août 2026 sans mesure d'évolution ; (3) aucun entretien "
    + "formalisé ; (4) compensation du modèle chiffrée par le test ; (5) périmètre de deux entités. "
    + "Prochaine revue sur les paies d'après-plan, pour mesurer l'effet des actions, à chaque "
    + "changement de barème, entrée d'entité ou modification d'un contrôle incorporé.",
  );
  cur.y += 3;
  note(doc, pal, cur,
    "Cartographie établie à dispositif constaté dans l'application à la date d'arrêté. Les cotations "
    + "brutes sont des estimations à valider par la direction ; les bases normatives signalées « à "
    + "confirmer » doivent l'être avant tout usage déclaratif ou contentieux. Un contrôle non prouvé "
    + "n'abat rien : son absence d'effet est un constat, pas une opinion. Ce document ne vaut ni "
    + "certificat de conformité, ni rapport d'audit.",
    { size: FS.micro },
  );

  paintFooters(doc, firm, pal);
  return doc;
}

export function evaluationFileName(asOf: string): string {
  return `Formulaire_Evaluation_Risques_Paie_${asOf}.pdf`;
}

export async function exportEvaluationPdf(ctx: EvaluationExportContext): Promise<{ blob: Blob; filename: string }> {
  const doc = await buildEvaluationPdf(ctx);
  const filename = evaluationFileName(ctx.asOf);
  const blob = doc.output("blob");
  doc.save(filename);
  return { blob, filename };
}
