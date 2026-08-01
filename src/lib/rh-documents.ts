/**
 * Documents RH conformes — Famille A du skill « documents-rh-conformes », porté au navigateur.
 *
 * Trois documents attestatifs officiels du Groupe Belkora générés depuis les données RÉELLES
 * du store local (Employee + Firm), avec la même règle d'or que le skill : ZÉRO INVENTION.
 * Tout champ absent (CIN, CNSS, date d'embauche, salaire, date de fin, civilité) est rendu en
 * placeholder pointillé visible et listé dans `missingFields()` — jamais fabriqué.
 *
 * Gabarit calqué sur payslip.ts : en-tête logo + bloc légal, titre encadré, corps justifié,
 * « Fait à … le … », bloc signature, pied de page légal (ICE/IF/RC/CNSS). Aux couleurs de la
 * société émettrice (spectre dérivé de firm.brand_color ; vert Miya par défaut).
 * Rendus : PDF (jsPDF) et HTML imprimable. Les fonctions de texte sont PURES (testables).
 */
import type { jsPDF } from "jspdf";
import type { Employee, Firm } from "@/data/types";
import { dateFr } from "./format";
import { firmIdentityClause, firmLegalLine } from "./firm-legal";
import {
  fullName,
  renderLegalHtml,
  renderLegalPdf,
  type Civility,
  type LegalBlock,
  type LegalDoc,
} from "./rh-legal";

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

/** Civilité — définition unique dans `rh-legal.ts`, ré-exportée pour les pages. */
export type { Civility };

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

  const intro = `Je ${a.soussigne} **${sig}**, agissant en qualité de ${role} de la société **${firmName}**${
    legal ? ", " + legal : ""
  }, atteste par la présente que :`;

  const statut =
    v.stageOngoing === false
      ? v.endDate?.trim()
        ? ` Ce stage s'est achevé le **${dateFr(v.endDate)}**.`
        : ""
      : " Ce stage est, à ce jour, toujours en cours.";

  const identite =
    `**${a.civilite} ${nom}**, titulaire de la carte nationale d'identité n° ${cin}, effectue, depuis le **${debut}**, ` +
    `un ${typeStage} au sein de notre société, dans le cadre de sa formation en ${formation}, ` +
    `pour une durée prévue de **${duree}**.${statut}`;

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
      ? `Je ${a.soussigne} **${sig}**, ${role} de la société **${firmName}**, certifie par la présente que :`
      : `Je ${a.soussigne} **${sig}**, ${role} de la société **${firmName}**, atteste par la présente que :`;

  const identite = `**${a.civilite} ${nom}**, titulaire de la carte d'identité nationale n° ${cin}, ${a.immatricule} à la CNSS sous le n° ${cnss},`;

  const paras: string[] = [intro, identite];

  if (v.type === "certificat-travail") {
    const fin = v.endDate?.trim() ? dateFr(v.endDate) : PH;
    paras.push(`a été ${a.employe} au sein de notre entreprise en qualité de **${poste}**, du **${embauche}** au **${fin}**.`);
    paras.push("Le présent certificat lui est délivré pour servir et faire valoir ce que de droit, libre de tout engagement.");
  } else {
    let emploi = `est ${a.employe} au sein de notre entreprise en qualité de **${poste}**, et ce depuis le **${embauche}**`;
    if (v.type === "attestation-salaire") {
      emploi += `, et perçoit à ce titre une rémunération mensuelle de **${val(v.salary)}**`;
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

/* -------------------------------------------------- description PURE du document -------------------------------------------------- */
/**
 * Traduit la vue en `LegalDoc` — le modèle commun à TOUS les documents RH/juridiques.
 *
 * Les attestations disposaient auparavant de leur propre moteur de rendu : marges (20 mm) et
 * logo (38 × 19 mm) différents des contrats et courriers, aucune pagination (une attestation de
 * stage avec missions débordait sous le pied de page, silencieusement), et un facteur
 * d'interligne inventé (`fs * 0,5`) au lieu de la conversion point → mm. Passer par
 * `renderLegalPdf` supprime ces trois défauts d'un coup et aligne le rendu sur le reste.
 */
export function buildRhDoc(v: RhDocView): LegalDoc {
  const { firm } = v;
  const ville = (v.city ?? firm.city ?? PH).trim() || PH;
  const sigName = (v.signatoryName ?? firm.signatory_name ?? PH).trim() || PH;
  const sigRole = (v.signatoryRole ?? firm.signatory_role ?? PH).trim() || PH;
  return {
    fileTitle: DOC_TITLE[v.type],
    heading: DOC_TITLE[v.type],
    blocks: bodyParagraphs(v).map((t): LegalBlock => ({ k: "p", t })),
    faitA: `Fait à ${ville}, le ${dateFr(v.issueDate)}.`,
    signatures: [{ title: sigName, lines: [sigRole], caption: "(Signature et cachet)" }],
  };
}

/* -------------------------------------------------- PDF -------------------------------------------------- */
export async function buildRhDocPdf(v: RhDocView): Promise<jsPDF> {
  return renderLegalPdf(v.firm, buildRhDoc(v));
}

export async function exportRhDocPdf(v: RhDocView) {
  const doc = await buildRhDocPdf(v);
  doc.save(docFileName(v));
}

/* -------------------------------------------------- HTML imprimable -------------------------------------------------- */
/** Même moteur HTML que les contrats et les courriers : un seul gabarit pour toute l'application. */
export function buildRhDocHtml(v: RhDocView): string {
  return renderLegalHtml(v.firm, buildRhDoc(v));
}

export function openRhDocHtml(v: RhDocView) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(buildRhDocHtml(v)); w.document.close(); }
}
