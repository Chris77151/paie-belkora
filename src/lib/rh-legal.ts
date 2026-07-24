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
import type { Firm } from "@/data/types";
import { dateFr } from "./format";
import { firmIdentityClause, firmLegalLine as firmLegalLineCanonical } from "./firm-legal";
import { paletteForFirm, type PayslipPalette, type RGB } from "./brand-color";

/* Couleurs de marque — dérivées de la société (firm.brand_color) au début de chaque rendu,
 * comme payslip.ts. Sans couleur de marque définie, on garde EXACTEMENT le vert Miya d'origine.
 * `usePalette(firm)` réassigne LIME/OLIVE/INK/VERT_FONCE/MUTED : les usages `...LIME` restent inchangés. */
export let LIME: RGB = paletteForFirm(undefined).lime; // #8DB94E par défaut
export let OLIVE: RGB = paletteForFirm(undefined).olive;
export let INK: RGB = paletteForFirm(undefined).ink;
export let VERT_FONCE: RGB = paletteForFirm(undefined).deep;
export let MUTED: RGB = paletteForFirm(undefined).muted;
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
export const PH = "……………………";

/** Valeur réelle ou placeholder — sans jamais inventer. */
export function val(v: string | number | undefined | null): string {
  const s = (v ?? "").toString().trim();
  return s.length ? s : PH;
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

/** Pied de page légal — délègue à la source unique (firm-legal.ts). */
export function firmLegalLine(firm: Firm): string {
  return firmLegalLineCanonical(firm, { includeAddress: true });
}

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

/* ------------------------------------------------------------------ logo ------------------------------------------------------------------ */
async function loadLogo(path?: string): Promise<{ data: string; fmt: string } | null> {
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

/* ------------------------------------------------------------------ rendu PDF (multi-pages) ------------------------------------------------------------------ */
const W = 210;
const H = 297;
const M = 18;
const CW = W - 2 * M;
const FOOT = 20; // hauteur réservée au pied de page
const PT2MM = 0.3528;

interface Ctx {
  doc: jsPDF;
  firm: Firm;
  logo: { data: string; fmt: string } | null;
  y: number;
  page: number;
}

function lineHeight(fs: number, factor = 1.32): number {
  return fs * PT2MM * factor;
}

function runningHeader(ctx: Ctx) {
  const { doc, firm } = ctx;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text(firm.name.toUpperCase(), M, 12);
  doc.setDrawColor(...OLIVE).setLineWidth(0.3).line(M, 14, W - M, 14);
  ctx.y = 20;
}

function fullHeader(ctx: Ctx) {
  const { doc, firm, logo } = ctx;
  if (logo) {
    try {
      doc.addImage(logo.data, logo.fmt, M, 11, 34, 17);
    } catch {
      /* ignore */
    }
  }
  const hx = logo ? M + 40 : M;
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
  doc.text(firm.name.toUpperCase(), hx, 17);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(110, 110, 110);
  if (firm.address) doc.text(firm.address, hx, 22);
  doc.text(
    [firm.ice && `ICE : ${firm.ice}`, firm.if_fiscal && `IF : ${firm.if_fiscal}`].filter(Boolean).join("   ·   "),
    hx,
    26,
  );
  doc.setDrawColor(...OLIVE).setLineWidth(0.5).line(M, 31, W - M, 31);
  ctx.y = 38;
}

function footer(ctx: Ctx, totalPages: number) {
  const { doc, firm } = ctx;
  doc.setDrawColor(210, 214, 204).setLineWidth(0.3).line(M, H - 15, W - M, H - 15);
  doc.setFont("helvetica", "italic").setFontSize(6.5).setTextColor(140, 140, 140);
  doc.text(firmLegalLine(firm), W / 2, H - 11, { align: "center", maxWidth: CW });
  doc.setFont("helvetica", "normal").setTextColor(...LIME).setFontSize(6.5);
  doc.text("Document généré par Belkora Paie & RH — référentiel Maroc.", M, H - 7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Page ${ctx.page} / ${totalPages}`, W - M, H - 7, { align: "right" });
}

function ensure(ctx: Ctx, need: number) {
  if (ctx.y + need > H - FOOT) {
    ctx.doc.addPage();
    ctx.page += 1;
    runningHeader(ctx);
  }
}

function drawParagraph(ctx: Ctx, text: string, fs = 10, gap = 2.4) {
  const { doc } = ctx;
  doc.setFont("helvetica", "normal").setFontSize(fs).setTextColor(...INK);
  const lines = doc.splitTextToSize(text, CW) as string[];
  const lh = lineHeight(fs);
  ensure(ctx, lines.length * lh);
  // justification manuelle ligne par ligne (jsPDF justifie mal les blocs multi-pages)
  doc.text(lines, M, ctx.y, { align: "justify", maxWidth: CW, lineHeightFactor: 1.32 });
  ctx.y += lines.length * lh + gap;
}

function drawList(ctx: Ctx, items: string[], marker: (i: number) => string, fs = 10) {
  const { doc } = ctx;
  doc.setFont("helvetica", "normal").setFontSize(fs).setTextColor(...INK);
  const lh = lineHeight(fs);
  const indent = 6;
  items.forEach((it, idx) => {
    const lines = doc.splitTextToSize(it, CW - indent) as string[];
    ensure(ctx, lines.length * lh);
    doc.text(marker(idx), M, ctx.y);
    doc.text(lines, M + indent, ctx.y, { maxWidth: CW - indent, lineHeightFactor: 1.32 });
    ctx.y += lines.length * lh + 1.2;
  });
  ctx.y += 1.4;
}

function drawSignatures(ctx: Ctx, cols: SignatureCol[]) {
  const { doc } = ctx;
  ensure(ctx, 44);
  const startY = ctx.y + 2;
  const colW = cols.length === 2 ? (CW - 8) / 2 : CW * 0.55;
  cols.forEach((c, idx) => {
    const x = idx === 0 ? M : M + colW + 8;
    let yy = startY;
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...VERT_FONCE);
    doc.text(c.title, x, yy);
    yy += 5;
    doc.setDrawColor(...LIME).setLineWidth(0.6).line(x, yy - 1.5, x + 22, yy - 1.5);
    yy += 2;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
    for (const l of c.lines) {
      const wr = doc.splitTextToSize(l, colW) as string[];
      doc.text(wr, x, yy, { lineHeightFactor: 1.3 });
      yy += wr.length * lineHeight(9) + 1;
    }
    yy += 12;
    doc.setDrawColor(...MUTED).setLineWidth(0.4).line(x, yy, x + colW * 0.9, yy);
    yy += 3.5;
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
    if (c.caption) {
      const cap = doc.splitTextToSize(c.caption, colW) as string[];
      doc.text(cap, x, yy, { lineHeightFactor: 1.25 });
    }
  });
  ctx.y = startY + 44;
}

export async function renderLegalPdf(firm: Firm, d: LegalDoc): Promise<jsPDF> {
  usePalette(firm); // couleurs dérivées de la société (défaut = vert Miya)
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: d.fileTitle });
  const logo = await loadLogo(firm.logo_path || "/logo-miya.png");
  const ctx: Ctx = { doc, firm, logo, y: 0, page: 1 };

  fullHeader(ctx);

  // « Ville, le … » à droite (courriers)
  if (d.rightHeader) {
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
    doc.text(d.rightHeader, W - M, ctx.y, { align: "right" });
    ctx.y += 7;
  }

  // Lignes méta (destinataire, chantier, mode de remise…)
  if (d.meta?.length) {
    doc.setFontSize(9.5);
    for (const m of d.meta) {
      ensure(ctx, 6);
      doc.setFont("helvetica", "bold").setTextColor(...INK);
      const lbl = `${m.label} : `;
      doc.text(lbl, M, ctx.y);
      const lblW = doc.getTextWidth(lbl);
      doc.setFont("helvetica", "normal");
      const wr = doc.splitTextToSize(m.value, CW - lblW) as string[];
      doc.text(wr, M + lblW, ctx.y, { lineHeightFactor: 1.3 });
      ctx.y += Math.max(1, wr.length) * lineHeight(9.5) + 1.5;
    }
    ctx.y += 2;
  }

  // Titre encadré centré
  ensure(ctx, 20);
  ctx.y += 3;
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...VERT_FONCE);
  doc.text(d.heading, W / 2, ctx.y, { align: "center" });
  ctx.y += 6;
  if (d.subheading) {
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED);
    const sub = doc.splitTextToSize(d.subheading, CW) as string[];
    doc.text(sub, W / 2, ctx.y, { align: "center", lineHeightFactor: 1.25 });
    ctx.y += sub.length * lineHeight(9.5);
  }
  doc.setDrawColor(...LIME).setLineWidth(1).line(W / 2 - 22, ctx.y, W / 2 + 22, ctx.y);
  ctx.y += 7;

  // Corps
  for (const b of d.blocks) {
    switch (b.k) {
      case "h": {
        ctx.y += 2;
        ensure(ctx, 8);
        doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...VERT_FONCE);
        const hl = doc.splitTextToSize(b.t, CW) as string[];
        doc.text(hl, M, ctx.y, { lineHeightFactor: 1.25 });
        ctx.y += hl.length * lineHeight(10.5) + 1.6;
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
        doc.setFont("helvetica", b.strong ? "bold" : "normal").setFontSize(b.strong ? 11 : 10).setTextColor(...INK);
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
          margin: { left: M, right: M, top: 20 },
          head: b.head ? [b.head] : undefined,
          body: b.rows,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.2, cellPadding: 1.5, textColor: INK, lineColor: [210, 214, 204], lineWidth: 0.15, overflow: "linebreak" },
          headStyles: { fillColor: VERT_FONCE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.2 },
          columnStyles: colStyles,
        });
        ctx.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
        ctx.page = doc.getNumberOfPages(); // autoTable a pu ajouter des pages
        break;
      }
    }
  }

  // Fait à … + note légale
  if (d.faitA) {
    ctx.y += 4;
    ensure(ctx, 14);
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...INK);
    doc.text(d.faitA, W / 2, ctx.y, { align: "center" });
    ctx.y += 5;
    if (d.legalNote) {
      doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...MUTED);
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
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    footer({ ...ctx, page: p }, total);
  }
  return doc;
}

/* ------------------------------------------------------------------ rendu HTML imprimable ------------------------------------------------------------------ */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
        parts.push(`<p>${esc(b.t)}</p>`);
        break;
      case "ul":
        parts.push(`<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
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
 *{box-sizing:border-box;font-family:"IBM Plex Sans",Arial,sans-serif}
 body{margin:0;padding:24px;background:#f4f5f2;color:var(--ink)}
 .sheet{max-width:820px;margin:auto;background:#fff;padding:40px 48px 64px;border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);position:relative}
 .top{display:flex;gap:16px;align-items:center;border-bottom:1.5px solid var(--olive);padding-bottom:12px}
 .top img{height:50px;object-fit:contain}
 .firm{font-weight:700;font-size:15px}
 .firm small{display:block;font-weight:400;color:#888;font-size:11px;margin-top:2px}
 .rh{text-align:right;font-size:13px;margin-top:12px}
 .meta{font-size:13px;margin-top:10px;line-height:1.6}
 .meta b{color:var(--ink)}
 h1.title{margin:26px auto 4px;text-align:center;color:var(--vf);font-size:22px}
 .sub{text-align:center;color:var(--muted);font-size:13px;margin:0 auto}
 .divider{width:70px;height:2.5px;background:var(--lime);margin:10px auto 22px;border-radius:2px}
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
 .sigs{display:flex;gap:32px;margin-top:24px}
 .sigs.two .sig{flex:1}.sigs.one .sig{width:60%}
 .sig b{color:var(--vf);font-size:13px}
 .sig .rule{width:26px;height:2px;background:var(--lime);margin:4px 0 8px}
 .sig div{font-size:12.5px;line-height:1.5}
 .sig .sline{border-top:.5px solid var(--muted);margin-top:44px;width:90%}
 .sig small{color:var(--muted);font-size:10px}
 .foot{position:absolute;left:48px;right:48px;bottom:24px;border-top:1px solid #e0e4da;padding-top:6px;color:#999;font-size:10px;font-style:italic;text-align:center}
 .foot .gen{color:var(--lime);font-style:normal}
 .noprint{max-width:820px;margin:0 auto 14px}
 button{background:var(--lime);color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
 @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0}.noprint{display:none}.foot{position:fixed}}${arCss}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
 <div class="top">
   <img src="${firm.logo_path || "/logo-miya.png"}" alt="logo">
   <div class="firm">${esc(firm.name.toUpperCase())}<small>${[firm.address, firm.ice && "ICE : " + firm.ice, firm.if_fiscal && "IF : " + firm.if_fiscal].filter((x): x is string => Boolean(x)).map(esc).join(" · ")}</small></div>
 </div>
 ${!rtl && d.rightHeader ? `<div class="rh">${esc(d.rightHeader)}</div>` : ""}
 ${meta}
 <h1 class="title">${esc(c.heading)}</h1>
 ${c.subheading ? `<p class="sub">${esc(c.subheading)}</p>` : ""}
 <div class="divider"></div>
 ${parts.join("\n ")}
 ${c.faitA ? `<div class="faitA">${esc(c.faitA)}</div>` : ""}
 ${c.legalNote ? `<div class="note">${esc(c.legalNote)}</div>` : ""}
 ${sig}
 <div class="foot">${esc(firmLegalLine(firm))}<br><span class="gen">Document généré par Belkora Paie &amp; RH — référentiel Maroc.</span></div>
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
