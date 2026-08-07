/**
 * Socle typographique commun à TOUS les documents PDF de l'application.
 *
 * Un document exporté engage la société : il part au salarié, à la CNSS, à la banque, à
 * l'expert-comptable. Deux documents de la même société doivent donc partager exactement la
 * même grille, le même en-tête, le même pied et la même pagination — c'est le rôle de ce
 * module, source unique de la mise en page (skill `pdf-mise-en-page-pro`).
 *
 * Ce module ne calcule RIEN du métier : ni montant, ni taux, ni libellé légal. Il ne fait que
 * placer sur la page ce que les moteurs (payslip.ts, rh-legal.ts, accounting-export.ts…) lui
 * donnent. Les couleurs proviennent TOUJOURS de `brand-color.ts` (spectre dérivé de la société) :
 * aucune couleur en dur ici, sinon la mise en page d'une société future serait fausse.
 */
import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import type { Firm } from "@/data/types";
import { asciiSpaces } from "./format";
import { firmDescriptor, firmLegalPairs } from "./firm-legal";
import { paletteForFirm, type PayslipPalette, type RGB } from "./brand-color";

/* ------------------------------------------------------------------ grille A4 ------------------------------------------------------------------ */

/** Largeur A4 (mm). */
export const W = 210;
/** Hauteur A4 (mm). */
export const H = 297;
/** Marge latérale (mm) — sous 15 mm, risque de rognage à l'impression. */
export const M = 22;
/** Largeur de composition (mm). */
export const CW = W - 2 * M;
/** Réserve de l'en-tête complet, page 1 (mm). */
export const HEAD = 50;
/** Réserve de l'en-tête courant, pages suivantes (mm). */
export const HEAD_RUN = 22;
/** Réserve du pied (mm) — aucun contenu ne descend sous `H - FOOT`. */
export const FOOT = 24;

/**
 * Police des documents : **empattements** (Times), et non une linéale.
 *
 * C'est le choix du gabarit de référence des documents officiels Belkora : sur un acte destiné
 * à un tiers (salarié, CNSS, banque, tribunal), l'empattement porte la convention du document
 * juridique. La linéale est réservée aux tableaux denses (bulletin, écritures) où la lisibilité
 * en petit corps prime. Times fait partie des polices standard jsPDF, donc aucun embarquement de
 * fonte : le PDF reste léger et s'ouvre partout.
 */
export const FONT = "times";
/** Police des documents tabulaires denses (bulletin de paie, écritures comptables). */
export const FONT_TABLE = "helvetica";

/** Conversion point → millimètre (jsPDF est en mm, les corps sont en points). */
export const PT2MM = 0.3528;

/**
 * Avance verticale réelle d'une ligne de corps `fs` (points) → mm.
 * Toute autre formule (fs * 0,5, fs / 2…) fait dériver la position par rapport au texte
 * réellement rendu par jsPDF : les blocs suivants se décalent et la signature chevauche le pied.
 */
export function lineHeight(fs: number, factor = 1.32): number {
  return fs * PT2MM * factor;
}

/** Échelle typographique fermée — six corps, pas davantage (au-delà, la hiérarchie se brouille). */
export const FS = {
  /** Raison sociale dans l'en-tête. */
  firm: 19,
  /** Titre du document (dans son cadre). */
  title: 15,
  /** Intertitre de section. */
  section: 11,
  /** Corps de texte. */
  body: 10.5,
  /** Annotation, méta, légende. */
  note: 8.5,
  /** En-tête courant, pied de page. */
  micro: 7.5,
} as const;

/** Gris neutre des filets de tableau (non lié à la marque). */
export const RULE: RGB = [210, 214, 204];

/**
 * Rouge d'alerte — signal, pas élément de charte : il ne suit donc PAS la couleur de la société.
 * Réservé aux anomalies bloquantes (déséquilibre débit/crédit, invariant rompu).
 */
export const ALERT: RGB = [200, 40, 60];

/* ------------------------------------------------------------------ logo ------------------------------------------------------------------ */

export interface LoadedLogo {
  data: string;
  fmt: string;
}

/**
 * Charge le logo de la société en data-URL utilisable par `doc.addImage`.
 * Retourne `null` en cas d'échec : un logo manquant ou illisible ne doit JAMAIS casser un export.
 */
export async function loadLogo(path?: string): Promise<LoadedLogo | null> {
  if (!path) return null;
  try {
    if (path.startsWith("data:")) {
      return { data: path, fmt: path.includes("jpeg") || path.includes("jpg") ? "JPEG" : "PNG" };
    }
    const res = await fetch(path);
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return { data, fmt: blob.type.includes("jpeg") ? "JPEG" : "PNG" };
  } catch {
    return null;
  }
}

/** Logo de la société, avec repli sur le logo Miya par défaut. */
export function firmLogoPath(firm: Firm): string {
  return firm.logo_path || "/logo-miya.png";
}

/* ------------------------------------------------------------------ texte ------------------------------------------------------------------ */

/**
 * Assainissement du texte avant `doc.text()`. Deux niveaux, à ne pas confondre :
 *
 * - `asciiSpaces` (ré-exporté ici, source : `format.ts`) — normalise les seules espaces spéciales.
 *   Les polices standard jsPDF sont en WinAnsi, qui ignore l'espace fine insécable U+202F
 *   produite par `Intl.NumberFormat("fr-*")` → glyphe parasite (« 100 /000 »). C'est le niveau
 *   adapté aux documents en français courant : accents et points de suspension sont WinAnsi.
 * - `pdfText` (dans `format.ts`) — assainissement Latin-1 complet, qui remplace AUSSI Σ, →, ≥,
 *   les tirets cadratins et les points de suspension. Réservé aux textes techniques ; l'appliquer
 *   à un document RH transformerait les placeholders pointillés « …… » en « ...... ».
 */
export { asciiSpaces };

/** Échappement HTML — partagé par les rendus HTML imprimables. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ texte enrichi ------------------------------------------------------------------ */

/**
 * Fragment de texte homogène (une graisse, un style). Le corps d'un document officiel met en
 * évidence ses données clés — nom, dates, durée, montant — pour qu'un lecteur pressé les trouve
 * sans relire le paragraphe. C'est ce que fait le gabarit de référence.
 */
export interface TextRun {
  t: string;
  b?: boolean;
  i?: boolean;
}

/**
 * Un mot mesuré, prêt à être posé.
 *
 * Un mot peut mélanger plusieurs styles : dans « **OUTERGA**, titulaire… », la virgule suit
 * immédiatement le fragment gras. Traiter chaque fragment séparément insérerait une espace
 * parasite avant la ponctuation (« OUTERGA , titulaire »), faute lourde en typographie française.
 */
interface Word {
  segs: TextRun[];
  w: number;
}

/**
 * Découpe un texte balisé `**gras**` / `*italique*` en fragments.
 * Un astérisque isolé reste littéral : aucune donnée n'est perdue par le balisage.
 */
export function parseRuns(s: string): TextRun[] {
  const out: TextRun[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/gs;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: m[1], b: true });
    else out.push({ t: m[2], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out.filter((r) => r.t.length > 0);
}

/** Style jsPDF correspondant à un fragment. */
function runStyle(r: TextRun): string {
  if (r.b && r.i) return "bolditalic";
  if (r.b) return "bold";
  if (r.i) return "italic";
  return "normal";
}

/**
 * Découpe les fragments en lignes tenant dans `width`, chaque mot mesuré avec SA police.
 * `splitTextToSize` de jsPDF ne sait pas le faire : il suppose une graisse unique et couperait
 * trop tôt ou trop tard dès qu'un mot est en gras.
 */
export function layoutRuns(doc: jsPDF, runs: TextRun[], width: number, fs: number, font = FONT): Word[][] {
  doc.setFontSize(fs);

  // 1. Fragments découpés en morceaux, les espaces conservées comme séparateurs explicites :
  //    c'est ce qui permet de recoller « OUTERGA » et « , » en un seul mot.
  const pieces: { r: TextRun; space: boolean }[] = [];
  for (const r of runs) {
    for (const part of r.t.split(/(\s+)/)) {
      if (!part) continue;
      pieces.push({ r: { t: part, b: r.b, i: r.i }, space: /^\s+$/.test(part) });
    }
  }

  // 2. Regroupement en mots : tout ce qui n'est pas séparé par une espace reste soudé.
  const words: Word[] = [];
  let segs: TextRun[] = [];
  const flush = () => {
    if (!segs.length) return;
    let w = 0;
    for (const s of segs) {
      doc.setFont(font, runStyle(s));
      w += doc.getTextWidth(s.t);
    }
    words.push({ segs, w });
    segs = [];
  };
  for (const p of pieces) {
    if (p.space) flush();
    else segs.push(p.r);
  }
  flush();

  doc.setFont(font, "normal");
  const spaceW = doc.getTextWidth(" ");
  const lines: Word[][] = [];
  let line: Word[] = [];
  let used = 0;
  for (const w of words) {
    const need = line.length ? used + spaceW + w.w : w.w;
    if (line.length && need > width) {
      lines.push(line);
      line = [w];
      used = w.w;
    } else {
      line.push(w);
      used = need;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Pose une ligne de mots. `justify` répartit l'espace excédentaire entre les mots — jamais sur la
 * dernière ligne d'un paragraphe, qui doit rester au fer à gauche (sinon la ligne finale s'étire
 * en travers de la page, défaut classique de justification naïve).
 */
export function drawWordLine(
  doc: jsPDF,
  line: Word[],
  x: number,
  y: number,
  width: number,
  fs: number,
  justify: boolean,
  font = FONT,
): void {
  doc.setFontSize(fs).setFont(font, "normal");
  const spaceW = doc.getTextWidth(" ");
  const sum = line.reduce((a, w) => a + w.w, 0);
  const gaps = line.length - 1;
  const gap = justify && gaps > 0 ? (width - sum) / gaps : spaceW;
  let cx = x;
  for (const w of line) {
    // Les segments d'un même mot se suivent sans espace (ponctuation collée au fragment gras).
    for (const s of w.segs) {
      doc.setFont(font, runStyle(s));
      doc.text(s.t, cx, y);
      cx += doc.getTextWidth(s.t);
    }
    cx += gap;
  }
  doc.setFont(font, "normal");
}

/** Convertit le balisage `**gras**` / `*italique*` en HTML, après échappement. */
export function runsToHtml(s: string): string {
  return parseRuns(s)
    .map((r) => {
      const t = escapeHtml(r.t);
      if (r.b) return `<strong>${t}</strong>`;
      if (r.i) return `<em>${t}</em>`;
      return t;
    })
    .join("");
}

/** Placeholder pointillé visible : un champ absent se montre, ne s'invente pas et ne se vide pas. */
export const PH = "……………………";

/* ------------------------------------------------------------------ en-tête / pied ------------------------------------------------------------------ */

/** Palette de la société émettrice (vert Miya par défaut). */
export function firmPalette(firm: Firm): PayslipPalette {
  return paletteForFirm(firm.brand_color);
}

/* --- composition des lignes d'identité (séparateur « | », libellé sans deux-points) ---------- */

/** Séparateur des mentions d'identité, conforme au gabarit de référence. */
const SEP = "   |   ";

/** Identifiants légaux : `ICE … | IF … | RC … | TP … | CNSS …` (champs renseignés uniquement). */
export function firmIdentifiersLine(firm: Firm): string {
  const short: Record<string, string> = { Patente: "TP" };
  return asciiSpaces(
    firmLegalPairs(firm)
      .filter((p) => p.label !== "Tél" && p.label !== "E-mail")
      .map((p) => `${short[p.label] ?? p.label} ${p.value}`)
      .join(SEP),
  );
}

/** Coordonnées : `siège | Tél. … | e-mail` (champs renseignés uniquement). */
export function firmContactLine(firm: Firm): string {
  const contact = firmLegalPairs(firm).filter((p) => p.label === "Tél" || p.label === "E-mail");
  return asciiSpaces(
    [
      (firm.address ?? "").trim(),
      ...contact.map((p) => (p.label === "Tél" ? `Tél. ${p.value}` : p.value)),
    ]
      .filter(Boolean)
      .join(SEP),
  );
}

/**
 * En-tête complet (page 1), calqué sur le gabarit officiel Belkora : logo à gauche, puis un bloc
 * CENTRÉ sur la largeur restante — raison sociale, descripteur juridique, identifiants légaux,
 * coordonnées — et un filet de marque en dessous.
 *
 * Retourne l'ordonnée à laquelle le corps peut commencer.
 */
export function drawFullHeader(doc: jsPDF, firm: Firm, logo: LoadedLogo | null, pal: PayslipPalette): number {
  const LOGO = 28; // côté du logo (mm) — carré, aligné sur la hauteur du bloc de titre
  if (logo) {
    try {
      doc.addImage(logo.data, logo.fmt, M, 12, LOGO, LOGO);
    } catch {
      /* un logo illisible ne casse pas l'export */
    }
  }
  // Largeur réelle de la page (portrait 210, paysage 297) : le registre est en paysage, le reste
  // en portrait. Dériver du document évite un en-tête décalé à gauche sur une page paysage.
  const pw = doc.internal.pageSize.getWidth();
  // Le bloc d'identité se centre sur l'espace restant à droite du logo.
  const left = logo ? M + LOGO + 6 : M;
  const cx = (left + (pw - M)) / 2;
  const inner = pw - M - left;

  let y = 21;
  doc.setFont(FONT, "bold").setFontSize(FS.firm).setTextColor(...pal.ink);
  doc.text(asciiSpaces(firm.name.toUpperCase()), cx, y, { align: "center", maxWidth: inner });

  const sub = (s: string, size: number, color: RGB, dy: number) => {
    if (!s) return;
    y += dy;
    doc.setFont(FONT, "normal").setFontSize(size).setTextColor(...color);
    doc.text(s, cx, y, { align: "center", maxWidth: inner });
  };
  sub(asciiSpaces(firmDescriptor(firm)), FS.note, pal.ink, 5.6);
  sub(firmIdentifiersLine(firm), FS.micro, pal.muted, 4.8);
  sub(firmContactLine(firm), FS.micro, pal.muted, 4.4);

  doc.setDrawColor(...pal.deep).setLineWidth(0.9).line(M, HEAD - 8, pw - M, HEAD - 8);
  return HEAD;
}

/**
 * En-tête courant (pages suivantes) : raison sociale seule + filet fin.
 * Répéter le logo et le bloc légal à chaque page alourdit le document sans rien apporter.
 */
export function drawRunningHeader(doc: jsPDF, firm: Firm, pal: PayslipPalette): number {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont(FONT, "bold").setFontSize(FS.micro).setTextColor(...pal.muted);
  doc.text(asciiSpaces(firm.name.toUpperCase()), M, 13);
  doc.setDrawColor(...pal.olive).setLineWidth(0.3).line(M, 15.5, pw - M, 15.5);
  return HEAD_RUN;
}

/**
 * Titre du document dans son cadre : encadré fin à la couleur de marque, texte en capitales
 * espacées. Retourne l'ordonnée sous le cadre.
 */
export function drawTitleBox(doc: jsPDF, pal: PayslipPalette, title: string, y: number): number {
  const pw = doc.internal.pageSize.getWidth();
  const t = asciiSpaces(title.toUpperCase());
  const CHAR = 0.6; // interlettrage (mm) — le titre respire sans se disloquer
  doc.setFont(FONT, "bold").setFontSize(FS.title);
  const tw = doc.getTextWidth(t) + CHAR * Math.max(0, t.length - 1);
  // Cadre plafonné à la largeur de composition RÉELLE de la page : en paysage (registre), le
  // plafond portrait (166 mm) tronquait un titre long, dont la fin débordait hors du cadre.
  const boxW = Math.min(pw - 2 * M, tw + 34);
  const boxH = 14;
  const x = (pw - boxW) / 2;
  doc.setDrawColor(...pal.deep).setLineWidth(0.5).rect(x, y, boxW, boxH);
  doc.setTextColor(...pal.deep);
  doc.text(t, pw / 2, y + boxH / 2 + 1.9, { align: "center", charSpace: CHAR });
  return y + boxH;
}

/**
 * Pied d'une page : filet de marque puis DEUX lignes centrées d'identité (identifiants légaux,
 * puis coordonnées) — exactement le gabarit de référence.
 *
 * La pagination n'apparaît qu'à partir de deux pages : sur un document d'une page, un « Page 1 / 1 »
 * n'informe de rien et alourdit le pied. Au-delà, elle prouve au destinataire qu'aucune page ne manque.
 */
export function drawFooter(doc: jsPDF, firm: Firm, pal: PayslipPalette, page: number, total: number): void {
  // Dimensions RÉELLES de la page : en paysage (registre), la hauteur est 210 mm et non 297 —
  // un pied placé à `H - …` (portrait) tombait SOUS la page et n'apparaissait pas.
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const cw = pw - 2 * M;
  doc.setDrawColor(...pal.olive).setLineWidth(0.4).line(M, ph - 18, pw - M, ph - 18);
  doc.setFont(FONT, "normal").setFontSize(FS.micro).setTextColor(...pal.muted);
  const ids = firmIdentifiersLine(firm);
  const contact = firmContactLine(firm);
  if (ids) doc.text(ids, pw / 2, ph - 13, { align: "center", maxWidth: cw });
  if (contact) doc.text(contact, pw / 2, ph - 8.8, { align: "center", maxWidth: cw });
  if (total > 1) {
    doc.setFontSize(FS.micro - 0.5).setTextColor(150, 150, 150);
    doc.text(`${page} / ${total}`, pw - M, ph - 4.6, { align: "right" });
  }
}

/**
 * Pose le pied sur TOUTES les pages, à la fin du rendu.
 * Le total n'est connu qu'à ce moment : un tableau peut avoir ajouté des pages en cours de route.
 */
export function paintFooters(doc: jsPDF, firm: Firm, pal: PayslipPalette): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, firm, pal, p, total);
  }
}

/** Ligne d'identification compacte de la société (descripteur + identifiants), pour les en-têtes denses. */
export function firmHeadLine(firm: Firm): string {
  return asciiSpaces([firmDescriptor(firm), firmIdentifiersLine(firm)].filter(Boolean).join(SEP));
}

/* ------------------------------------------------------------------ pagination ------------------------------------------------------------------ */

/** Curseur de rendu : le document, la page courante et l'ordonnée d'écriture. */
export interface Cursor {
  doc: jsPDF;
  firm: Firm;
  pal: PayslipPalette;
  y: number;
  page: number;
}

/**
 * Garantit `need` mm disponibles avant le pied ; ajoute une page et son en-tête courant sinon.
 * Sans cet appel avant chaque bloc, un document long est SILENCIEUSEMENT tronqué.
 */
export function ensure(c: Cursor, need: number): void {
  // Hauteur réelle de la page (paysage 210 / portrait 297) : en paysage, se fier à H (297)
  // laisserait poser du contenu SOUS le bord de la page, silencieusement tronqué.
  const ph = c.doc.internal.pageSize.getHeight();
  if (c.y + need > ph - FOOT) {
    c.doc.addPage();
    c.page += 1;
    c.y = drawRunningHeader(c.doc, c.firm, c.pal);
  }
}

/** Resynchronise le curseur après un `autoTable` (qui a pu ajouter des pages). */
export function afterTable(c: Cursor, gap = 3): void {
  c.y = (c.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + gap;
  c.page = c.doc.getNumberOfPages();
}

/**
 * Style de tableau commun (jspdf-autotable) aux couleurs de la société.
 * `margin.top` = `HEAD_RUN` : une reprise de tableau en page suivante respecte l'en-tête courant.
 */
export function tableStyles(pal: PayslipPalette): Pick<UserOptions, "styles" | "headStyles" | "margin"> {
  return {
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      cellPadding: 1.5,
      textColor: [...pal.ink],
      lineColor: [...RULE],
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: { fillColor: [...pal.deep], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.2 },
    margin: { left: M, right: M, top: HEAD_RUN },
  };
}
