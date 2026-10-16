/**
 * Fiche d'émargement — export PDF IDENTIQUE au modèle des 3 fiches remises
 * (MIYA Sidi Yahya, CHAKIR, Pépinière — quinzaines 20/09–03/10/2026, espèces).
 *
 * Mise en page relevée du modèle, dans l'ordre :
 *   FICHE D'ÉMARGEMENT + N° · « Paiement en espèces — quinzaine » ·
 *   raison sociale + forme/capital + siège + ligne ICE/IF/TP/RC/CNSS ·
 *   période/chantier + lieu/date de paiement · note signature-empreinte ·
 *   pièce justificative (art. 370, ≤10 000 MAD loi 43-05 art. 18, loi 09-08, 10 ans, DH) ·
 *   POUR ACQUIT · tableau 10 colonnes avec sections, sous-totaux, TOTAL GÉNÉRAL ·
 *   arrêté à la somme (chiffres + lettres) · Fait à … le … + 4 signatures ·
 *   note Cat./CIN · pagination « Page N ».
 *
 * L'identité (raison sociale, CPU vs SARL, siège, identifiants) vient de la FICHE
 * SALARIÉ… non : de la FICHE SOCIÉTÉ (`Firm`) — chaque entité obtient donc SA fiche
 * (MBD SARL, AHMED CPU, CHAKIR CPU) sans gabarit séparé. Ne CALCULE rien : met en
 * page les versements déjà saisis (montants = NET REMIS de la fiche source).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Employee, Firm } from "@/data/types";
import type { NonDeclarePayment } from "./non-declares";
import { amountToWordsFr, asciiSpaces, dateFr } from "./format";
import { capitalMad } from "./firm-legal";

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

const dash = "—";

/**
 * Montant « 1 620,00 » comme le modèle (espace, virgule — SANS « DH », la colonne
 * le porte déjà). `fr-FR` + espaces ASCII : `fr-MA` rend des points dans certains
 * moteurs, et U+202F n'existe pas en WinAnsi (glyphe parasite).
 */
function fmtMoney(n: number): string {
  const s = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
  // asciiSpaces() normalise déjà U+00A0/U+202F/U+2009 vers l'espace ASCII (WinAnsi).
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
export function buildEmargementPdf(d: EmargementData): jsPDF {
  const { firm } = d;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `Fiche d'émargement — ${firm.name} — ${d.numero}` });
  const W = 210;
  const M = 10;
  const CW = W - 2 * M;
  let y = 14;

  const center = (text: string, yy: number, size: number, bold = false): number => {
    doc.setFont("times", bold ? "bold" : "normal").setFontSize(size);
    doc.text(asciiSpaces(text), W / 2, yy, { align: "center" });
    return yy + size * 0.45;
  };
  const para = (text: string, yy: number, size: number, italic = false): number => {
    doc.setFont("times", italic ? "italic" : "normal").setFontSize(size);
    const lines = doc.splitTextToSize(asciiSpaces(text), CW);
    doc.text(lines, M, yy);
    return yy + lines.length * size * 0.45 + 1;
  };

  y = center("FICHE D'ÉMARGEMENT", y, 15, true);
  doc.setFont("times", "normal").setFontSize(10);
  doc.text(asciiSpaces(`N° ${d.numero}`), W - M, y - 2, { align: "right" });
  y = center("Paiement en espèces — quinzaine", y + 2, 11) + 1;

  // Bloc d'en-tête répété en haut de CHAQUE page, comme le modèle
  // (titre → mentions → « Page N »). Hauteur constante pour une fiche donnée.
  const drawHeaderBlock = (pageNo: number): number => {
    let yy = 14;
    yy = center("FICHE D'ÉMARGEMENT", yy, 15, true);
    doc.setFont("times", "normal").setFontSize(10);
    doc.text(asciiSpaces(`N° ${d.numero}`), W - M, yy - 2, { align: "right" });
    yy = center("Paiement en espèces — quinzaine", yy + 2, 11) + 1;

    yy = center(asciiSpaces(firm.name.toUpperCase()), yy + 1, 12, true);
    const desc = descriptorLine(firm);
    if (desc) yy = center(desc, yy, 10);
    if (firm.address?.trim()) yy = center(`Siège : ${firm.address.trim()}`, yy, 10);
    const ids = identityLine(firm);
    if (ids) yy = center(ids, yy, 9);
    yy += 2;

    doc.setFont("times", "normal").setFontSize(10);
    doc.text(asciiSpaces(`Période (quinzaine) : ${d.quinzaine}`), M, yy);
    if (d.chantier) doc.text(asciiSpaces(`Chantier : ${d.chantier}`), M + 105, yy);
    yy += 5;
    doc.text(asciiSpaces(`Lieu de paiement : ${d.lieu || "…"}`), M, yy);
    doc.text(asciiSpaces(`Date de paiement : ${dateFr(d.datePaiement)}`), M + 105, yy);
    yy += 6;

    yy = para(
      "Chaque salarié appose sa signature OU son EMPREINTE DIGITALE (pouce droit) en face de son nom, au moment même de la remise des espèces.",
      yy, 8.5, true,
    );
    yy = para(
      "Pièce justificative de paiement remise au moment du paiement (art. 370 loi 65-99). Ne constitue pas un bulletin de paie.",
      yy, 8.5,
    );
    // « ≤ » n'existe pas en WinAnsi (glyphe parasite) : équivalent imprimable « <= ».
    yy = para(
      "Salaire <= 10 000 MAD : paiement en espèces admis (loi 43-05, art. 18). Document confidentiel (loi 09-08) — à conserver 10 ans. Montants en DIRHAMS.",
      yy, 8.5,
    );
    yy = center(`Page ${pageNo}`, yy + 1, 9);
    return yy;
  };

  y = drawHeaderBlock(1);
  const headerH = y; // réserve haute identique sur les pages suivantes
  y = para(
    `POUR ACQUIT. Les salariés dont les noms figurent ci-dessous reconnaissent avoir reçu en espèces de la société ${asciiSpaces(firm.name.toUpperCase())} la somme portée en face de leur nom dans la colonne « NET REMIS », au titre de la quinzaine indiquée ci-dessus, et apposent à cet effet leur signature ou, à défaut, l'empreinte de leur pouce droit dans la case prévue.`,
    y + 1, 9,
  );

  // Tableau — 10 colonnes comme le modèle.
  type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const head = [
    "N°", "Nom & Prénom du salarié", "CIN", "Cat.", "Jrs trav.",
    "Montant dû (DH)", "Avances (DH)", "NET REMIS (DH)", "Signature", "Empreinte (pouce droit)",
  ];
  const body: Cell[][] = [];
  const { total, paidCount, subBySection } = emargementTotals(d.lines);
  for (const { section: sec, sub } of subBySection) {
    body.push([{ content: sec, colSpan: 10, styles: { fontStyle: "bold", halign: "left" } }]);
    for (const l of d.lines.filter((x) => x.section === sec)) {
      const name = `${l.emp.first_name} ${l.emp.last_name}`;
      if (l.pay) {
        body.push([
          String(l.n), asciiSpaces(name), asciiSpaces(l.emp.cin ?? ""), l.cat,
          fmtJours(l.jours), money(l.montantDu), l.avance ? money(l.avance) : dash, money(l.net), "", "",
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
    startY: y,
    head: [head],
    body: body as string[][],
    theme: "grid",
    styles: { font: "times", fontSize: 8, textColor: 20, lineColor: 150, lineWidth: 0.1, cellPadding: 1.2 },
    headStyles: { fontStyle: "bold", halign: "center", valign: "middle", fillColor: [235, 235, 235], textColor: 20 },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 46 },
      2: { halign: "center", cellWidth: 16 },
      3: { halign: "center", cellWidth: 10 },
      4: { halign: "right", cellWidth: 13 },
      5: { halign: "right", cellWidth: 20 },
      6: { halign: "right", cellWidth: 18 },
      7: { halign: "right", cellWidth: 22 },
      8: { cellWidth: 19 },
      9: { cellWidth: 18 },
    },
    margin: { left: M, right: M, top: headerH },
    // En-tête répété en haut des pages suivantes, comme le modèle.
    didDrawPage: (hook) => {
      if (hook.pageNumber > 1) drawHeaderBlock(hook.pageNumber);
    },
  });

  let yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const need = (h: number): void => {
    if (yy + h > 287) { doc.addPage(); yy = 14; }
  };

  const words = amountToWordsFr(total);
  // Montant de l'arrêté AVEC « DH », comme le modèle (« 21 842,00 DH (…) »).
  const arrete = `Arrêtée la présente fiche d'émargement à la somme de ${moneyDh(total)} (${words}), pour ${paidCount > 1 ? `${paidCount} salariés émargés` : "1 salarié émargé"}, au titre de la quinzaine ${d.quinzaine}.`;
  need(24);
  yy = para(arrete, yy, 10) + 1;
  yy = para(`Fait à ${d.lieu || "…"}, le ${dateFr(d.datePaiement)}.`, yy, 10) + 2;

  // Quatre blocs de signature, comme le modèle.
  need(30);
  const colW = CW / 4;
  const sigs = ["L'agent de paie", "Le chef de chantier", "Le témoin", "Pour l'employeur"];
  doc.setFont("times", "bold").setFontSize(9);
  sigs.forEach((t, i) => doc.text(asciiSpaces(t), M + i * colW + 1, yy));
  yy += 8;
  doc.setFont("times", "normal").setFontSize(9);
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
export function downloadEmargementPdf(d: EmargementData): void {
  buildEmargementPdf(d).save(emargementFileName(d.firm, d.year, d.month));
}
