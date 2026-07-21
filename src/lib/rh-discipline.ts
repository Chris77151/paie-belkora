/**
 * Kit disciplinaire RH — sous-volet B.2 du skill « documents-rh-conformes », porté au navigateur.
 *
 * Sanctions graduées du Code du travail marocain (Loi 65-99), dans l'ordre légal imposé
 * (art. 37-38) avant tout licenciement disciplinaire, avec audition préalable du salarié
 * dans les 8 jours du fait (art. 62-63) pour toute sanction lourde ou faute grave (art. 39) :
 *
 *   1. Avertissement            (art. 37 — 1er degré)            [modèle prêt, calqué LaTeX MBD]
 *   2. Blâme                    (art. 37 — 2e degré)             [gabarit MBD]
 *   3. Mise à pied disciplinaire (art. 37 — ≤ 8 jours)          [gabarit MBD]
 *   4. Convocation à audition   (art. 62-63 — entretien préalable)[gabarit MBD]
 *   5. Mise en demeure          (art. 62 & s. ; 39 — reprise/justif) [modèle prêt, calqué LaTeX MBD]
 *   6. Décision de licenciement pour faute grave (art. 38/39)   [gabarit MBD]
 *
 * ZÉRO INVENTION : faits reprochés, dates, CIN, délais viennent de l'utilisateur, jamais fabriqués.
 * Base légale exacte (art. 37/38/39/62) non modifiée. Actes sensibles → faire valider (agent legal).
 */
import type { Employee, Firm } from "@/data/types";
import {
  legalFileName,
  PH,
  renderLegalHtml,
  renderLegalPdf,
  val,
  valDate,
  type LegalBlock,
  type LegalDoc,
} from "./rh-legal";

export type DisciplineType =
  | "avertissement"
  | "blame"
  | "mise-a-pied"
  | "convocation"
  | "mise-en-demeure"
  | "decision-licenciement";
export type Civility = "M." | "Mme" | null;

export const DISCIPLINE_TYPES: { value: DisciplineType; label: string; hint: string; degree: number }[] = [
  { value: "avertissement", label: "Avertissement", hint: "Sanction 1er degré (art. 37)", degree: 1 },
  { value: "blame", label: "Blâme", hint: "Sanction 2e degré (art. 37)", degree: 2 },
  { value: "mise-a-pied", label: "Mise à pied disciplinaire", hint: "≤ 8 jours sans salaire (art. 37)", degree: 3 },
  { value: "convocation", label: "Convocation à audition", hint: "Entretien préalable (art. 62-63)", degree: 4 },
  { value: "mise-en-demeure", label: "Mise en demeure", hint: "Reprise / justification 48 h (art. 62 ; 39)", degree: 4 },
  { value: "decision-licenciement", label: "Décision de licenciement pour faute grave", hint: "Après audition (art. 38/39)", degree: 5 },
];

export const DISCIPLINE_TITLE: Record<DisciplineType, string> = {
  avertissement: "AVERTISSEMENT",
  blame: "BLÂME",
  "mise-a-pied": "MISE À PIED DISCIPLINAIRE",
  convocation: "CONVOCATION À ENTRETIEN PRÉALABLE",
  "mise-en-demeure": "MISE EN DEMEURE",
  "decision-licenciement": "DÉCISION DE LICENCIEMENT POUR FAUTE GRAVE",
};

export interface RhDisciplineView {
  firm: Firm;
  employee: Employee;
  type: DisciplineType;
  civility?: Civility;
  jobTitle?: string;
  site?: string; // chantier
  cin?: string;
  address?: string;
  /** Date du manquement / début de l'absence. */
  faultDate?: string;
  /** Faits reprochés (texte libre — jamais inventés). */
  faultFacts?: string;
  /** Mode de remise. */
  delivery?: "main-propre" | "lrar";
  /** Mise en demeure : nature du manquement (cases). */
  mAbsence?: boolean;
  mRefus?: boolean;
  mConsignes?: boolean;
  consignesText?: string;
  /** Délai de reprise (mise en demeure). */
  deadline?: string;
  /** Mise à pied : durée en jours (≤ 8). */
  layoffDays?: string;
  layoffStart?: string;
  /** Convocation : date / heure / lieu de l'entretien. */
  auditionDate?: string;
  auditionTime?: string;
  auditionPlace?: string;
  /** Décision : sanctions antérieures + date d'effet du licenciement. */
  priorSanctions?: string;
  effectDate?: string;
  /** En-tête & signature. */
  issueDate: string;
  issueCity?: string;
  signatoryName?: string;
  signatoryRole?: string;
}

function fullName(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim().toUpperCase();
}
function politesse(c: Civility): string {
  return c === "Mme" ? "Madame" : c === "M." ? "Monsieur" : "Monsieur / Madame";
}

/* ------------------------------------------------------------------ corps par type ------------------------------------------------------------------ */
function faultBlock(v: RhDisciplineView): LegalBlock[] {
  const facts = v.faultFacts?.trim();
  return [
    { k: "p", t: "Faits reprochés (nature, date, lieu, conséquences) :" },
    { k: "p", t: facts && facts.length ? facts : `${PH}\n${PH}` },
  ];
}

function avertissementBlocks(v: RhDisciplineView): LegalBlock[] {
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    {
      k: "p",
      t: `Nous sommes au regret de constater le manquement suivant, survenu le ${valDate(v.faultDate)} sur le chantier :`,
    },
    ...faultBlock(v),
    {
      k: "p",
      t: "Ce comportement n'est pas conforme aux obligations découlant de votre contrat de travail, des consignes du chef de projet et du règlement intérieur de l'entreprise. En conséquence, et conformément à l'article 37 du Code du travail, nous vous notifions par la présente un avertissement.",
    },
    {
      k: "p",
      t: "Nous vous invitons à vous conformer sans délai à vos obligations. Nous vous rappelons qu'en cas de récidive ou de nouveau manquement, l'entreprise pourra prononcer une sanction plus lourde (blâme, mise à pied, voire licenciement) dans le respect de la procédure légale ; et que certains manquements graves (abandon de poste, refus d'exécuter un travail, absence injustifiée de plus de quatre jours, négligence causant un dommage) constituent une faute grave pouvant entraîner la rupture du contrat sans indemnité (article 39).",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

function blameBlocks(v: RhDisciplineView): LegalBlock[] {
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    {
      k: "p",
      t: `Malgré nos précédentes observations, nous constatons la persistance du manquement suivant, survenu le ${valDate(v.faultDate)} :`,
    },
    ...faultBlock(v),
    {
      k: "p",
      t: "Ce nouveau manquement, faisant suite à un premier avertissement, justifie une sanction du deuxième degré. En conséquence, et conformément à l'article 37 du Code du travail, nous vous notifions par la présente un blâme, versé à votre dossier disciplinaire.",
    },
    {
      k: "p",
      t: "Nous vous rappelons qu'en application des articles 37 et 38 du Code du travail, l'épuisement des sanctions disciplinaires dans une même année autorise l'employeur à procéder au licenciement. Toute faute grave (article 39) pourrait par ailleurs entraîner la rupture immédiate du contrat, sans indemnité, après audition préalable (articles 62-63).",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

function miseAPiedBlocks(v: RhDisciplineView): LegalBlock[] {
  const days = v.layoffDays?.trim() ? `${v.layoffDays.trim()} jour(s)` : PH;
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    {
      k: "p",
      t: `À la suite du manquement constaté le ${valDate(v.faultDate)}, et compte tenu des sanctions déjà prononcées, nous vous notifions une mise à pied disciplinaire, conformément à l'article 37 du Code du travail.`,
    },
    ...faultBlock(v),
    {
      k: "p",
      t: `Cette mise à pied, d'une durée de ${days} (n'excédant pas huit (8) jours conformément à l'article 37), prend effet le ${valDate(v.layoffStart)}. Elle emporte suspension du contrat de travail et de la rémunération pendant toute sa durée.`,
    },
    {
      k: "p",
      t: "Nous attirons votre attention sur le fait qu'un nouveau manquement pourra, après épuisement des sanctions dans l'année (articles 37-38) ou en cas de faute grave (article 39), conduire à votre licenciement, après audition préalable (articles 62-63).",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

function convocationBlocks(v: RhDisciplineView): LegalBlock[] {
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    {
      k: "p",
      t: `Des faits susceptibles de constituer une faute de nature à justifier une sanction disciplinaire ont été portés à notre connaissance, survenus le ${valDate(v.faultDate)} :`,
    },
    ...faultBlock(v),
    {
      k: "p",
      t: `Conformément aux articles 62 et 63 du Code du travail, préalablement à toute décision, nous vous convoquons à un entretien afin de recueillir vos explications et de vous permettre de vous défendre, assisté le cas échéant d'un délégué des salariés ou d'un représentant syndical de l'entreprise.`,
    },
    {
      k: "p",
      t: `Cet entretien se tiendra le ${valDate(v.auditionDate)} à ${val(v.auditionTime)}, à l'adresse suivante : ${val(v.auditionPlace ?? v.firm.address)}.`,
    },
    {
      k: "p",
      t: "Nous vous rappelons que l'audition doit intervenir dans un délai de huit (8) jours à compter de la constatation des faits (article 62). À défaut de présentation de votre part, la procédure se poursuivra et un procès-verbal de carence sera dressé en présence de l'inspecteur du travail.",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

function miseEnDemeureBlocks(v: RhDisciplineView): LegalBlock[] {
  const checks: string[] = [];
  if (v.mAbsence) checks.push("ne vous présentez plus à votre poste sur le chantier, sans justification ni autorisation ;");
  if (v.mRefus) checks.push("refusez d'exécuter les tâches relevant de votre fonction ;");
  if (v.mConsignes) checks.push(`ne respectez pas les consignes suivantes : ${val(v.consignesText)}`);
  if (checks.length === 0) {
    checks.push("ne vous présentez plus à votre poste sur le chantier, sans justification ni autorisation ;");
    checks.push("refusez d'exécuter les tâches relevant de votre fonction ;");
    checks.push(`ne respectez pas les consignes suivantes : ${PH}`);
  }
  const deadline = v.deadline?.trim() ? `${v.deadline.trim()}` : "48 h";
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    { k: "p", t: `Nous constatons que, depuis le ${valDate(v.faultDate)}, vous :` },
    { k: "check", items: checks },
    {
      k: "p",
      t: "Cette situation constitue un manquement à vos obligations contractuelles. En conséquence, nous vous mettons en demeure :",
    },
    {
      k: "ul",
      items: [
        `soit de reprendre votre poste et de vous conformer à vos obligations dans un délai de ${deadline} (48 h recommandé) à compter de la réception de la présente ;`,
        "soit de nous justifier votre absence par un motif légitime (certificat médical, cas de force majeure) dans le même délai.",
      ],
    },
    {
      k: "p",
      t: "À défaut, nous serons contraints d'engager la procédure disciplinaire prévue par les articles 62 et suivants du Code du travail, l'absence injustifiée de plus de quatre (4) jours ou de huit (8) demi-journées sur douze mois étant qualifiée de faute grave (article 39) pouvant conduire à la rupture de votre contrat sans indemnité.",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

function decisionBlocks(v: RhDisciplineView): LegalBlock[] {
  return [
    { k: "p", t: `${politesse(v.civility ?? null)},` },
    {
      k: "p",
      t: `Faisant suite à l'entretien préalable auquel vous avez été convoqué(e), et après avoir recueilli vos explications conformément aux articles 62 et 63 du Code du travail, nous vous notifions notre décision de rompre votre contrat de travail pour faute grave, en application des articles 38 et 39 du Code du travail.`,
    },
    {
      k: "p",
      t: `Cette décision est motivée par les faits suivants, constatés le ${valDate(v.faultDate)} :`,
    },
    ...faultBlock(v),
    {
      k: "p",
      t: v.priorSanctions?.trim()
        ? `Ces faits s'inscrivent dans la suite des sanctions disciplinaires suivantes, déjà notifiées et demeurées sans effet : ${v.priorSanctions.trim()}.`
        : "Ces faits, par leur gravité, rendent impossible le maintien de la relation de travail.",
    },
    {
      k: "p",
      t: `La rupture prend effet le ${valDate(v.effectDate)}. S'agissant d'une faute grave dûment constatée (article 39), elle intervient sans préavis ni indemnité de licenciement. Vous restez toutefois créancier des sommes légalement dues : salaire jusqu'à la date d'effet, indemnité compensatrice de congés payés et solde de tout compte.`,
    },
    {
      k: "p",
      t: "Nous tenons à votre disposition votre certificat de travail, votre dernier bulletin de paie et le reçu pour solde de tout compte. La déclaration de sortie sera effectuée auprès de la CNSS. Vous disposez, si vous l'estimez fondé, d'un droit de recours devant le tribunal compétent dans le délai légal.",
    },
    { k: "p", t: "Nous vous prions d'agréer, " + politesse(v.civility ?? null) + ", l'expression de nos salutations distinguées." },
  ];
}

const BODY: Record<DisciplineType, (v: RhDisciplineView) => LegalBlock[]> = {
  avertissement: avertissementBlocks,
  blame: blameBlocks,
  "mise-a-pied": miseAPiedBlocks,
  convocation: convocationBlocks,
  "mise-en-demeure": miseEnDemeureBlocks,
  "decision-licenciement": decisionBlocks,
};

const SUBHEADING: Record<DisciplineType, string> = {
  avertissement: "Sanction disciplinaire du premier degré — article 37 du Code du travail",
  blame: "Sanction disciplinaire du deuxième degré — article 37 du Code du travail",
  "mise-a-pied": "Sanction disciplinaire — article 37 du Code du travail (mise à pied ≤ 8 jours)",
  convocation: "Entretien préalable à sanction — articles 62 et 63 du Code du travail",
  "mise-en-demeure": "Reprise du travail / mise en conformité — articles 62 & s. ; 39",
  "decision-licenciement": "Rupture pour faute grave — articles 38 et 39 du Code du travail",
};

/* ------------------------------------------------------------------ assemblage ------------------------------------------------------------------ */
export function buildDisciplineDoc(v: RhDisciplineView): LegalDoc {
  const city = v.issueCity?.trim() || v.firm.city || PH;
  const deliveryLabel =
    v.delivery === "lrar"
      ? "Lettre recommandée avec accusé de réception"
      : v.delivery === "main-propre"
        ? "Remise en main propre contre décharge"
        : "Remise en main propre contre décharge  [ ]   ou par lettre recommandée avec A.R.  [ ]";

  const meta = [
    { label: "Salarié", value: fullName(v.employee) },
    { label: "Fonction", value: val(v.jobTitle ?? v.employee.position) },
    { label: "Chantier / site", value: val(v.site ?? v.employee.site) },
  ];
  if (v.type === "mise-en-demeure" || v.type === "decision-licenciement") {
    meta.push({ label: "Adresse", value: val(v.address ?? v.employee.address) });
    meta.push({ label: "CIN", value: val(v.cin ?? v.employee.cin) });
  }
  meta.push({ label: "Mode de remise", value: deliveryLabel });

  return {
    fileTitle: `${DISCIPLINE_TITLE[v.type]} — ${fullName(v.employee)}`,
    heading: DISCIPLINE_TITLE[v.type],
    subheading: SUBHEADING[v.type],
    rightHeader: `${city}, le ${valDate(v.issueDate)}`,
    meta,
    blocks: BODY[v.type](v),
    signatures: [
      {
        title: "Pour l'Employeur",
        lines: [v.firm.name.toUpperCase(), `Représenté par : ${val(v.signatoryName ?? v.firm.signatory_name)}`, val(v.signatoryRole ?? v.firm.signatory_role)],
        caption: "Signature et cachet",
      },
      {
        title: "Le Salarié",
        lines: [`(reçu le : ${PH})`],
        caption: "Signature précédée de « Reçu le… », ou mention de refus",
      },
    ],
  };
}

/** Champs rendus en placeholder — transparence « zéro invention ». PURE. */
export function disciplineMissingFields(v: RhDisciplineView): string[] {
  const out: string[] = [];
  if (!(v.civility === "M." || v.civility === "Mme")) out.push("Civilité");
  if (!(v.site ?? v.employee.site)?.trim()) out.push("Chantier / site");
  if (!v.faultDate?.trim()) out.push(v.type === "mise-en-demeure" ? "Date de début du manquement" : "Date du manquement");
  if (v.type !== "convocation" && v.type !== "mise-en-demeure" && !v.faultFacts?.trim()) out.push("Faits reprochés");
  if ((v.type === "mise-en-demeure" || v.type === "decision-licenciement") && !(v.cin ?? v.employee.cin)?.trim())
    out.push("N° CIN");
  if ((v.type === "mise-en-demeure" || v.type === "decision-licenciement") && !(v.address ?? v.employee.address)?.trim())
    out.push("Adresse du salarié");
  if (v.type === "mise-a-pied" && !v.layoffDays?.trim()) out.push("Durée de la mise à pied");
  if (v.type === "mise-a-pied" && !v.layoffStart?.trim()) out.push("Date d'effet de la mise à pied");
  if (v.type === "convocation" && !v.auditionDate?.trim()) out.push("Date de l'entretien");
  if (v.type === "convocation" && !v.auditionTime?.trim()) out.push("Heure de l'entretien");
  if (v.type === "decision-licenciement" && !v.effectDate?.trim()) out.push("Date d'effet du licenciement");
  if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire employeur");
  return out;
}

/** Résumé « données injectées depuis le dossier salarié » (traçabilité). PURE. */
export function disciplinePrefilled(v: RhDisciplineView): { label: string; value: string }[] {
  const e = v.employee;
  const rows: { label: string; value: string }[] = [
    { label: "Salarié", value: fullName(e) },
    { label: "Entité", value: v.firm.name.toUpperCase() },
    { label: "Fonction", value: val(v.jobTitle ?? e.position) },
  ];
  if ((v.site ?? e.site)?.trim()) rows.push({ label: "Chantier / site", value: (v.site ?? e.site)!.trim() });
  if ((v.cin ?? e.cin)?.trim()) rows.push({ label: "CIN", value: (v.cin ?? e.cin)!.trim() });
  return rows;
}

export function disciplineFileName(v: RhDisciplineView): string {
  return legalFileName(DISCIPLINE_TITLE[v.type], `${v.employee.first_name}_${v.employee.last_name}`);
}

export async function exportDisciplinePdf(v: RhDisciplineView) {
  const doc = await renderLegalPdf(v.firm, buildDisciplineDoc(v));
  doc.save(disciplineFileName(v));
}

export function openDisciplineHtml(v: RhDisciplineView) {
  const html = renderLegalHtml(v.firm, buildDisciplineDoc(v));
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
