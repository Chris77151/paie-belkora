/**
 * Documents RH conformes — Famille A du skill « documents-rh-conformes », porté au navigateur.
 *
 * Trois documents attestatifs officiels du Groupe Belkora générés depuis les données RÉELLES
 * du store local (Employee + Firm), avec la même règle d'or que le skill : ZÉRO INVENTION.
 * Tout champ absent (CIN, CNSS, date d'embauche, salaire, date de fin, civilité) est rendu en
 * placeholder pointillé visible et listé dans `missingFields()` — jamais fabriqué.
 *
 * Gabarit calqué sur payslip.ts : en-tête logo + bloc légal, titre encadré, corps justifié,
 * « Fait à … le … », bloc signature, pied de page légal (ICE/IF/RC/CNSS). Aux couleurs du logo Miya.
 * Rendus : PDF (jsPDF) et HTML imprimable. Les fonctions de texte sont PURES (testables).
 */
import { jsPDF } from "jspdf";
import type { Employee, Firm } from "@/data/types";
import { dateFr } from "./format";
import { firmDescriptor, firmIdentityClause, firmLegalLine } from "./firm-legal";

/* Couleurs de marque (logo Miya) — cohérentes avec payslip.ts */
const LIME: [number, number, number] = [141, 185, 78]; // #8DB94E
const OLIVE: [number, number, number] = [139, 162, 95];
const INK: [number, number, number] = [40, 52, 44];

export type RhDocType =
  | "attestation-travail"
  | "attestation-salaire"
  | "certificat-travail"
  | "attestation-stage";

export const RH_DOC_TYPES: { value: RhDocType; label: string; hint: string }[] = [
  { value: "attestation-travail", label: "Attestation de travail", hint: "Emploi en cours" },
  { value: "attestation-salaire", label: "Attestation de salaire", hint: "Emploi + rémunération" },
  { value: "certificat-travail", label: "Certificat de travail", hint: "Salarié sorti des effectifs" },
  { value: "attestation-stage", label: "Attestation de stage", hint: "Stagiaire (PFE / formation) — en cours ou achevé" },
];

export type Civility = "M." | "Mme" | null;

/** Vue d'un document RH : le salarié + la société + les compléments saisis (jamais devinés). */
export interface RhDocView {
  firm: Firm;
  employee: Employee;
  type: RhDocType;
  /** M. / Mme — sinon accords neutres « (e) ». */
  civility?: Civility;
  /** Défaut : employee.hire_date. */
  hireDate?: string;
  /** Défaut : employee.cnss_number. */
  cnss?: string;
  /** Attestation de salaire : texte libre, ex. « 4 500,00 DH net ». */
  salary?: string;
  /** Certificat de travail : date de sortie. Attestation de stage : date de fin (si stage achevé). */
  endDate?: string;
  /** Attestation de stage : date de début du stage. */
  stageStart?: string;
  /** Attestation de stage : nature (ex. « stage de fin d'études (PFE) », « stage d'application »). */
  stageType?: string;
  /** Attestation de stage : formation / diplôme préparé (ex. « Master en Business Administration »). */
  formation?: string;
  /** Attestation de stage : durée prévue (ex. « six (6) mois »). */
  stageDuration?: string;
  /** Attestation de stage : missions confiées (texte libre, après « s'est vu confier »). Optionnel. */
  stageMissions?: string;
  /** Attestation de stage : stage toujours en cours (défaut) ou achevé (→ endDate). */
  stageOngoing?: boolean;
  /** Date de délivrance (défaut : aujourd'hui, fixé par la page). */
  issueDate: string;
  /** Défaut : firm.city. */
  city?: string;
  signatoryName?: string;
  signatoryRole?: string;
}

/** Placeholder pointillé visible (à compléter à la main) — jamais une donnée inventée. */
export const PH = "……………………";

export const DOC_TITLE: Record<RhDocType, string> = {
  "attestation-travail": "ATTESTATION DE TRAVAIL",
  "attestation-salaire": "ATTESTATION DE SALAIRE",
  "certificat-travail": "CERTIFICAT DE TRAVAIL",
  "attestation-stage": "ATTESTATION DE STAGE",
};

/* ---- accords de civilité ---- */
interface Accords {
  civilite: string;
  soussigne: string;
  employe: string;
  immatricule: string;
  interesse: string;
}
function accords(civ: Civility, signatoryRoleFem: boolean): Accords {
  const fem = civ === "Mme";
  const unknown = civ !== "M." && civ !== "Mme";
  return {
    civilite: unknown ? "Monsieur / Madame" : fem ? "Madame" : "Monsieur",
    soussigne: signatoryRoleFem ? "soussignée" : "soussigné",
    employe: unknown ? "employé(e)" : fem ? "employée" : "employé",
    immatricule: unknown ? "immatriculé(e)" : fem ? "immatriculée" : "immatriculé",
    interesse: unknown ? "l'intéressé(e)" : fem ? "l'intéressée" : "l'intéressé",
  };
}

function fullName(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim().toUpperCase();
}

/** Valeur réelle ou placeholder — sans jamais inventer. */
function val(v: string | undefined | null): string {
  const s = (v ?? "").trim();
  return s.length ? s : PH;
}

/**
 * Corps de l'ATTESTATION DE STAGE, calqué sur le modèle officiel MBD (attestation-stage-assia).
 * Intro à identité légale complète, corps « effectue depuis le … un stage … formation … durée »,
 * paragraphe missions (optionnel), clôture soutenance. Fonction PURE.
 */
function stageParagraphs(v: RhDocView): string[] {
  const e = v.employee;
  const firmName = v.firm.name.toUpperCase();
  const roleFem = /gérante|directrice|responsable/i.test(v.signatoryRole ?? v.firm.signatory_role ?? "");
  const a = accords(v.civility ?? null, roleFem);

  const sig = val(v.signatoryName ?? v.firm.signatory_name);
  const role = val(v.signatoryRole ?? v.firm.signatory_role);
  const nom = fullName(e);
  const cin = val(e.cin);
  const debut = v.stageStart?.trim() ? dateFr(v.stageStart) : PH;
  const typeStage = val(v.stageType);
  const formation = val(v.formation);
  const duree = val(v.stageDuration);

  // Identité légale de l'entité (source unique firm-legal.ts ; champs réels, rien d'inventé).
  const legal = firmIdentityClause(v.firm);

  const intro = `Je ${a.soussigne} ${sig}, agissant en qualité de ${role} de la société ${firmName}${
    legal ? ", " + legal : ""
  }, atteste par la présente que :`;

  const statut =
    v.stageOngoing === false
      ? v.endDate?.trim()
        ? ` Ce stage s'est achevé le ${dateFr(v.endDate)}.`
        : ""
      : " Ce stage est, à ce jour, toujours en cours.";

  const identite =
    `${a.civilite} ${nom}, titulaire de la carte nationale d'identité n° ${cin}, effectue, depuis le ${debut}, ` +
    `un ${typeStage} au sein de notre société, dans le cadre de sa formation en ${formation}, ` +
    `pour une durée prévue de ${duree}.${statut}`;

  const paras: string[] = [intro, identite];

  if (v.stageMissions?.trim()) {
    paras.push(`Dans le cadre de ce stage, ${a.interesse} ${v.stageMissions.trim()}`);
  }

  const soutenance = /fin d'|pfe|master|licence|mémoire|memoire/i.test(`${typeStage} ${formation}`)
    ? "pour les besoins de sa soutenance et "
    : "";
  paras.push(
    `La présente attestation est délivrée à ${a.interesse}, à sa demande, ${soutenance}pour servir et faire valoir ce que de droit.`,
  );
  return paras;
}

/**
 * Corps-type du document (paragraphes), calqué sur references/modeles-documents.md du skill.
 * Fonction PURE — même sortie pour PDF et HTML, et testable.
 */
export function bodyParagraphs(v: RhDocView): string[] {
  if (v.type === "attestation-stage") return stageParagraphs(v);

  const e = v.employee;
  const firmName = v.firm.name.toUpperCase();
  const roleFem = /gérante|directrice|responsable/i.test(v.signatoryRole ?? v.firm.signatory_role ?? "");
  const a = accords(v.civility ?? null, roleFem);

  const sig = val(v.signatoryName ?? v.firm.signatory_name);
  const role = val(v.signatoryRole ?? v.firm.signatory_role);
  const nom = fullName(e);
  const cin = val(e.cin);
  const cnss = val(v.cnss ?? e.cnss_number);
  const poste = val(e.position);
  const embauche = v.hireDate?.trim() ? dateFr(v.hireDate) : e.hire_date ? dateFr(e.hire_date) : PH;

  const intro =
    v.type === "certificat-travail"
      ? `Je ${a.soussigne} ${sig}, ${role} de la société ${firmName}, certifie par la présente que :`
      : `Je ${a.soussigne} ${sig}, ${role} de la société ${firmName}, atteste par la présente que :`;

  const identite = `${a.civilite} ${nom}, titulaire de la carte d'identité nationale n° ${cin}, ${a.immatricule} à la CNSS sous le n° ${cnss},`;

  const paras: string[] = [intro, identite];

  if (v.type === "certificat-travail") {
    const fin = v.endDate?.trim() ? dateFr(v.endDate) : PH;
    paras.push(`a été ${a.employe} au sein de notre entreprise en qualité de ${poste}, du ${embauche} au ${fin}.`);
    paras.push("Le présent certificat lui est délivré pour servir et faire valoir ce que de droit, libre de tout engagement.");
  } else {
    let emploi = `est ${a.employe} au sein de notre entreprise en qualité de ${poste}, et ce depuis le ${embauche}`;
    if (v.type === "attestation-salaire") {
      emploi += `, et perçoit à ce titre une rémunération mensuelle de ${val(v.salary)}`;
    }
    paras.push(emploi + ".");
    paras.push(`En foi de quoi, la présente attestation est délivrée à ${a.interesse} pour servir et faire valoir ce que de droit.`);
  }
  return paras;
}

/**
 * Champs rendus en placeholder (à compléter à la main) — transparence « zéro invention ».
 * Fonction PURE.
 */
export function missingFields(v: RhDocView): string[] {
  const e = v.employee;
  const out: string[] = [];
  if (!(v.civility === "M." || v.civility === "Mme")) out.push("Civilité (accords « (e) » par défaut)");
  if (!e.cin?.trim()) out.push("N° CIN");

  if (v.type === "attestation-stage") {
    if (!v.stageStart?.trim()) out.push("Date de début du stage");
    if (!v.stageType?.trim()) out.push("Type de stage");
    if (!v.formation?.trim()) out.push("Formation / diplôme");
    if (!v.stageDuration?.trim()) out.push("Durée prévue du stage");
    if (v.stageOngoing === false && !v.endDate?.trim()) out.push("Date de fin du stage");
    if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire");
    if (!(v.signatoryRole ?? v.firm.signatory_role)?.trim()) out.push("Qualité du signataire");
    return out;
  }

  if (!(v.cnss ?? e.cnss_number)?.trim()) out.push("N° CNSS");
  if (!e.position?.trim()) out.push("Poste");
  if (!(v.hireDate ?? e.hire_date)?.trim()) out.push("Date d'embauche");
  if (v.type === "attestation-salaire" && !v.salary?.trim()) out.push("Rémunération mensuelle");
  if (v.type === "certificat-travail" && !v.endDate?.trim()) out.push("Date de fin de contrat");
  if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire");
  if (!(v.signatoryRole ?? v.firm.signatory_role)?.trim()) out.push("Qualité du signataire");
  return out;
}

export function docFileName(v: RhDocView): string {
  const t = DOC_TITLE[v.type].replace(/ /g, "_");
  const nom = `${v.employee.first_name}_${v.employee.last_name}`.replace(/\s+/g, "_");
  return `${t}_${nom}.pdf`;
}

/* -------------------------------------------------- logo -------------------------------------------------- */
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

/** Pied de page légal — source unique (ICE · IF · RC · Patente · CNSS · Tél · E-mail · siège). */
function legalFooterLine(firm: Firm): string {
  return firmLegalLine(firm, { includeAddress: true });
}

/* -------------------------------------------------- PDF -------------------------------------------------- */
export async function buildRhDocPdf(v: RhDocView): Promise<jsPDF> {
  const { firm } = v;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 20;
  const full = W - 2 * M;

  // En-tête : logo + société
  const logo = await loadLogo(firm.logo_path || "/logo-miya.png");
  if (logo) {
    try { doc.addImage(logo.data, logo.fmt, M, 12, 38, 19); } catch { /* ignore */ }
  }
  const headX = logo ? M + 44 : M;
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
  doc.text(firm.name.toUpperCase(), headX, 17.5);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(110, 110, 110);
  const descr = firmDescriptor(firm);
  if (descr) doc.text(descr, headX, 21.5);
  const legalLines = doc.splitTextToSize(firmLegalLine(firm, { includeAddress: true }), W - headX - M);
  doc.text(legalLines, headX, descr ? 25 : 22);

  doc.setDrawColor(...OLIVE).setLineWidth(0.5).line(M, 34, W - M, 34);

  // Titre encadré
  doc.setDrawColor(...OLIVE).setLineWidth(0.4);
  const titleW = 110;
  doc.rect((W - titleW) / 2, 42, titleW, 12);
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
  doc.text(DOC_TITLE[v.type], W / 2, 50, { align: "center" });

  // Corps justifié
  let y = 70;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...INK);
  for (const p of bodyParagraphs(v)) {
    const lines = doc.splitTextToSize(p, full) as string[];
    doc.text(lines, M, y, { align: "justify", maxWidth: full, lineHeightFactor: 1.5 });
    y += lines.length * 11 * 0.5 * 1.5 + 5;
  }

  // Fait à … le …
  y = Math.max(y + 8, 150);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...INK);
  const ville = (v.city ?? firm.city ?? PH).trim() || PH;
  doc.text(`Fait à ${ville}, le ${dateFr(v.issueDate)}.`, W - M, y, { align: "right" });

  // Bloc signature
  y += 14;
  const sigName = (v.signatoryName ?? firm.signatory_name ?? PH).trim() || PH;
  const sigRole = (v.signatoryRole ?? firm.signatory_role ?? PH).trim() || PH;
  doc.setFont("helvetica", "bold").text(sigName, W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90, 90, 90);
  doc.text(sigRole, W - M, y + 5, { align: "right" });
  doc.setFontSize(9).setTextColor(150, 150, 150);
  doc.text("(Signature et cachet)", W - M, y + 12, { align: "right" });

  // Pied de page légal
  doc.setDrawColor(210, 214, 204).setLineWidth(0.3).line(M, H - 20, W - M, H - 20);
  doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(140, 140, 140);
  doc.text(legalFooterLine(firm), W / 2, H - 15, { align: "center", maxWidth: full });
  doc.setTextColor(...LIME);
  doc.text("Document généré par Belkora Paie & RH — référentiel Maroc.", W / 2, H - 11, { align: "center" });

  return doc;
}

export async function exportRhDocPdf(v: RhDocView) {
  const doc = await buildRhDocPdf(v);
  doc.save(docFileName(v));
}

/* -------------------------------------------------- HTML imprimable -------------------------------------------------- */
export function buildRhDocHtml(v: RhDocView): string {
  const { firm } = v;
  const ville = (v.city ?? firm.city ?? PH).trim() || PH;
  const sigName = (v.signatoryName ?? firm.signatory_name ?? PH).trim() || PH;
  const sigRole = (v.signatoryRole ?? firm.signatory_role ?? PH).trim() || PH;
  const paras = bodyParagraphs(v)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${DOC_TITLE[v.type]} — ${escapeHtml(v.employee.first_name)} ${escapeHtml(v.employee.last_name)}</title>
<style>
 :root{--lime:#8DB94E;--olive:#8BA25F;--ink:#28342c}
 *{box-sizing:border-box;font-family:"IBM Plex Sans",Arial,sans-serif}
 body{margin:0;padding:24px;background:#f4f5f2;color:var(--ink)}
 .sheet{max-width:800px;margin:auto;background:#fff;padding:40px 46px;border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);min-height:1040px;position:relative}
 .top{display:flex;gap:16px;align-items:center;border-bottom:1.5px solid var(--olive);padding-bottom:14px}
 .top img{height:52px;object-fit:contain}
 .firm{font-weight:700;font-size:16px}
 .firm small{display:block;font-weight:400;color:#888;font-size:11px;margin-top:2px}
 .title{margin:34px auto;width:max-content;border:1.4px solid var(--olive);border-radius:4px;padding:10px 34px;font-size:19px;font-weight:700;letter-spacing:.06em}
 .body{font-size:15px;line-height:1.9;text-align:justify;margin-top:20px}
 .body p{margin:0 0 16px}
 .fait{margin-top:46px;text-align:right;font-size:15px}
 .sig{margin-top:16px;text-align:right}
 .sig b{font-size:15px}.sig span{display:block;color:#666;font-size:13px}.sig .cachet{color:#aaa;font-size:12px;margin-top:8px}
 .foot{position:absolute;left:46px;right:46px;bottom:26px;border-top:1px solid #e0e4da;padding-top:6px;color:#999;font-size:10px;font-style:italic;text-align:center}
 .foot .gen{color:var(--lime);font-style:normal}
 .noprint{max-width:800px;margin:0 auto 14px}
 button{background:var(--lime);color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
 @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;min-height:auto}.noprint{display:none}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
 <div class="top">
   <img src="${firm.logo_path || "/logo-miya.png"}" alt="logo">
   <div class="firm">${escapeHtml(firm.name.toUpperCase())}<small>${[firm.address, firm.ice && "ICE : " + firm.ice, firm.if_fiscal && "IF : " + firm.if_fiscal].filter((x): x is string => Boolean(x)).map(escapeHtml).join(" · ")}</small></div>
 </div>
 <div class="title">${DOC_TITLE[v.type]}</div>
 <div class="body">${paras}</div>
 <div class="fait">Fait à ${escapeHtml(ville)}, le ${dateFr(v.issueDate)}.</div>
 <div class="sig"><b>${escapeHtml(sigName)}</b><span>${escapeHtml(sigRole)}</span><div class="cachet">(Signature et cachet)</div></div>
 <div class="foot">${escapeHtml(legalFooterLine(firm))}<br><span class="gen">Document généré par Belkora Paie &amp; RH — référentiel Maroc.</span></div>
</div></body></html>`;
}

export function openRhDocHtml(v: RhDocView) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(buildRhDocHtml(v)); w.document.close(); }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
