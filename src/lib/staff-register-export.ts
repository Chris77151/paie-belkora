/**
 * Exports du registre des mouvements de main-d'œuvre : PDF (gabarit documentaire commun) et
 * tableur (.xlsx) pour retraitement.
 *
 * Le PDF porte EN CLAIR la mention qu'il ne se substitue ni au livre de paie ni au registre des
 * congés : un registre édité sans cette réserve crée une fausse sécurité juridique chez le
 * lecteur (direction, banque, voire inspection).
 *
 * Aucune donnée sensible n'est exportée : le moteur n'en produit pas (ni salaire, ni RIB).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Firm } from "@/data/types";
import { dateFr } from "./format";
import {
  CATEGORY_LABEL,
  DECLARATION_LABEL,
  REGISTER_DISCLAIMER,
  type StaffRegister,
} from "./staff-register";
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

/** Nom de fichier normalisé (ASCII) : Registre_Personnel_<du>_<au>. */
export function registerFileName(r: StaffRegister, ext: string): string {
  return `Registre_Personnel_${r.from}_${r.to}.${ext}`;
}

/**
 * Formule d'arrêté du registre — usage constant en tenue de registre : elle fige le nombre de
 * lignes, ce qui rend visible tout ajout ou retrait postérieur à la signature.
 */
export function arreteLine(count: number): string {
  const mot = count > 1 ? "salariés" : "salarié";
  return `Arrêté le présent registre à ${count} ${mot} (${numberInWords(count)}).`;
}

/** Nombre en toutes lettres, pour la formule d'arrêté (0 à 999 — au-delà, le chiffre suffit). */
function numberInWords(n: number): string {
  const u = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
    "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const d = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  if (n < 0 || n > 999 || !Number.isInteger(n)) return String(n);
  if (n < 20) return u[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    if (t === 7 || t === 9) return `${d[t]}-${u[10 + r]}`;
    if (r === 0) return t === 8 ? "quatre-vingts" : d[t];
    return r === 1 && t !== 8 ? `${d[t]} et un` : `${d[t]}-${u[r]}`;
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  const cent = c === 1 ? "cent" : `${u[c]} cent${r === 0 ? "s" : ""}`;
  return r === 0 ? cent : `${cent} ${numberInWords(r)}`;
}

/** Colonnes du registre — l'ordre est celui du certificat de travail, puis la conformité. */
const HEAD = [
  "Matricule",
  "Nom et prénom",
  "CIN",
  "N° CNSS",
  "Catégorie",
  "Poste",
  "Entrée",
  "Sortie",
  "Motif",
  "Ancienneté",
  "Déclaration",
];

function seniorityLabel(days: number): string {
  const years = Math.floor(days / 365.25);
  const months = Math.floor((days - years * 365.25) / 30.44);
  if (years <= 0 && months <= 0) return `${days} j`;
  return years > 0 ? `${years} a ${months} m` : `${months} m`;
}

function body(r: StaffRegister): string[][] {
  return r.rows.map((x) => [
    x.matricule || "—",
    x.nom,
    x.cin || "—",
    x.cnss || "—",
    CATEGORY_LABEL[x.category] ?? x.category,
    x.position || "—",
    dateFr(x.hireDate),
    x.exitDate ? dateFr(x.exitDate) : "—",
    x.exitReason || "—",
    seniorityLabel(x.seniorityDays),
    DECLARATION_LABEL[x.declaration]
      + (x.declaration === "hors_delai" ? ` (+${x.declarationDays} j)` : ""),
  ]);
}

export interface RegisterPdfOptions {
  /**
   * Version « à présenter » (inspection du travail, expert-comptable, banque) : numérotation
   * continue des lignes, formule d'arrêté et bloc de signature/cachet de l'employeur.
   *
   * La numérotation continue et l'arrêté chiffré ne sont pas décoratifs : ils figent le nombre de
   * lignes au moment de la signature, ce qui rend visible tout ajout ou retrait postérieur.
   */
  official?: boolean;
  /** Ville du lieu d'arrêté (défaut : ville de la société). */
  city?: string;
  signatoryName?: string;
  signatoryRole?: string;
}

/** Construit le PDF du registre (sans le sauvegarder) — testable hors navigateur. */
export async function buildRegisterPdf(
  firm: Firm,
  r: StaffRegister,
  opts: RegisterPdfOptions = {},
): Promise<jsPDF> {
  const pal = firmPalette(firm);
  // Paysage : onze colonnes ne tiennent pas lisiblement en portrait, et réduire le corps sous
  // 8 pt rendrait le registre pénible à contrôler ligne à ligne.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setProperties({ title: `Registre du personnel — ${firm.name}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, "Registre des mouvements de main-d'œuvre", cur.y) + 8;

  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(
    asciiSpaces(`Période du ${dateFr(r.from)} au ${dateFr(r.to)} — arrêté au ${dateFr(r.asOf)}.`),
    M,
    cur.y,
  );
  cur.y += 6;

  // Indicateurs — l'écart effectif réel / effectif déclaré passe en premier : c'est l'objet même
  // du registre, et un lecteur pressé ne doit pas avoir à le chercher.
  const k = r.kpis;
  const kpiLine = [
    `Effectif présent : ${k.headcount}`,
    `Déclarés CNSS : ${k.declared}`,
    `Écart : ${k.gap}`,
    `Entrées : ${k.entries}`,
    `Sorties : ${k.exits}`,
    `Turnover : ${(k.turnover * 100).toFixed(1)} %`,
    `Ancienneté moyenne : ${k.avgSeniorityYears.toFixed(1)} an(s)`,
  ].join("     ·     ");
  doc.setFont(FONT, "bold").setFontSize(FS.note);
  doc.setTextColor(...(k.gap > 0 ? ALERT : pal.deep));
  doc.text(asciiSpaces(kpiLine), M, cur.y, { maxWidth: doc.internal.pageSize.getWidth() - 2 * M });
  cur.y += 5;
  doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
  doc.text(asciiSpaces(`Turnover = ${k.turnoverFormula}.`), M, cur.y);
  cur.y += 6;

  const styles = tableStyles(pal);
  // Version officielle : numérotation continue en première colonne.
  const head = opts.official ? ["N°", ...HEAD] : HEAD;
  const rowsBody = opts.official
    ? body(r).map((line, i) => [String(i + 1), ...line])
    : body(r);
  const declCol = head.length - 1;

  autoTable(doc, {
    startY: cur.y,
    head: [head],
    body: rowsBody,
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 7.6 },
    headStyles: { ...styles.headStyles, fontSize: 7.6 },
    columnStyles: opts.official ? { 0: { cellWidth: 9, halign: "right" } } : undefined,
    didParseCell: (d) => {
      // Un « hors délai » doit sauter aux yeux : c'est un constat, pas une ligne comme une autre.
      if (d.section === "body" && d.column.index === declCol) {
        const v = String(d.cell.raw ?? "");
        if (v.startsWith(DECLARATION_LABEL.hors_delai)) {
          d.cell.styles.textColor = [ALERT[0], ALERT[1], ALERT[2]];
          d.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  afterTable(cur, 6);

  // Arrêté du registre + signature — version « à présenter » uniquement.
  if (opts.official) {
    const pw = doc.internal.pageSize.getWidth();
    ensure(cur, 48);
    doc.setFont(FONT, "bold").setFontSize(FS.body).setTextColor(...pal.ink);
    doc.text(asciiSpaces(arreteLine(r.rows.length)), M, cur.y);
    cur.y += 8;

    const ville = (opts.city ?? firm.city ?? "……………………").trim() || "……………………";
    doc.setFont(FONT, "normal").setFontSize(FS.note);
    doc.text(asciiSpaces(`Fait à ${ville}, le ${dateFr(r.asOf)}.`), pw - M, cur.y, { align: "right" });
    cur.y += 8;

    const sigName = (opts.signatoryName ?? firm.signatory_name ?? "……………………").trim() || "……………………";
    const sigRole = (opts.signatoryRole ?? firm.signatory_role ?? "……………………").trim() || "……………………";
    const colW = 70;
    const x = pw - M - colW;
    doc.setFont(FONT, "bold").setFontSize(FS.note).setTextColor(...pal.ink);
    doc.text(asciiSpaces(sigName), x, cur.y);
    doc.setFont(FONT, "normal");
    doc.text(asciiSpaces(sigRole), x, cur.y + 4.5);
    doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
    doc.text("(Signature et cachet de l'employeur)", x, cur.y + 9);
    doc.setDrawColor(...pal.muted).setLineWidth(0.4).line(x, cur.y + 26, x + colW, cur.y + 26);
    cur.y += 32;
  }

  // Constats de non-conformité
  if (r.findings.length) {
    ensure(cur, 20);
    doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...pal.deep);
    doc.text(`Constats de non-conformité (${r.findings.length})`, M, cur.y);
    cur.y += 5;
    autoTable(doc, {
      startY: cur.y,
      head: [["Gravité", "Salarié", "Constat", "Détail", "Base légale", "Action", "Exposition (DH)"]],
      body: r.findings.map((f) => [
        f.severity === "critical" ? "CRITIQUE" : "Avertissement",
        f.nom,
        f.title,
        f.detail,
        f.legal,
        f.action,
        f.exposure ? `~ ${f.exposure.toLocaleString("en-US").replace(/,/g, " ")}` : "—",
      ]),
      theme: "grid",
      ...styles,
      styles: { ...styles.styles, fontSize: 7 },
      headStyles: { ...styles.headStyles, fontSize: 7 },
      columnStyles: { 6: { halign: "right" } },
    });
    afterTable(cur, 6);
  }

  // Réserves — jamais optionnelles.
  ensure(cur, 24);
  doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
  const pw = doc.internal.pageSize.getWidth();
  for (const note of [REGISTER_DISCLAIMER, r.sourceNote]) {
    const lines = doc.splitTextToSize(asciiSpaces(note), pw - 2 * M) as string[];
    ensure(cur, lines.length * lineHeight(FS.micro, 1.3));
    doc.text(lines, M, cur.y, { lineHeightFactor: 1.3 });
    cur.y += lines.length * lineHeight(FS.micro, 1.3) + 2;
  }

  paintFooters(doc, firm, pal);
  return doc;
}

export async function exportRegisterPdf(
  firm: Firm,
  r: StaffRegister,
  opts: RegisterPdfOptions = {},
): Promise<void> {
  const doc = await buildRegisterPdf(firm, r, opts);
  doc.save(registerFileName(r, opts.official ? "officiel.pdf" : "pdf"));
}

/** Export tableur — pour retraitement (rapprochement BDS, contrôle de l'expert-comptable). */
export function exportRegisterXlsx(firm: Firm, r: StaffRegister): void {
  const rows: (string | number)[][] = [];
  rows.push([`Registre des mouvements de main-d'œuvre — ${firm.name}`]);
  rows.push([`Période du ${dateFr(r.from)} au ${dateFr(r.to)} — arrêté au ${dateFr(r.asOf)}`]);
  rows.push([]);
  rows.push([
    "Effectif présent", r.kpis.headcount,
    "Déclarés CNSS", r.kpis.declared,
    "Écart", r.kpis.gap,
    "Entrées", r.kpis.entries,
    "Sorties", r.kpis.exits,
    "Turnover", Number((r.kpis.turnover * 100).toFixed(1)),
  ]);
  rows.push([]);
  rows.push(HEAD);
  for (const b of body(r)) rows.push(b);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registre");

  if (r.findings.length) {
    const f: (string | number)[][] = [["Gravité", "Salarié", "Constat", "Détail", "Base légale", "Action", "Exposition (DH)"]];
    for (const x of r.findings) {
      f.push([
        x.severity === "critical" ? "CRITIQUE" : "Avertissement",
        x.nom, x.title, x.detail, x.legal, x.action, x.exposure || "",
      ]);
    }
    const wsf = XLSX.utils.aoa_to_sheet(f);
    wsf["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 32 }, { wch: 60 }, { wch: 48 }, { wch: 56 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsf, "Constats");
  }

  const notes = XLSX.utils.aoa_to_sheet([[REGISTER_DISCLAIMER], [], [r.sourceNote]]);
  notes["!cols"] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, notes, "Réserves");

  XLSX.writeFile(wb, registerFileName(r, "xlsx"));
}
