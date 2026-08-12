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
let LIME: RGB = paletteForFirm(undefined).lime; // #8DB94E par défaut
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

export async function renderLegalPdf(firm: Firm, d: LegalDoc): Promise<jsPDF> {
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

  // Fait à … + note légale
  if (d.faitA) {
    ctx.y += 4;
    ensure(ctx, 14);
    doc.setFont(FONT, "bold").setFontSize(10.5).setTextColor(...INK);
    doc.text(d.faitA, W / 2, ctx.y, { align: "center" });
    ctx.y += 5;
    if (d.legalNote) {
      doc.setFont(FONT, "italic").setFontSize(8).setTextColor(...MUTED);
      const nl = doc.splitTextToSize(d.legalNote, CW) as string[];
      doc.text(nl, W / 2, ctx.y, { align: "center", lineHeightFactor: 1.25 });
      ctx.y += nl.length * lineHeight(8) + 2;
    }
  }

  // Signatures
  if (d.signatures?.length) {
    ctx.y += 4;
    drawSignatures(ctx, d.signatures);
  }

  // Pieds de page (numérotation a posteriori) — total réel (autoTable a pu ajouter des pages)
  paintFooters(doc, firm, pal);
  return doc;
}

/* ------------------------------------------------------------------ rendu HTML imprimable ------------------------------------------------------------------ */
const esc = escapeHtml;

export function renderLegalHtml(firm: Firm, d: LegalDoc, lang: "fr" | "ar" = "fr"): string {
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
          (c) =>
            `<div class="sig"><b>${esc(c.title)}</b><div class="rule"></div>${c.lines
              .map((l) => `<div>${esc(l)}</div>`)
              .join("")}<div class="sline"></div>${
              c.caption ? `<small>${esc(c.caption)}</small>` : ""
            }</div>`,
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
 .sheet{max-width:820px;margin:auto;background:#fff;padding:40px 48px 64px;border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);position:relative}
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
 .faitA{text-align:center;font-weight:700;font-size:14px;margin:26px 0 4px}
 .note{text-align:center;font-style:italic;color:var(--muted);font-size:11px;margin-bottom:14px}
 .sigs{display:flex;gap:32px;margin-top:30px}
 .sigs.two .sig{flex:1}
 /* Signataire unique : bloc aligné à droite, comme le gabarit de référence. */
 .sigs.one{justify-content:flex-end}.sigs.one .sig{width:45%}
 .sig b{font-size:13.5px}
 .sig .rule{display:none}
 .sig div{font-size:12.5px;line-height:1.55}
 .sig .sline{border-top:.5px solid var(--muted);margin-top:42px;width:100%}
 .sig small{color:var(--muted);font-size:10.5px;font-style:italic}
 .foot{position:absolute;left:48px;right:48px;bottom:24px;border-top:1px solid var(--olive);padding-top:7px;color:var(--muted);font-size:10px;line-height:1.6;text-align:center}
 .noprint{max-width:820px;margin:0 auto 14px}
 button{background:var(--lime);color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
 @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0}.noprint{display:none}.foot{position:fixed}}${arCss}
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
 ${c.faitA ? `<div class="faitA">${esc(c.faitA)}</div>` : ""}
 ${c.legalNote ? `<div class="note">${esc(c.legalNote)}</div>` : ""}
 ${sig}
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
