/**
 * Export PDF du BORDEREAU DE DÉCLARATION CNSS (récapitulatif de contrôle interne).
 *
 * Rendu sur le socle typographique commun `pdf-kit` : même en-tête société, même pied paginé et
 * même palette que les bulletins, les écritures et le registre — un document homogène et propre,
 * pas une impression brute de la page web (l'ancien export appelait `window.print()`).
 *
 * Ce module ne CALCULE rien : il met en page les montants déjà arrêtés par la page Déclarations
 * (`totals`, `rows`), qui proviennent eux-mêmes des bulletins (figés si la période est validée).
 * Le dépôt légal reste l'affaire de DAMANCOM ; ce PDF est une pièce de contrôle/classement.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Firm } from "@/data/types";
import { asciiSpaces, dateFr, mad, num, pct } from "./format";
import { periodLabel } from "./format";
import type { DeclarationPenalty } from "./declaration-penalty";
import {
  ALERT,
  FONT,
  FS,
  M,
  afterTable,
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
import { DOC_TITLES } from "./doc-titles";

/** Une ligne du bordereau (un salarié). Montants déjà arrêtés — aucun recalcul ici. */
export interface DeclarationRow {
  name: string;
  cnss?: string;
  sbi: number;
  plafonne: number;
  cnssSal: number;
  cnssPat: number;
  amo: number;
  af: number;
}

/** Totaux de la période, tels qu'affichés à l'écran (source unique : les bulletins). */
export interface DeclarationTotals {
  masse: number;
  massePlaf: number;
  cnssSal: number;
  cnssPatr: number;
  amo: number;
  af: number;
  ir: number;
}

export interface DeclarationData {
  year: number;
  month: number;
  /** Plafond CNSS de la période (params.ts) — pour l'en-tête de colonne « Plafonné ». */
  ceiling: number;
  /** Taux de la période, formatés dans les en-têtes de colonnes (comme à l'écran). */
  rates: { cnssEmployee: number; cnssEmployer: number; amoEmployee: number };
  rows: DeclarationRow[];
  totals: DeclarationTotals;
  /** Période validée (instantané figé) ou brouillon (calcul en direct). */
  validated: boolean;
  /** Renseigné si l'instantané validé ne couvre pas tout l'effectif (écart avec la compta). */
  incomplete?: { validatedCount: number; realCount: number };
  /** Date d'établissement du document (ISO) — pour le bloc « Fait à … le … ». */
  issuedOn?: string;
  /** Déclaration complémentaire / tardive : pénalités CNSS calculées (majoration + astreinte). */
  penalty?: {
    cotisations: number;
    employees: number;
    paymentDate: string;
    result: DeclarationPenalty;
    sourceNote: string;
  };
}

/** Nom de fichier normalisé (ASCII) : Bordereau_CNSS_<firm>_<aaaa-mm>.pdf */
export function declarationFileName(firmId: string, year: number, month: number): string {
  return `Bordereau_CNSS_${firmId}_${year}-${String(month).padStart(2, "0")}.pdf`;
}

const HEAD = ["Salarié", "N° CNSS", "SBI", "Plafonné", "CNSS sal.", "CNSS pat.", "AMO sal.", "AF"];

/** Construit le PDF du bordereau (sans le sauvegarder) — testable hors navigateur. */
export async function buildDeclarationPdf(firm: Firm, d: DeclarationData): Promise<jsPDF> {
  const pal = firmPalette(firm);
  // Paysage : huit colonnes avec leurs taux ne tiennent pas lisiblement en portrait (l'en-tête
  // déborderait). Le socle pdf-kit adapte en-tête, pied et cadre à l'orientation réelle de la page.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setProperties({ title: `Bordereau CNSS — ${firm.name} — ${periodLabel(d.year, d.month)}` });
  const logo = await loadLogo(firmLogoPath(firm));
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, DOC_TITLES.bordereauCnss, cur.y) + 8;

  // Ligne de contexte : période, effectif, état (validé / brouillon).
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(
    asciiSpaces(
      `Période ${periodLabel(d.year, d.month)}  —  ${d.rows.length} salarié(s)  —  ${
        d.validated ? "période validée" : "brouillon (non validé)"
      }`,
    ),
    M,
    cur.y,
  );
  cur.y += 6;

  // Écart avec la comptabilité (validation incomplète) — signalé en rouge, jamais masqué.
  if (d.incomplete) {
    const pw = doc.internal.pageSize.getWidth();
    doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...ALERT);
    const warn =
      `Attention : période validée avec ${d.incomplete.validatedCount} bulletin(s) pour ` +
      `${d.incomplete.realCount} salarié(s) employé(s) — le total ci-dessous suit l'effectif réel ; ` +
      `l'écriture comptable reste figée sur l'instantané validé.`;
    const lines = doc.splitTextToSize(asciiSpaces(warn), pw - 2 * M) as string[];
    for (const line of lines) {
      ensure(cur, lineHeight(FS.micro, 1.3));
      doc.text(line, M, cur.y);
      cur.y += lineHeight(FS.micro, 1.3);
    }
    cur.y += 3;
  }

  // Bordereau nominatif.
  const styles = tableStyles(pal);
  const head = [
    HEAD[0],
    HEAD[1],
    HEAD[2],
    `${HEAD[3]} (${num(d.ceiling)})`,
    `${HEAD[4]} ${pct(d.rates.cnssEmployee)}`,
    `${HEAD[5]} ${pct(d.rates.cnssEmployer)}`,
    `${HEAD[6]} ${pct(d.rates.amoEmployee)}`,
    HEAD[7],
  ];
  const body = d.rows.map((r) => [
    r.name,
    r.cnss || "non immatriculé",
    num(r.sbi),
    num(r.plafonne),
    num(r.cnssSal),
    num(r.cnssPat),
    num(r.amo),
    num(r.af),
  ]);
  const totalRow = [
    `Total (${d.rows.length})`,
    "",
    num(d.totals.masse),
    num(d.totals.massePlaf),
    num(d.totals.cnssSal),
    num(d.totals.cnssPatr),
    num(d.totals.amo),
    num(d.totals.af),
  ];
  const totalIdx = body.length;

  autoTable(doc, {
    startY: cur.y,
    head: [head],
    body: [...body, totalRow],
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 7.6 },
    headStyles: { ...styles.headStyles, fontSize: 7.6, halign: "center" },
    alternateRowStyles: { fillColor: [...pal.tint] },
    // Nom et n° CNSS à largeur fixe ; les six colonnes de montants se répartissent le reste
    // (auto) — fixer chacune ferait déborder la largeur utile de quelques mm.
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 35 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (c) => {
      if (c.section !== "body") return;
      // Ligne de total : gras sur fond attenué de la société.
      if (c.row.index === totalIdx) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
        return;
      }
      // Salarié non immatriculé : la case CNSS ressort en rouge — un manquant ne doit pas passer.
      if (c.column.index === 1 && !d.rows[c.row.index]?.cnss) {
        c.cell.styles.textColor = [ALERT[0], ALERT[1], ALERT[2]];
        c.cell.styles.fontStyle = "bold";
      }
    },
  });
  afterTable(cur, 7);

  // Récapitulatif des montants à déclarer — deux colonnes libellé / montant, lecture immédiate.
  ensure(cur, 10);
  doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...pal.deep);
  doc.text("Récapitulatif", M, cur.y);
  cur.y += 2;

  const cnssTotal = d.totals.cnssSal + d.totals.cnssPatr;
  const recap: [string, string, boolean?][] = [
    ["Masse salariale déclarée", mad(d.totals.masse)],
    ["Masse plafonnée CNSS", mad(d.totals.massePlaf)],
    ["CNSS salariale", mad(d.totals.cnssSal)],
    ["CNSS patronale", mad(d.totals.cnssPatr)],
    ["Total CNSS (salariale + patronale)", mad(cnssTotal), true],
    ["AMO salariale", mad(d.totals.amo)],
    ["Allocations familiales", mad(d.totals.af)],
    ["IR (état 9421)", mad(d.totals.ir)],
    ["Effectif déclaré", String(d.rows.length)],
  ];
  autoTable(doc, {
    startY: cur.y + 2,
    body: recap.map(([k, v]) => [k, v]),
    theme: "plain",
    // « wrap » : la table prend la largeur de ses colonnes (deux) au lieu de s'étirer sur toute
    // la page — sinon jspdf-autotable dilate les colonnes et signale un débordement.
    tableWidth: "wrap",
    styles: { ...styles.styles, fontSize: 8.4, cellPadding: 1.3 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "right", cellWidth: 46, fontStyle: "bold" } },
    margin: { left: M, right: M },
    didParseCell: (c) => {
      if (recap[c.row.index]?.[2]) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
      }
    },
  });
  afterTable(cur, 8);

  // Déclaration complémentaire / tardive — pénalités CNSS (majoration de retard + astreinte).
  if (d.penalty) {
    const { result: pen, cotisations, employees, paymentDate, sourceNote } = d.penalty;
    ensure(cur, 20);
    doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...ALERT);
    doc.text(asciiSpaces("Déclaration complémentaire — pénalités de retard CNSS"), M, cur.y);
    cur.y += 2;
    const tauxTxt = `${pct(pen.firstMonthRate)} (1er mois) + ${pct(pen.extraMonthRate)}/mois suppl.`;
    const penRecap: [string, string, boolean?][] = [
      ["Cotisations à régulariser (assiette)", mad(cotisations)],
      ["Échéance DAMANCOM", dateFr(pen.dueDate)],
      ["Date de paiement du complément", dateFr(paymentDate)],
      ["Retard", `${pen.monthsLate} mois`],
      ["Taux de majoration appliqué", tauxTxt],
      ["Majoration de retard (paiement)", mad(pen.majorationPaiement)],
      [`Astreinte de déclaration (${employees} salarié(s), > 7 mois)`, mad(pen.astreinte)],
      ["Total des pénalités", mad(pen.total), true],
    ];
    autoTable(doc, {
      startY: cur.y + 2,
      body: penRecap.map(([k, v]) => [k, v]),
      theme: "plain",
      tableWidth: "wrap",
      styles: { ...styles.styles, fontSize: 8.4, cellPadding: 1.3 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right", cellWidth: 46, fontStyle: "bold" } },
      margin: { left: M, right: M },
      didParseCell: (c) => {
        if (penRecap[c.row.index]?.[2]) {
          c.cell.styles.fontStyle = "bold";
          c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
        }
      },
    });
    afterTable(cur, 4);
    // Réserve de fiabilité — sur fond sobre, jamais masquée.
    const pw0 = doc.internal.pageSize.getWidth();
    doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
    for (const line of doc.splitTextToSize(asciiSpaces(sourceNote), pw0 - 2 * M) as string[]) {
      ensure(cur, lineHeight(FS.micro, 1.3));
      doc.text(line, M, cur.y);
      cur.y += lineHeight(FS.micro, 1.3);
    }
    cur.y += 4;
  }

  // Établissement + signature — pièce de contrôle interne, le dépôt DAMANCOM faisant foi.
  ensure(cur, 30);
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  if (d.issuedOn) {
    doc.text(asciiSpaces(`Établi le ${dateFr(d.issuedOn)}.`), M, cur.y);
  }
  const sigX = pw - M - 70;
  doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
  doc.text("Signature et cachet", sigX, cur.y);
  doc.setDrawColor(...pal.muted).setLineWidth(0.3).line(sigX, cur.y + 16, sigX + 70, cur.y + 16);
  cur.y += 22;

  // Réserve — le bordereau imprimé ne remplace pas le télé-dépôt.
  doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...pal.muted);
  const note =
    "Document récapitulatif de contrôle interne. La déclaration légale des salaires s'effectue " +
    "par télé-dépôt sur le portail DAMANCOM de la CNSS, qui seul fait foi.";
  const nlines = doc.splitTextToSize(asciiSpaces(note), pw - 2 * M) as string[];
  for (const line of nlines) {
    ensure(cur, lineHeight(FS.micro, 1.3));
    doc.text(line, M, cur.y);
    cur.y += lineHeight(FS.micro, 1.3);
  }

  paintFooters(doc, firm, pal);
  return doc;
}

/** Génère et télécharge le PDF du bordereau. */
export async function exportDeclarationPdf(firm: Firm, d: DeclarationData): Promise<void> {
  const doc = await buildDeclarationPdf(firm, d);
  doc.save(declarationFileName(firm.id, d.year, d.month));
}
