/**
 * Fiche d'émargement — export PDF IDENTIQUE au modèle des 3 fiches remises
 * (MIYA Sidi Yahya, CHAKIR, Pépinière — quinzaines 20/09–03/10/2026, espèces).
 *
 * Mise en page relevée du modèle, dans l'ordre :
 *   bandeau vert + logo + titre à droite + N° · raison sociale + forme/capital +
 *   siège + ligne ICE/IF/TP/RC/CNSS · bandeau gris période/chantier/lieu/date ·
 *   notes signature-empreinte (art. 370, <=10 000 MAD loi 43-05 art. 18, loi 09-08,
 *   10 ans, DIRHAMS) · POUR ACQUIT encadré · tableau 10 colonnes (en-tête vert
 *   foncé, sections grises, cadres pointillés Signature/Empreinte), sous-totaux,
 *   TOTAL GÉNÉRAL · arrêté à la somme (chiffres + lettres) · Fait à … le … +
 *   4 signatures · note Cat./CIN · pied répété avec « Page N ».
 *
 * L'identité (raison sociale, CPU vs SARL, siège, identifiants, logo) vient de la
 * fiche société (`Firm`) — chaque entité obtient donc SA fiche (MBD SARL, AHMED
 * CPU, CHAKIR CPU) sans gabarit séparé. Ne CALCULE rien : met en page les
 * versements déjà saisis (montants = NET REMIS de la fiche source).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Employee, Firm } from "@/data/types";
import type { NonDeclarePayment } from "./non-declares";
import { amountToWordsFr, asciiSpaces, dateFr } from "./format";
import { capitalMad } from "./firm-legal";
import { firmLogoPath, loadLogo, type LoadedLogo } from "./pdf-kit";

export interface EmargementLine {
  n: number;
  emp: Employee;
  pay: NonDeclarePayment | null; // null = Néant (aucun jour pointé sur la période)
  section: string;
  cat: string;
  jours: number;
  montantDu: number;
  avance: number;
  net: number;
}

export interface EmargementData {
  firm: Firm;
  /** N° de fiche, ex. « 12/EM-2026-10-MIYA ». */
  numero: string;
  /** Libellé de période, ex. « du 20/09/2026 au 03/10/2026 ». */
  quinzaine: string;
  chantier: string;
  lieu: string;
  /** Date de paiement ISO « AAAA-MM-JJ ». */
  datePaiement: string;
  year: number;
  month: number;
  lines: EmargementLine[];
}

/** Suffixe de fiche par entité — comme les 3 fiches remises (MIYA / CHAKIR / sans). */
export function emargementSuffix(firm: Firm): string {
  if (firm.id === "firm_miya") return "MIYA";
  if (firm.name.toLowerCase().includes("chakir")) return "CHAKIR";
  return "";
}

/** N° de fiche par défaut : « 12/EM-2026-10-MIYA » (séquence 12, comme les remises). */
export function defaultEmargementNumero(firm: Firm, year: number, month: number): string {
  const suffix = emargementSuffix(firm);
  return `12/EM-${year}-${String(month).padStart(2, "0")}${suffix ? `-${suffix}` : ""}`;
}

export function emargementFileName(firm: Firm, year: number, month: number): string {
  const tag = emargementSuffix(firm) || firm.id;
  return `Fiche_Emargement_${tag}_${year}-${String(month).padStart(2, "0")}.pdf`;
}

/** Section d'un versement : champ dédié, sinon lue dans sa note, sinon « OUVRIERS ». */
export function paymentSection(pay: NonDeclarePayment): string {
  if ((pay.section ?? "").trim()) return pay.section!.trim();
  const m = (pay.note ?? "").match(/OUVRIERS [A-Z. ]+/);
  if (m) return m[0].trim();
  return "OUVRIERS";
}

/** Cat. d'un versement : code de paie journalier lu dans sa note (« Cat. H »). */
export function paymentCat(pay: NonDeclarePayment): string {
  const m = (pay.note ?? "").match(/Cat\. ([A-Za-z]+)/);
  return m ? m[1] : "";
}

/**
 * Construit les lignes de la fiche : versements du mois (ordre des matricules),
 * puis — comme le modèle — les salariés sans CNSS sans versement ce mois (« Néant »,
 * rangés dans la section courante, jamais dans une section « OUVRIERS » parasite).
 */
export function buildEmargementLines(
  employees: Employee[],
  payments: NonDeclarePayment[],
): EmargementLine[] {
  const paidIds = new Set(payments.map((p) => p.employee_id));
  const byId = new Map(employees.map((e) => [e.id, e]));
  const paid = payments
    .map((pay) => ({ pay, emp: byId.get(pay.employee_id) }))
    .filter((r): r is { pay: NonDeclarePayment; emp: Employee } => !!r.emp)
    .sort((a, b) => (a.emp.matricule ?? a.emp.id).localeCompare(b.emp.matricule ?? b.emp.id, "fr"));
  const neant = employees
    .filter((e) => !paidIds.has(e.id))
    .sort((a, b) => (a.matricule ?? a.id).localeCompare(b.matricule ?? b.id, "fr"));

  const lines: EmargementLine[] = [];
  let n = 0;
  let lastSection = "OUVRIERS";
  for (const { pay, emp } of paid) {
    n += 1;
    lastSection = paymentSection(pay);
    lines.push({
      n, emp, pay, section: lastSection, cat: paymentCat(pay),
      jours: pay.jours, montantDu: pay.brut_verse,
      avance: pay.avance_deduite ?? 0, net: pay.net_verse,
    });
  }
  for (const emp of neant) {
    n += 1;
    lines.push({
      n, emp, pay: null, section: lastSection, cat: "",
      jours: 0, montantDu: 0, avance: 0, net: 0,
    });
  }
  return lines;
}

/** Jours « 12,0 » / « 6,8 » comme le modèle (virgule, une décimale). */
export function fmtJours(j: number): string {
  return (Math.round(j * 10) / 10).toFixed(1).replace(".", ",");
}

/** Totaux purs de la fiche : total NET, salariés émargés (payés), sous-total par section. */
export function emargementTotals(lines: EmargementLine[]): {
  total: number;
  paidCount: number;
  subBySection: { section: string; sub: number }[];
} {
  const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
  const subBySection: { section: string; sub: number }[] = [];
  let total = 0;
  let paidCount = 0;
  for (const l of lines) {
    if (!subBySection.some((s) => s.section === l.section)) subBySection.push({ section: l.section, sub: 0 });
    if (l.pay) {
      paidCount += 1;
      total = r2(total + l.net);
      subBySection.find((s) => s.section === l.section)!.sub =
        r2(subBySection.find((s) => s.section === l.section)!.sub + l.net);
    }
  }
  return { total, paidCount, subBySection };
}

/* ------------------------------------------------------------------ rendu ------------------------------------------------------------------ */

const BANNER: [number, number, number] = [67, 160, 71];
const HEADER_BG: [number, number, number] = [27, 94, 32];
const SECTION_BG: [number, number, number] = [239, 239, 239];
const BAND_BG: [number, number, number] = [244, 244, 244];
const GRID = 200;
const INK = 30;
const GREY_TXT = 110;

const dash = "—";

/** Les 3 mentions légales du modèle (en-tête en régulier, pied en italique). */
const LEGAL_NOTES = [
  "Chaque salarié appose sa signature OU son EMPREINTE DIGITALE (pouce droit) en face de son nom, au moment même de la remise des espèces.",
  "Pièce justificative de paiement remise au moment du paiement (art. 370 loi 65-99). Ne constitue pas un bulletin de paie.",
  "Salaire <= 10 000 MAD : paiement en espèces admis (loi 43-05, art. 18). Document confidentiel (loi 09-08) — à conserver 10 ans. Montants en DIRHAMS.",
];

/**
 * Montant « 1 620,00 » comme le modèle (espace, virgule — SANS « DH », la colonne
 * le porte déjà). `fr-FR` + espaces ASCII : `fr-MA` rend des points dans certains
 * moteurs, et U+202F n'existe pas en WinAnsi (glyphe parasite).
 */
function fmtMoney(n: number): string {
  const s = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
  return asciiSpaces(s);
}
const money = (n: number): string => fmtMoney(n);
const moneyDh = (n: number): string => `${fmtMoney(n)} DH`;

/** Forme juridique en toutes lettres, comme le modèle (« SARL AU » → « Société à … »). */
function expandedForm(form: string): string {
  const key = form.trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "sarl au": "Société à Responsabilité Limitée à Associé Unique",
    "sarl": "Société à Responsabilité Limitée",
    "sa": "Société Anonyme",
    "sas": "Société par Actions Simplifiée",
    "snc": "Société en Nom Collectif",
  };
  return map[key] ?? form.trim();
}

/** Seconde ligne d'en-tête : SARL → forme + capital ; CPU → « Contribuable Personne Unique — signataire ». */
function descriptorLine(firm: Firm): string {
  const form = (firm.legal_form ?? "").trim();
  if (/personne physique/i.test(form)) {
    const who = (firm.signatory_name ?? "").trim();
    return who ? `Contribuable Personne Unique — ${who}` : "Contribuable Personne Unique";
  }
  const full = expandedForm(form);
  if (full && firm.share_capital && firm.share_capital > 0) {
    return `${full} au capital de ${capitalMad(firm.share_capital)}`;
  }
  return full;
}

/** Ligne d'identifiants aux libellés du modèle : ICE · IF · TP · RC · CNSS (renseignés uniquement). */
function identityLine(firm: Firm): string {
  const bits: string[] = [];
  if (firm.ice?.trim()) bits.push(`ICE ${firm.ice.trim()}`);
  if (firm.if_fiscal?.trim()) bits.push(`IF ${firm.if_fiscal.trim()}`);
  if (firm.patente?.trim()) bits.push(`TP ${firm.patente.trim()}`);
  if (firm.rc?.trim()) bits.push(`RC ${firm.rc.trim()}${firm.rc_city?.trim() ? ` (${firm.rc_city.trim()})` : ""}`);
  if (firm.cnss_affiliation?.trim()) bits.push(`CNSS ${firm.cnss_affiliation.trim()}`);
  return bits.join(" · ");
}

/** Construit le PDF de la fiche (sans le sauvegarder) — testable hors navigateur. */
export async function buildEmargementPdf(d: EmargementData): Promise<jsPDF> {
  const { firm } = d;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `Fiche d'émargement — ${firm.name} — ${d.numero}` });
  const W = 210;
  const M = 10;
  const CW = W - 2 * M;
  const logo: LoadedLogo | null = await loadLogo(firmLogoPath(firm));

  const labelValue = (x: number, yy: number, label: string, value: string, boldSize = 9): void => {
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(asciiSpaces(label), x, yy);
    const w = doc.getTextWidth(asciiSpaces(label));
    doc.setFont("helvetica", "bold").setFontSize(boldSize);
    doc.text(asciiSpaces(value), x + w + 1, yy);
  };

  // Bloc d'en-tête répété en haut de CHAQUE page, comme le modèle
  // (bannière, logo, titre, société, bandeau, mentions légales).
  // Hauteur constante pour une fiche donnée (réserve `headerH` sur les pages suivantes).
  const drawHeader = (_pageNo: number): number => {
    let yy = 0;
    doc.setFillColor(...BANNER);
    doc.rect(0, 0, W, 11, "F");
    if (logo) {
      try {
        doc.addImage(logo.data, logo.fmt, M, 14, 22, 22);
      } catch {
        /* logo illisible : on continue sans */
      }
    }
    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text(asciiSpaces("FICHE D'ÉMARGEMENT"), W - M, 21, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(asciiSpaces(`N° ${d.numero}`), W - M, 26, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(GREY_TXT);
    doc.text(asciiSpaces("Paiement en espèces — quinzaine"), W - M, 30.5, { align: "right" });
    doc.setTextColor(INK);

    yy = 40;
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(asciiSpaces(firm.name.toUpperCase()), M, yy);
    yy += 4.5;
    const desc = descriptorLine(firm);
    if (desc) {
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.text(asciiSpaces(desc), M, yy);
      yy += 4.5;
    }
    if (firm.address?.trim()) {
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.text(asciiSpaces(`Siège : ${firm.address.trim()}`), M, yy);
      yy += 4.5;
    }
    const ids = identityLine(firm);
    if (ids) {
      doc.setFont("helvetica", "normal").setFontSize(8.5);
      doc.text(asciiSpaces(ids), M, yy);
      yy += 4.5;
    }
    yy += 1;

    doc.setFillColor(...BAND_BG);
    doc.rect(M, yy, CW, 13.5, "F");
    labelValue(M + 3, yy + 5, "Période (quinzaine) : ", d.quinzaine);
    if (d.chantier) labelValue(M + 105, yy + 5, "Chantier : ", d.chantier);
    labelValue(M + 3, yy + 10.5, "Lieu de paiement : ", d.lieu || "…");
    labelValue(M + 105, yy + 10.5, "Date de paiement : ", dateFr(d.datePaiement));
    yy += 13.5 + 2;
    // Mentions légales sous le bandeau, comme le modèle.
    doc.setFont("helvetica", "normal").setFontSize(8);
    for (const line of LEGAL_NOTES) {
      const wrapped = doc.splitTextToSize(asciiSpaces(line), CW);
      doc.text(wrapped, M, yy);
      yy += wrapped.length * 3.8 + 0.8;
    }
    return yy + 1;
  };

  // Pied répété sur CHAQUE page, comme le modèle (filet + 3 lignes + « Page N »).
  const drawFooter = (pageNo: number): void => {
    doc.setDrawColor(GRID);
    doc.setLineWidth(0.2);
    doc.line(M, 282, W - M, 282);
    doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(80);
    doc.text(asciiSpaces(LEGAL_NOTES[0]), W / 2, 285.5, { align: "center" });
    doc.text(asciiSpaces(LEGAL_NOTES[1]), W / 2, 288.5, { align: "center" });
    doc.text(asciiSpaces(LEGAL_NOTES[2]), W / 2, 291.5, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(INK);
    doc.text(`Page ${pageNo}`, W - M, 291.5, { align: "right" });
  };

  // Ligne d'accent verte au bord gauche du tableau, comme le modèle.
  const drawAccent = (top: number, bottom: number): void => {
    doc.setDrawColor(...BANNER);
    doc.setLineWidth(0.9);
    doc.line(M, top, M, bottom);
  };

  let y = drawHeader(1);
  const headerH = y;

  // POUR ACQUIT encadré — page 1 uniquement, comme le modèle.
  const pourAcquit =
    `POUR ACQUIT. Les salariés dont les noms figurent ci-dessous reconnaissent avoir reçu en espèces de la société ${asciiSpaces(firm.name.toUpperCase())} la somme portée en face de leur nom dans la colonne « NET REMIS », au titre de la quinzaine indiquée ci-dessus, et apposent à cet effet leur signature ou, à défaut, l'empreinte de leur pouce droit dans la case prévue.`;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const paLines = doc.splitTextToSize(pourAcquit, CW - 6);
  const paH = paLines.length * 4.4 + 6;
  doc.setDrawColor(GRID);
  doc.setLineWidth(0.2);
  doc.rect(M, y, CW, paH);
  doc.text(paLines, M + 3, y + 4.4);
  const tableTop = y + paH + 4;

  // Tableau — 10 colonnes comme le modèle (en-tête vert foncé, texte blanc).
  type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const head = [
    "N°", "Nom & Prénom du salarié", "CIN", "Cat.", "Jrs trav.",
    "Montant dû (DH)", "Avances (DH)", "NET REMIS (DH)", "Signature", "Empreinte (pouce droit)",
  ];
  const body: Cell[][] = [];
  const { total, paidCount, subBySection } = emargementTotals(d.lines);
  for (const { section: sec, sub } of subBySection) {
    body.push([{ content: sec, colSpan: 10, styles: { fontStyle: "bold", halign: "left", fillColor: [...SECTION_BG], textColor: INK } }]);
    for (const l of d.lines.filter((x) => x.section === sec)) {
      const name = `${l.emp.first_name} ${l.emp.last_name}`;
      if (l.pay) {
        body.push([
          String(l.n),
          { content: asciiSpaces(name), styles: { fontStyle: "bold" } },
          asciiSpaces(l.emp.cin ?? ""), l.cat,
          fmtJours(l.jours), money(l.montantDu), l.avance ? money(l.avance) : dash,
          { content: money(l.net), styles: { fontStyle: "bold" } }, "", "",
        ]);
      } else {
        body.push([
          String(l.n), asciiSpaces(name), asciiSpaces(l.emp.cin ?? ""), l.cat,
          fmtJours(0), dash, dash, dash,
          { content: "Néant — aucun jour pointé sur la quinzaine", colSpan: 2, styles: {} },
        ]);
      }
    }
    body.push([
      { content: `Sous-total ${sec}`, colSpan: 7, styles: { fontStyle: "bold", halign: "right" } },
      { content: money(sub), styles: { fontStyle: "bold", halign: "right" } },
      "", "",
    ]);
  }
  // « TOTAL GÉNÉRAL — 33 salariés émargés », comme le modèle.
  const totalLabel = paidCount > 1
    ? `TOTAL GÉNÉRAL — ${paidCount} salariés émargés`
    : "TOTAL GÉNÉRAL — 1 salarié émargé";
  body.push([
    { content: totalLabel, colSpan: 7, styles: { fontStyle: "bold", halign: "right" } },
    { content: money(total), styles: { fontStyle: "bold", halign: "right" } },
    "", "",
  ]);

  autoTable(doc, {
    startY: tableTop,
    head: [head],
    body: body as string[][],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, textColor: INK, lineColor: GRID, lineWidth: 0.15, cellPadding: { top: 4, bottom: 4, left: 1.5, right: 1.5 } },
    headStyles: { fontStyle: "bold", fontSize: 8.5, halign: "center", valign: "middle", fillColor: [...HEADER_BG], textColor: 255 },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 44 },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "center", cellWidth: 9 },
      4: { halign: "right", cellWidth: 12 },
      5: { halign: "right", cellWidth: 20 },
      6: { halign: "right", cellWidth: 18 },
      7: { halign: "right", cellWidth: 22 },
      8: { cellWidth: 21 },
      9: { cellWidth: 22 },
    },
    margin: { left: M, right: M, top: headerH, bottom: 20 },
    didDrawPage: (hook) => {
      const n = hook.pageNumber;
      if (n > 1) drawHeader(n);
      drawFooter(n);
      drawAccent(n === 1 ? tableTop : headerH, 280);
    },
    // Cadres pointillés Signature / Empreinte à remplir à la main, comme le modèle.
    didDrawCell: (hook) => {
      if (hook.section !== "body") return;
      if (hook.column.index !== 8 && hook.column.index !== 9) return;
      const raw = hook.row.raw as unknown[];
      if (raw.some((c) => typeof c === "object" && c !== null && /Sous-total|TOTAL/.test((c as { content?: string }).content ?? ""))) return;
      if (String(hook.cell.raw ?? "").trim() !== "") return;
      const { x, y: cy, width, height } = hook.cell;
      doc.setDrawColor(160);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(x + 1.5, cy + 1.5, width - 3, height - 3, 1.5, 1.5);
      doc.setLineDashPattern([], 0);
    },
  });

  let yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const need = (h: number): void => {
    if (yy + h > 280) {
      doc.addPage();
      const n = doc.getNumberOfPages();
      drawHeader(n);
      drawFooter(n);
      yy = headerH;
    }
  };

  const words = amountToWordsFr(total);
  // Montant de l'arrêté AVEC « DH », comme le modèle (« 21 842,00 DH (…) »).
  const arrete = `Arrêtée la présente fiche d'émargement à la somme de ${moneyDh(total)} (${words}), pour ${paidCount > 1 ? `${paidCount} salariés émargés` : "1 salarié émargé"}, au titre de la quinzaine ${d.quinzaine}.`;
  const para = (text: string, y0: number, size: number, italic = false): number => {
    doc.setFont("helvetica", italic ? "italic" : "normal").setFontSize(size);
    const lines = doc.splitTextToSize(asciiSpaces(text), CW);
    doc.text(lines, M, y0);
    return y0 + lines.length * size * 0.45 + 1;
  };
  need(24);
  yy = para(arrete, yy, 10) + 1;
  yy = para(`Fait à ${d.lieu || "…"}, le ${dateFr(d.datePaiement)}.`, yy, 10) + 2;

  // Quatre blocs de signature, comme le modèle.
  need(30);
  const colW = CW / 4;
  const sigs = ["L'agent de paie", "Le chef de chantier", "Le témoin", "Pour l'employeur"];
  doc.setFont("helvetica", "bold").setFontSize(9);
  sigs.forEach((t, i) => doc.text(asciiSpaces(t), M + i * colW + 1, yy));
  yy += 8;
  doc.setFont("helvetica", "normal").setFontSize(9);
  sigs.forEach((_, i) => doc.text("...............", M + i * colW + 1, yy));
  yy += 5;
  doc.setFontSize(8);
  sigs.forEach((_, i) => doc.text(asciiSpaces("Nom, date et signature"), M + i * colW + 1, yy));
  yy += 7;

  need(14);
  yy = para(
    "Cat. = code de paie journalier porté par la fiche de pointage (F / H / Caporal). Colonne CIN à renseigner au moment du paiement, sur présentation de la carte d'identité nationale. Les cases en pointillé sont à compléter à la main.",
    yy, 7.5, true,
  );

  return doc;
}

/** Télécharge la fiche d'émargement PDF — nom normalisé ASCII. */
export async function downloadEmargementPdf(d: EmargementData): Promise<void> {
  (await buildEmargementPdf(d)).save(emargementFileName(d.firm, d.year, d.month));
}
