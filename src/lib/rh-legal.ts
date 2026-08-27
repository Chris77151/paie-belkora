/**
 * Moteur juridique partagé — Famille B du skill « documents-rh-conformes », porté au navigateur.
 *
 * Sert les deux nouveaux sous-volets « Documents RH » :
 *   - Contrat RH          (rh-contracts.ts)  — CDD chantier & contrat pour travail déterminé
 *   - Kit disciplinaire   (rh-discipline.ts) — sanctions graduées (art. 37 → 39, audition art. 62)
 *
 * Un document est décrit par un objet PUR `LegalDoc` (blocs), rendu ensuite en PDF (jsPDF,
 * multi-pages, en-tête + pied légal aux couleurs de la société émettrice — spectre dérivé de
 * firm.brand_color, vert Miya par défaut) OU en HTML imprimable. Le contenu est
 * calqué sur les modèles LaTeX MBD du skill (gabarit `mbd-style.sty`).
 *
 * RÈGLE D'OR (identique au skill) : ZÉRO INVENTION. Tout champ absent est rendu en placeholder
 * pointillé visible (`PH`) et listé par le moteur de contenu — jamais fabriqué. L'entité
 * signataire (raison sociale, ICE/IF/RC/CNSS, siège, logo, signataire) suit la société active
 * du store.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Employee, Firm } from "@/data/types";
import { dateFr } from "./format";
import { firmDescriptor, firmIdentityClause } from "./firm-legal";
import { paletteForFirm, type PayslipPalette, type RGB } from "./brand-color";
import {
  CW,
  FONT,
  FOOT,
  FS,
  M,
  W,
  afterTable,
  drawTitleText,
  drawAccentBar,
  drawFullHeader,
  ensure as ensureSpace,
  drawWordLine,
  escapeHtml,
  firmContactLine,
  firmIdentifiersLine,
  firmLogoPath,
  layoutRuns,
  lineHeight,
  loadLogo,
  parseRuns,
  runsToHtml,
  paintFooters,
  asciiSpaces,
  tableStyles,
  type Cursor,
  PH as PH_KIT,
} from "./pdf-kit";

/* Couleurs de marque — dérivées de la société (firm.brand_color) au début de chaque rendu.
 * Sans couleur de marque définie, on garde EXACTEMENT le vert Miya d'origine.
 * `usePalette(firm)` réassigne LIME/OLIVE/INK/VERT_FONCE/MUTED : les usages `...LIME` restent inchangés. */
let LIME: RGB = paletteForFirm(undefined).lime; // #8CB45A (vert tilleul du logo Miya) par défaut
let OLIVE: RGB = paletteForFirm(undefined).olive;
let INK: RGB = paletteForFirm(undefined).ink;
let VERT_FONCE: RGB = paletteForFirm(undefined).deep;
let MUTED: RGB = paletteForFirm(undefined).muted;
function usePalette(firm: Firm): PayslipPalette {
  const pal = paletteForFirm(firm.brand_color);
  LIME = pal.lime;
  OLIVE = pal.olive;
  INK = pal.ink;
  VERT_FONCE = pal.deep;
  MUTED = pal.muted;
  return pal;
}

/** Placeholder pointillé visible (à compléter à la main) — jamais une donnée inventée. */
export const PH = PH_KIT;

/** Valeur réelle ou placeholder — sans jamais inventer. */
export function val(v: string | number | undefined | null): string {
  const s = (v ?? "").toString().trim();
  return s.length ? s : PH;
}

/**
 * Civilité du salarié — définition unique, partagée par tous les documents RH.
 * `null` = non précisée : les documents basculent alors sur des accords neutres, jamais devinés.
 */
export type Civility = "M." | "Mme" | null;

/** Nom complet en capitales, tel qu'il apparaît dans tous les documents RH. */
export function fullName(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim().toUpperCase();
}

/** Date réelle formatée FR, sinon placeholder. */
export function valDate(iso?: string): string {
  const s = (iso ?? "").trim();
  if (!s) return PH;
  const d = dateFr(s);
  return d === "—" ? PH : d;
}

/* ------------------------------------------------------------------ modèle de document ------------------------------------------------------------------ */

/** Ligne « libellé : valeur » affichée sous l'en-tête (courriers disciplinaires). */
export interface MetaLine {
  label: string;
  value: string;
}

/** Bloc de contenu — unité de rendu commune PDF / HTML. */
export type LegalBlock =
  | { k: "h"; t: string } // titre d'article / de section
  | { k: "p"; t: string } // paragraphe justifié
  | { k: "ul"; items: string[] } // liste à puces
  | { k: "check"; items: string[]; checked?: boolean[] } // cases à cocher (☐/☑ si checked[i] — pré-cochage auto)
  | { k: "center"; t: string; strong?: boolean } // ligne centrée
  | { k: "sp"; h?: number } // espace vertical (mm)
  | { k: "table"; head?: string[]; rows: string[][]; align?: ("left" | "right" | "center")[] }; // tableau (décompte…)

/** Colonne de signature (Employeur / Salarié). */
export interface SignatureCol {
  title: string;
  lines: string[];
  caption?: string;
}

/** Variante arabe (RTL) d'un document — même structure, rendue en HTML seulement. */
export interface LegalDocAr {
  heading: string;
  subheading?: string;
  meta?: MetaLine[];
  blocks: LegalBlock[];
  faitA?: string;
  legalNote?: string;
  signatures?: SignatureCol[];
}

/** Description PURE d'un document juridique — indépendante du moteur de rendu. */
export interface LegalDoc {
  /** Sert au nom de fichier et au titre PDF. */
  fileTitle: string;
  /** Grand titre centré. */
  heading: string;
  subheading?: string;
  /** « Ville, le … » aligné à droite en tête (courriers). */
  rightHeader?: string;
  /** Lignes « libellé : valeur » (destinataire, chantier, mode de remise…). */
  meta?: MetaLine[];
  /** Corps du document. */
  blocks: LegalBlock[];
  /** « Fait à …, le … » centré (contrats) ou aligné droite. */
  faitA?: string;
  /** Note légale sous le « Fait à » (ex. exemplaires + légalisation). */
  legalNote?: string;
  /** 1 ou 2 colonnes de signature. */
  signatures?: SignatureCol[];
  /** Contenu arabe (RTL) optionnel — rendu HTML (le PDF jsPDF ne gère pas l'arabe). */
  ar?: LegalDocAr;
}

/* ------------------------------------------------------------------ en-tête / pied ------------------------------------------------------------------ */

/** Paragraphe d'identification de l'employeur (bloc « Entre les soussignés »). */
export function employerParagraph(firm: Firm): string {
  const forme = firm.regime === "SMAG" ? "entreprise" : "société";
  const identity = firmIdentityClause(firm); // forme + capital, RC (+ tribunal), ICE, IF, patente, CNSS, siège
  const head = `La ${forme} ${firm.name.toUpperCase()}`;
  const body = identity ? `${head}, ${identity}` : head;
  const sig = val(firm.signatory_name);
  const role = val(firm.signatory_role);
  return `${body}, représentée par ${sig}, en sa qualité de ${role},`;
}

/* ------------------------------------------------------------------ assainissement typographique ------------------------------------------------------------------ */

/**
 * Assainit le texte d'un document RH : remplace les caractères « spéciaux » superflus qui
 * trahissent une génération automatique (tiret cadratin « — », point médian « · » utilisé en
 * séparateur, points de suspension typographiques « … », flèches « → ») par des équivalents
 * sobres et universels, tout en CONSERVANT la typographie française légitime (guillemets « »,
 * accents, apostrophes). PURE. Appliquée à TOUT le contenu rendu (voir `sanitizeLegalDoc`), donc
 * valable pour tous les documents — contrats, attestations, kits — présents et futurs.
 */
export function sanitizeLegalText(s: string): string {
  return asciiSpaces(s)
    .replace(/[–—―‒]/g, "-")   // tirets moyen / cadratin / barre / figure → trait d'union
    .replace(/‑/g, "-")     // trait d'union insécable → trait d'union simple
    .replace(/[•‣⁃◦]/g, "-")   // puces résiduelles dans le fil du texte
    .replace(/·/g, "-")          // point médian employé comme séparateur
    .replace(/…/g, "...")             // points de suspension → trois points ASCII
    .replace(/\s*→\s*/g, " vers ")   // flèche « devient / vers »
    .replace(/\s*←\s*/g, " - ")      // flèche inverse (rare)
    .replace(/\s*×\s*/g, " x ")       // signe multiplication → « x »
    .replace(/≤\s*/g, "au plus ")     // ≤ → « au plus »
    .replace(/≥\s*/g, "au moins ");   // ≥ → « au moins »
}

const S = sanitizeLegalText;

function cleanBlock(b: LegalBlock): LegalBlock {
  switch (b.k) {
    case "h": return { k: "h", t: S(b.t) };
    case "p": return { k: "p", t: S(b.t) };
    case "ul": return { k: "ul", items: b.items.map(S) };
    case "check": return { k: "check", items: b.items.map(S), checked: b.checked };
    case "center": return { k: "center", t: S(b.t), strong: b.strong };
    case "sp": return b;
    case "table": return { k: "table", head: b.head?.map(S), rows: b.rows.map((r) => r.map(S)), align: b.align };
  }
}
const cleanMeta = (m: MetaLine): MetaLine => ({ label: S(m.label), value: S(m.value) });
const cleanSig = (c: SignatureCol): SignatureCol => ({ title: S(c.title), lines: c.lines.map(S), caption: c.caption ? S(c.caption) : undefined });
const cleanAr = (a: LegalDocAr): LegalDocAr => ({
  heading: S(a.heading),
  subheading: a.subheading ? S(a.subheading) : undefined,
  meta: a.meta?.map(cleanMeta),
  blocks: a.blocks.map(cleanBlock),
  faitA: a.faitA ? S(a.faitA) : undefined,
  legalNote: a.legalNote ? S(a.legalNote) : undefined,
  signatures: a.signatures?.map(cleanSig),
});

/** Renvoie une COPIE du document dont tout le texte rendu est assaini (voir `sanitizeLegalText`). PURE. */
export function sanitizeLegalDoc(d: LegalDoc): LegalDoc {
  return {
    ...d,
    heading: S(d.heading),
    subheading: d.subheading ? S(d.subheading) : undefined,
    rightHeader: d.rightHeader ? S(d.rightHeader) : undefined,
    meta: d.meta?.map(cleanMeta),
    blocks: d.blocks.map(cleanBlock),
    faitA: d.faitA ? S(d.faitA) : undefined,
    legalNote: d.legalNote ? S(d.legalNote) : undefined,
    signatures: d.signatures?.map(cleanSig),
    ar: d.ar ? cleanAr(d.ar) : undefined,
  };
}

/* ------------------------------------------------------------------ rendu PDF (multi-pages) ------------------------------------------------------------------ */
/* Grille, en-tête, pied et pagination viennent du socle commun `pdf-kit.ts` : tous les
 * documents de l'application partagent ainsi exactement la même mise en page. */
type Ctx = Cursor;

const ensure = ensureSpace;

/**
 * Paragraphe justifié, avec mise en évidence `**gras**` / `*italique*` des données clés.
 *
 * La pagination se fait LIGNE PAR LIGNE. Réserver le bloc entier (`ensure(lignes × hauteur)`)
 * était faux pour un paragraphe plus haut qu'une page : la réserve ne pouvant jamais être
 * satisfaite, le texte débordait quand même sous le pied.
 */
function drawParagraph(ctx: Ctx, text: string, fs = FS.body, gap = 3.4) {
  const { doc } = ctx;
  doc.setTextColor(...INK);
  const lines = layoutRuns(doc, parseRuns(asciiSpaces(text)), CW, fs);
  const lh = lineHeight(fs, 1.45); // interligne aéré, comme le gabarit de référence
  lines.forEach((line, i) => {
    ensure(ctx, lh);
    doc.setTextColor(...INK);
    drawWordLine(doc, line, M, ctx.y, CW, fs, i < lines.length - 1);
    ctx.y += lh;
  });
  ctx.y += gap;
}

function drawList(ctx: Ctx, items: string[], marker: (i: number) => string, fs = FS.body) {
  const { doc } = ctx;
  const lh = lineHeight(fs, 1.45);
  const indent = 6.5;
  items.forEach((it, idx) => {
    const lines = layoutRuns(doc, parseRuns(asciiSpaces(it)), CW - indent, fs);
    lines.forEach((line, i) => {
      ensure(ctx, lh);
      doc.setTextColor(...INK);
      if (i === 0) {
        doc.setFont(FONT, "normal").setFontSize(fs);
        doc.text(marker(idx), M, ctx.y);
      }
      drawWordLine(doc, line, M + indent, ctx.y, CW - indent, fs, i < lines.length - 1);
      ctx.y += lh;
    });
    ctx.y += 1.2;
  });
  ctx.y += 1.6;
}

/**
 * Bloc(s) de signature. Le bloc est réservé d'un seul tenant (`ensure`) : une signature orpheline
 * en haut de page suivante décrédibilise le document.
 *
 * Un seul signataire (attestations, certificats) → bloc ALIGNÉ À DROITE, avec le filet de
 * réception SOUS l'identité, conformément au gabarit de référence. Deux signataires (contrats,
 * accords) → deux colonnes de largeur égale, la signature de chaque partie sous son identité.
 */
function drawSignatures(ctx: Ctx, cols: SignatureCol[]) {
  const { doc } = ctx;
  const BLOCK = 46;
  ensure(ctx, BLOCK);
  const startY = ctx.y + 2;
  const solo = cols.length === 1;
  const colW = solo ? CW * 0.45 : (CW - 10) / 2;

  cols.forEach((c, idx) => {
    const x = solo ? W - M - colW : idx === 0 ? M : M + colW + 10;
    const align = solo ? ("left" as const) : ("left" as const);
    let yy = startY;

    doc.setFont(FONT, "bold").setFontSize(FS.body).setTextColor(...INK);
    doc.text(asciiSpaces(c.title), x, yy, { align, maxWidth: colW });
    yy += lineHeight(FS.body) + 1.4;

    doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...INK);
    for (const l of c.lines) {
      const wr = doc.splitTextToSize(asciiSpaces(l), colW) as string[];
      doc.text(wr, x, yy, { align, lineHeightFactor: 1.3 });
      yy += wr.length * lineHeight(FS.note) + 0.8;
    }

    if (c.caption) {
      doc.setFont(FONT, "italic").setFontSize(FS.micro).setTextColor(...MUTED);
      doc.text(asciiSpaces(c.caption), x, yy + 1.6, { align, maxWidth: colW });
    }

    // Espace de signature manuscrite, puis filet de réception.
    doc.setDrawColor(...MUTED).setLineWidth(0.4).line(x, startY + BLOCK - 8, x + colW, startY + BLOCK - 8);
  });
  ctx.y = startY + BLOCK;
}

export async function renderLegalPdf(firm: Firm, raw: LegalDoc): Promise<jsPDF> {
  const d = sanitizeLegalDoc(raw); // supprime les caractères spéciaux superflus (rendu sobre)
  const pal = usePalette(firm); // couleurs dérivées de la société (défaut = vert Miya)
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: d.fileTitle });
  const logo = await loadLogo(firmLogoPath(firm));
  const ctx: Ctx = { doc, firm, pal, y: 0, page: 1 };

  ctx.y = drawFullHeader(doc, firm, logo, pal);

  // « Ville, le … » à droite (courriers)
  if (d.rightHeader) {
    doc.setFont(FONT, "normal").setFontSize(FS.body).setTextColor(...INK);
    doc.text(asciiSpaces(d.rightHeader), W - M, ctx.y, { align: "right" });
    ctx.y += 7;
  }

  // Lignes méta (destinataire, chantier, mode de remise…)
  if (d.meta?.length) {
    doc.setFontSize(FS.body);
    for (const m of d.meta) {
      ensure(ctx, 6);
      doc.setFont(FONT, "bold").setTextColor(...INK);
      const lbl = `${m.label} : `;
      doc.text(lbl, M, ctx.y);
      const lblW = doc.getTextWidth(lbl);
      doc.setFont(FONT, "normal");
      const wr = doc.splitTextToSize(asciiSpaces(m.value), CW - lblW) as string[];
      doc.text(wr, M + lblW, ctx.y, { lineHeightFactor: 1.3 });
      ctx.y += Math.max(1, wr.length) * lineHeight(FS.body) + 1.5;
    }
    ctx.y += 2;
  }

  // Titre du document — gabarit officiel Belkora : capitales espacées en VERT de marque, SANS
  // cadre, sous-titre gris, puis un FILET D'ACCENT (vert médian) qui souligne l'ensemble.
  ensure(ctx, 36);
  ctx.y = drawTitleText(doc, pal, d.heading, ctx.y + 5);
  if (d.subheading) {
    ctx.y += 5;
    doc.setFont(FONT, "italic").setFontSize(FS.note).setTextColor(...MUTED);
    const sub = doc.splitTextToSize(asciiSpaces(d.subheading), CW) as string[];
    doc.text(sub, W / 2, ctx.y, { align: "center", lineHeightFactor: 1.25 });
    ctx.y += sub.length * lineHeight(FS.note);
  }
  ctx.y = drawAccentBar(doc, pal, ctx.y + 5);
  ctx.y += 12;

  // Corps
  for (const b of d.blocks) {
    switch (b.k) {
      case "h": {
        ctx.y += 2.5;
        ensure(ctx, 9);
        doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...VERT_FONCE);
        const hl = doc.splitTextToSize(asciiSpaces(b.t), CW) as string[];
        doc.text(hl, M, ctx.y, { lineHeightFactor: 1.25 });
        ctx.y += hl.length * lineHeight(FS.section) + 2;
        break;
      }
      case "p":
        drawParagraph(ctx, b.t);
        break;
      case "ul":
        drawList(ctx, b.items, () => "•");
        break;
      case "check":
        drawList(ctx, b.items, (i) => (b.checked?.[i] ? "[X]" : "[ ]"));
        break;
      case "center":
        ensure(ctx, 8);
        doc.setFont(FONT, b.strong ? "bold" : "normal").setFontSize(b.strong ? 11 : 10).setTextColor(...INK);
        doc.text(b.t, W / 2, ctx.y, { align: "center" });
        ctx.y += lineHeight(11) + 2;
        break;
      case "sp":
        ctx.y += b.h ?? 3;
        break;
      case "table": {
        ensure(ctx, 24);
        const colStyles: Record<number, { halign: "left" | "right" | "center" }> = {};
        (b.align ?? []).forEach((a, i) => { colStyles[i] = { halign: a }; });
        autoTable(doc, {
          startY: ctx.y,
          head: b.head ? [b.head] : undefined,
          body: b.rows,
          theme: "grid",
          ...tableStyles(pal),
          columnStyles: colStyles,
        });
        afterTable(ctx); // resynchronise y ET la page (autoTable a pu en ajouter)
        break;
      }
    }
  }

  // ---- Bloc de clôture (« Fait à … » + note légale + émargement) ANCRÉ EN BAS DE PAGE ----
  // Sur un acte court, ce bloc ne doit pas « flotter » au milieu de la feuille : le corps reste en
  // haut, la clôture se pose contre la réserve de pied. On mesure sa hauteur, on garantit qu'il
  // tient sur la page (sinon page suivante), puis on descend le curseur pour l'aligner en bas —
  // sans jamais REMONTER (`max`) si le corps occupe déjà le bas de la page.
  if (d.faitA || d.signatures?.length) {
    const SIG_BLOCK = 48; // hauteur du bloc d'émargement (cf. drawSignatures)
    let noteLines: string[] = [];
    let closingH = 0;
    if (d.faitA) {
      closingH += 4 + lineHeight(10.5) + 1;
      if (d.legalNote) {
        noteLines = doc.splitTextToSize(d.legalNote, CW) as string[];
        closingH += noteLines.length * lineHeight(8) + 2;
      }
    }
    if (d.signatures?.length) closingH += 8 + SIG_BLOCK;

    ensure(ctx, closingH); // bascule en page suivante si le bloc ne tient pas ici
    ctx.y = Math.max(ctx.y, doc.internal.pageSize.getHeight() - FOOT - closingH);

    if (d.faitA) {
      ctx.y += 4;
      doc.setFont(FONT, "bold").setFontSize(10.5).setTextColor(...INK);
      doc.text(d.faitA, W / 2, ctx.y, { align: "center" });
      ctx.y += lineHeight(10.5) + 1;
      if (d.legalNote) {
        doc.setFont(FONT, "italic").setFontSize(8).setTextColor(...MUTED);
        doc.text(noteLines, W / 2, ctx.y, { align: "center", lineHeightFactor: 1.25 });
        ctx.y += noteLines.length * lineHeight(8) + 2;
      }
    }

    // Signatures / émargement — espace après le « Fait à » pour aérer le bas de l'acte.
    if (d.signatures?.length) {
      ctx.y += 8;
      drawSignatures(ctx, d.signatures);
    }
  }

  // Pieds de page (numérotation a posteriori) — total réel (autoTable a pu ajouter des pages)
  paintFooters(doc, firm, pal);
  return doc;
}

/* ------------------------------------------------------------------ rendu HTML imprimable ------------------------------------------------------------------ */
const esc = escapeHtml;

export function renderLegalHtml(firm: Firm, raw: LegalDoc, lang: "fr" | "ar" = "fr"): string {
  const d = sanitizeLegalDoc(raw); // même assainissement typographique que le PDF
  const pal = paletteForFirm(firm.brand_color); // couleurs dérivées de la société (défaut = vert Miya)
  const ar = lang === "ar" && d.ar ? d.ar : null;
  const c = ar ?? d;
  const rtl = !!ar;
  const parts: string[] = [];
  for (const b of c.blocks) {
    switch (b.k) {
      case "h":
        parts.push(`<h2>${esc(b.t)}</h2>`);
        break;
      case "p":
        parts.push(`<p>${runsToHtml(b.t)}</p>`);
        break;
      case "ul":
        parts.push(`<ul>${b.items.map((i) => `<li>${runsToHtml(i)}</li>`).join("")}</ul>`);
        break;
      case "check":
        parts.push(
          `<ul class="chk">${b.items.map((it, i) => `<li>${b.checked?.[i] ? "☑" : "☐"}  ${esc(it)}</li>`).join("")}</ul>`,
        );
        break;
      case "center":
        parts.push(`<p class="ctr${b.strong ? " strong" : ""}">${esc(b.t)}</p>`);
        break;
      case "sp":
        parts.push(`<div style="height:${b.h ?? 8}px"></div>`);
        break;
      case "table": {
        const th = b.head
          ? `<thead><tr>${b.head.map((h, i) => `<th style="text-align:${b.align?.[i] ?? "left"}">${esc(h)}</th>`).join("")}</tr></thead>`
          : "";
        const tb = `<tbody>${b.rows
          .map((r) => `<tr>${r.map((cell, i) => `<td style="text-align:${b.align?.[i] ?? "left"}">${esc(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`;
        parts.push(`<table class="dt">${th}${tb}</table>`);
        break;
      }
    }
  }

  const meta = c.meta?.length
    ? `<div class="meta">${c.meta
        .map((m) => `<div><b>${esc(m.label)} :</b> ${esc(m.value)}</div>`)
        .join("")}</div>`
    : "";

  const sig = c.signatures?.length
    ? `<div class="sigs ${c.signatures.length === 2 ? "two" : "one"}">${c.signatures
        .map(
          (col) =>
            `<div class="sig"><b>${esc(col.title)}</b>${col.lines
              .map((l) => `<div>${esc(l)}</div>`)
              .join("")}${
              col.caption ? `<small>${esc(col.caption)}</small>` : ""
            }<div class="sbox"></div></div>`,
        )
        .join("")}</div>`
    : "";

  const arCss = rtl
    ? `
 body{direction:rtl}
 .sheet{direction:rtl}
 *{font-family:"Amiri","Arabic Typesetting","Traditional Arabic",Tahoma,Arial,sans-serif}
 .top{flex-direction:row-reverse}
 .firm{text-align:right}
 p,h2,.meta,ul,.faitA,.note{text-align:right}
 ul{padding-left:0;padding-right:20px}
 ul.chk{padding-right:4px}
 .sigs{flex-direction:row-reverse}
 h1.title,.sub,p.ctr{text-align:center}`
    : "";

  return `<!doctype html><html lang="${rtl ? "ar" : "fr"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>${esc(d.fileTitle)}</title>
<style>
 :root{--lime:${pal.limeHex};--olive:${pal.oliveHex};--vf:${pal.deepHex};--ink:${pal.inkHex};--muted:${pal.mutedHex}}
 /* Empattements, comme le PDF : l'aperçu imprimable doit être fidèle au document exporté. */
 *{box-sizing:border-box;font-family:"Libre Baskerville","Times New Roman",Times,serif}
 body{margin:0;padding:24px;background:#f4f5f2;color:var(--ink)}
 /* Feuille au format A4 (hauteur mini), en COLONNE flex : le corps reste en haut, le bloc de
    clôture (« Fait à … » + émargement) est poussé EN BAS via .closing{margin-top:auto}. */
 .sheet{max-width:820px;margin:auto;background:#fff;padding:40px 48px 64px;border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);position:relative;display:flex;flex-direction:column;min-height:1160px}
 .top{display:flex;gap:18px;align-items:center;border-bottom:2.5px solid var(--olive);padding-bottom:14px}
 .top img{width:74px;height:74px;object-fit:contain;flex:0 0 auto}
 .firm{flex:1;text-align:center}
 .firm .fname{display:block;font-weight:700;font-size:25px;letter-spacing:.01em}
 .firm .fdesc{display:block;font-size:12.5px;margin-top:4px}
 .firm .fids{display:block;font-weight:400;color:var(--muted);font-size:10.5px;margin-top:3px}
 .rh{text-align:right;font-size:13px;margin-top:16px}
 .meta{font-size:13px;margin-top:10px;line-height:1.6}
 .meta b{color:var(--ink)}
 /* Titre du gabarit Belkora : vert de marque, capitales espacées, SANS cadre. */
 h1.title{margin:32px 0 0;text-align:center;color:var(--vf);font-size:26px;font-weight:700;letter-spacing:.09em;line-height:1.15}
 .sub{text-align:center;color:var(--muted);font-size:12px;font-style:italic;margin:8px auto 0}
 /* Filet d'accent vert médian qui souligne le titre / sous-titre, à la place d'un cadre. */
 .accentbar{height:3px;width:120px;background:var(--olive);margin:14px auto 0;border-radius:2px}
 .divider{height:22px}
 h2{color:var(--vf);font-size:14px;margin:20px 0 6px}
 p{font-size:13.5px;line-height:1.75;text-align:justify;margin:0 0 12px}
 p.ctr{text-align:center}p.strong{font-weight:700}
 ul{font-size:13.5px;line-height:1.7;margin:0 0 12px;padding-left:20px}
 ul.chk{list-style:none;padding-left:4px}
 table.dt{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 14px}
 table.dt th{background:var(--vf);color:#fff;font-weight:700;padding:5px 7px;border:1px solid #cfd4c7;text-align:left}
 table.dt td{padding:4px 7px;border:1px solid #dfe3d8}
 /* Bloc de clôture poussé en bas de la feuille (le corps occupe le haut). Sur un acte long il
    suit naturellement le corps (plus d'espace libre à absorber). */
 .closing{margin-top:auto}
 .faitA{text-align:center;font-weight:700;font-size:14px;margin:30px 0 4px}
 .note{text-align:center;font-style:italic;color:var(--muted);font-size:11px;margin-bottom:14px}
 /* Émargement : identité + libellé « (signature et cachet) » PUIS un espace de signature délimité
    par un filet en bas. Le bloc reste d'un seul tenant et respire après le « Fait à ». */
 .sigs{display:flex;gap:36px;margin-top:44px}
 .sigs.two .sig{flex:1}
 /* Signataire unique : bloc aligné à droite, comme le gabarit de référence. */
 .sigs.one{justify-content:flex-end}.sigs.one .sig{width:46%}
 .sig{break-inside:avoid;page-break-inside:avoid}
 .sig b{font-size:13.5px}
 .sig div{font-size:12.5px;line-height:1.55}
 .sig small{display:block;color:var(--muted);font-size:10.5px;font-style:italic;margin-top:2px}
 /* Espace réservé à la signature manuscrite / au cachet, souligné d'un filet. */
 .sig .sbox{height:52px;border-bottom:.6px solid var(--muted);margin-top:6px}
 .foot{position:absolute;left:48px;right:48px;bottom:24px;border-top:1px solid var(--olive);padding-top:7px;color:var(--muted);font-size:10px;line-height:1.6;text-align:center}
 .noprint{max-width:820px;margin:0 auto 14px}
 button{background:var(--lime);color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
 @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;min-height:100vh}.noprint{display:none}.foot{position:fixed}}${arCss}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
 <div class="top">
   <img src="${esc(firmLogoPath(firm))}" alt="logo">
   <div class="firm">
     <span class="fname">${esc(firm.name.toUpperCase())}</span>
     ${firmDescriptor(firm) ? `<span class="fdesc">${esc(firmDescriptor(firm))}</span>` : ""}
     ${firmIdentifiersLine(firm) ? `<span class="fids">${esc(firmIdentifiersLine(firm))}</span>` : ""}
     ${firmContactLine(firm) ? `<span class="fids">${esc(firmContactLine(firm))}</span>` : ""}
   </div>
 </div>
 ${!rtl && d.rightHeader ? `<div class="rh">${esc(d.rightHeader)}</div>` : ""}
 ${meta}
 <h1 class="title">${esc(c.heading.toUpperCase())}</h1>
 ${c.subheading ? `<p class="sub">${esc(c.subheading)}</p>` : ""}
 <div class="accentbar"></div>
 <div class="divider"></div>
 ${parts.join("\n ")}
 <div class="closing">
 ${c.faitA ? `<div class="faitA">${esc(c.faitA)}</div>` : ""}
 ${c.legalNote ? `<div class="note">${esc(c.legalNote)}</div>` : ""}
 ${sig}
 </div>
 <div class="foot">${esc(firmIdentifiersLine(firm))}<br>${esc(firmContactLine(firm))}</div>
</div></body></html>`;
}

/** Nom de fichier normalisé : <Titre>_<NOM>.pdf, sans espace parasite. */
export function legalFileName(title: string, name: string): string {
  const t = title
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const n = name.replace(/\s+/g, "_");
  return `${t}_${n}.pdf`;
}

/* ------------------------------------------------------------------ LaTeX (documents RH) ------------------------------------------------------------------ */
/**
 * Export LaTeX des DOCUMENTS RH (attestations, contrats, kits…). Indépendant du bulletin de paie :
 * ce gabarit est piloté par `firm.rh_template_latex` (Paramètres → « Template LaTeX Document RH »).
 * Sans template, un gabarit LaTeX par défaut est généré à partir du document, aux couleurs de la
 * société. AUCUN impact sur le template LaTeX du bulletin (`firm.payslip_template_latex`).
 */
function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/—/g, "--");
}
/** Texte balisé `**gras**` / `*italique*` → LaTeX (échappé). */
function runsToLatex(s: string): string {
  return parseRuns(s)
    .map((r) => {
      const t = escapeLatex(r.t);
      return r.b ? `\\textbf{${t}}` : r.i ? `\\textit{${t}}` : t;
    })
    .join("");
}
/**
 * Rend les blocs d'un LegalDoc en corps LaTeX (paragraphes, listes, tableaux ; `**gras**` rendus,
 * contenu ÉCHAPPÉ). `colored` = titres/en-têtes de tableau aux couleurs `deep`/`olive` (définies par
 * le gabarit par défaut) ; sinon rendu NEUTRE, sans dépendance couleur — utilisable dans n'importe
 * quel préambule (dont un `\usepackage{mbd-style}` maison) via le token `{{doc.body}}`.
 */
function rhBlocksToLatex(d: LegalDoc, colored: boolean): string {
  const hColor = colored ? "\\color{deep}" : "";
  return d.blocks
    .map((b) => {
      switch (b.k) {
        case "h": return `\\vspace{6pt}\\noindent{\\bfseries${hColor} ${runsToLatex(b.t)}}\\par\\vspace{3pt}`;
        case "p": return `\\noindent ${runsToLatex(b.t)}\\par\\vspace{5pt}`;
        case "center": return `\\begin{center}${b.strong ? "\\bfseries " : ""}${runsToLatex(b.t)}\\end{center}`;
        case "ul": return `\\begin{itemize}\\setlength{\\itemsep}{1pt}\n${b.items.map((i) => `\\item ${runsToLatex(i)}`).join("\n")}\n\\end{itemize}`;
        case "check": return `\\begin{itemize}\\setlength{\\itemsep}{1pt}\n${b.items.map((i, idx) => `\\item[${b.checked?.[idx] ? "$\\boxtimes$" : "$\\square$"}] ${runsToLatex(i)}`).join("\n")}\n\\end{itemize}`;
        case "sp": return `\\vspace{${Math.round((b.h ?? 8) / 2)}pt}`;
        case "table": {
          const cols = b.head?.length ?? b.rows[0]?.length ?? 1;
          const spec = `|${"l|".repeat(cols)}`;
          const head = b.head
            ? colored
              ? `\\rowcolor{olive}${b.head.map((h) => `\\textcolor{white}{\\textbf{${escapeLatex(h)}}}`).join(" & ")}\\\\\\hline\n`
              : `${b.head.map((h) => `\\textbf{${escapeLatex(h)}}`).join(" & ")}\\\\\\hline\n`
            : "";
          const rows = b.rows.map((r) => `${r.map(escapeLatex).join(" & ")}\\\\\\hline`).join("\n");
          return `\\vspace{4pt}\\noindent\\begin{tabular}{${spec}}\\hline\n${head}${rows}\n\\end{tabular}\\vspace{4pt}`;
        }
        default: return "";
      }
    })
    .join("\n");
}

/** Construit le source LaTeX d'un document RH (avec ou sans template société). PURE. */
export function buildRhDocLatex(firm: Firm, raw: LegalDoc, employee: Employee | null, template?: string): string {
  const d = sanitizeLegalDoc(raw);
  const sig = d.signatures?.[0];
  const today = dateFr(new Date().toISOString());

  // 1) Template société : substitution de tokens. Les valeurs de DONNÉES sont ÉCHAPPÉES pour LaTeX
  //    (un « 25 % » deviendrait sinon un commentaire et casserait la compilation) ; seul `{{doc.body}}`
  //    est déjà du LaTeX prêt à l'emploi (échappé bloc par bloc). Le code LaTeX du template lui-même
  //    n'est jamais touché.
  if (template && template.trim()) {
    const E = escapeLatex;
    const map: Record<string, string> = {
      "firm.name": E(firm.name),
      "firm.ice": E(firm.ice ?? ""),
      "firm.if_fiscal": E(firm.if_fiscal ?? ""),
      "firm.rc": E(firm.rc ?? ""),
      "firm.cnss_affiliation": E(firm.cnss_affiliation ?? ""),
      "firm.address": E(firm.address ?? ""),
      "firm.city": E(firm.city ?? ""),
      "employee.first_name": E(employee?.first_name ?? ""),
      "employee.last_name": E(employee?.last_name ?? ""),
      "employee.cin": E(employee?.cin ?? ""),
      "employee.cnss_number": E(employee?.cnss_number ?? ""),
      "employee.position": E(employee?.position ?? ""),
      "employee.hire_date": E(employee?.hire_date ? dateFr(employee.hire_date) : ""),
      "doc.title": E(d.heading),
      "doc.body": rhBlocksToLatex(d, false), // déjà échappé (runsToLatex), neutre en couleurs
      "doc.faitA": E(d.faitA ?? ""),
      "signatory.name": E(sig?.title ?? ""),
      "signatory.role": E(sig?.lines?.[0] ?? ""),
      date: E(today),
    };
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? `??${k}??`);
  }

  // 2) Gabarit LaTeX par défaut, aux couleurs de la société.
  const pal = paletteForFirm(firm.brand_color);
  const rgb = ([r, g, b]: RGB) => `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
  const body = rhBlocksToLatex(d, true);
  const sigTex = sig
    ? `\\vspace{20pt}\\noindent\\textbf{${escapeLatex(sig.title)}}\\\\ ${sig.lines.map(escapeLatex).join("\\\\ ")}${sig.caption ? `\\\\ \\textit{\\footnotesize ${escapeLatex(sig.caption)}}` : ""}`
    : "";

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=2.2cm]{geometry}
\\usepackage{xcolor,colortbl,array,amssymb}
\\definecolor{deep}{RGB}{${rgb(pal.deep)}}
\\definecolor{olive}{RGB}{${rgb(pal.olive)}}
\\begin{document}\\pagestyle{empty}
\\noindent{\\Large\\bfseries\\color{deep} ${escapeLatex(firm.name.toUpperCase())}}\\\\{\\small ICE : ${escapeLatex(firm.ice ?? "--")} \\quad IF : ${escapeLatex(firm.if_fiscal ?? "--")} \\quad RC : ${escapeLatex(firm.rc ?? "--")} \\quad CNSS : ${escapeLatex(firm.cnss_affiliation ?? "--")}}
\\vspace{4pt}\\hrule\\vspace{14pt}
\\begin{center}{\\Large\\bfseries\\color{deep} ${escapeLatex(d.heading.toUpperCase())}}\\end{center}
\\vspace{10pt}
${body}
\\vspace{10pt}
${d.faitA ? `\\begin{center}\\textbf{${escapeLatex(d.faitA)}}\\end{center}` : ""}
${sigTex}
\\end{document}
`;
}

/** Télécharge le source LaTeX (.tex) d'un document RH. */
export function downloadRhDocLatex(firm: Firm, doc: LegalDoc, employee: Employee | null, template?: string, fileBase?: string): void {
  const tex = buildRhDocLatex(firm, doc, employee, template);
  const blob = new Blob([tex], { type: "text/x-tex" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = (fileBase ?? doc.fileTitle ?? "document")
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  a.download = `${base || "document"}.tex`;
  a.click();
  URL.revokeObjectURL(url);
}
