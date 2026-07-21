/**
 * Kit rupture RH — sous-volet B.3 du skill « documents-rh-conformes », porté au navigateur.
 *
 * Fin du contrat « pour accomplir un travail déterminé » (chantier MBD) :
 *   1. PV de fin de travaux        (art. 33 — matérialise le terme, sans préavis)
 *   2. Accord de rupture amiable   (art. 33 al. 1 — sortie négociée, sans dommages-intérêts)
 *   3. Reçu pour solde de tout compte (art. 73-76 — effet libératoire, dénonciation 60 j)
 *
 * Contenu calqué EXACTEMENT sur les modèles LaTeX MBD (kit-protection-rupture). ZÉRO INVENTION :
 * montants, dates, CIN, faits viennent de l'utilisateur, jamais fabriqués — sinon placeholder.
 * L'entité signataire (raison sociale, ICE/IF/RC, siège, logo) suit la société active du store.
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

export type RuptureType = "pv-fin-travaux" | "accord-amiable" | "recu-solde";
export type Civility = "M." | "Mme" | null;

export const RUPTURE_TYPES: { value: RuptureType; label: string; hint: string; article: string }[] = [
  { value: "pv-fin-travaux", label: "PV de fin de travaux", hint: "Terme du contrat « travail déterminé » — sans préavis", article: "Art. 33" },
  { value: "accord-amiable", label: "Accord de rupture amiable", hint: "Rupture d'un commun accord — sans dommages-intérêts", article: "Art. 33 al. 1" },
  { value: "recu-solde", label: "Reçu pour solde de tout compte", hint: "Effet libératoire — dénonciation sous 60 j", article: "Art. 73-76" },
];

export const RUPTURE_TITLE: Record<RuptureType, string> = {
  "pv-fin-travaux": "PROCÈS-VERBAL DE FIN DE TRAVAUX",
  "accord-amiable": "ACCORD DE RUPTURE D'UN COMMUN ACCORD",
  "recu-solde": "REÇU POUR SOLDE DE TOUT COMPTE",
};

const SUBHEADING: Record<RuptureType, string> = {
  "pv-fin-travaux": "Constatation de l'achèvement de l'objet du contrat « pour accomplir un travail déterminé »",
  "accord-amiable": "Rupture amiable du contrat de travail — article 33 du Code du travail",
  "recu-solde": "Articles 73 à 76 du Code du travail — contrat pour accomplir un travail déterminé",
};

export interface RhRuptureView {
  firm: Firm;
  employee: Employee;
  type: RuptureType;
  civility?: Civility;
  jobTitle?: string;
  site?: string; // chantier
  cin?: string;
  cnss?: string;
  address?: string;
  /** PV : lieu d'exécution + objet des travaux + date de constat d'achèvement. */
  lieuExecution?: string;
  objetTravaux?: string;
  constatDate?: string;
  /** Accord : date d'effet de la rupture + autres sommes éventuelles. */
  effectDate?: string;
  autresSommes?: string;
  /** Reçu : bornes du contrat + net payé (jamais calculé — saisi ou placeholder). */
  contractStart?: string;
  contractEnd?: string;
  netAmount?: string;
  /** En-tête & signature. */
  issueDate: string;
  issueCity?: string;
  signatoryName?: string;
  signatoryRole?: string;
  chefChantier?: string;
}

function fullName(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim().toUpperCase();
}
function politesse(c: Civility): string {
  return c === "Mme" ? "Madame" : c === "M." ? "Monsieur" : "M. / Mme";
}
function employerLine(v: RhRuptureView): string {
  const f = v.firm;
  const bits = [
    f.name.toUpperCase(),
    f.rc && `RC ${f.rc}`,
    f.ice && `ICE ${f.ice}`,
    f.address ? `siège à ${f.address}` : null,
  ].filter(Boolean);
  return `${bits.join(", ")}, représentée par ${val(v.signatoryName ?? f.signatory_name)} (${val(v.signatoryRole ?? f.signatory_role)})`;
}

/* ------------------------------------------------------------------ corps par type ------------------------------------------------------------------ */

function pvBlocks(v: RhRuptureView): LegalBlock[] {
  return [
    { k: "p", t: `Il est constaté ce jour, ${valDate(v.constatDate)}, que les travaux constituant l'objet des contrats de travail « pour accomplir un travail déterminé » conclus pour ce chantier, à savoir :` },
    { k: "p", t: `Objet des travaux achevés : ${v.objetTravaux?.trim() ? v.objetTravaux.trim() : `${PH}\n${PH}`}` },
    { k: "p", t: "sont achevés à la date ci-dessus. Cet achèvement constitue, conformément à l'article 33 du Code du travail, le terme des contrats des salariés affectés à ce chantier, dont la liste figure ci-dessous. Les contrats prennent fin de plein droit à cette date, sans préavis." },
    { k: "h", t: "Salariés concernés (fin de contrat à la date du présent procès-verbal)" },
    { k: "ul", items: [
      `1. Prénom NOM : ${PH} — CIN : ${PH} — Observation : ${PH}`,
      `2. Prénom NOM : ${PH} — CIN : ${PH} — Observation : ${PH}`,
      `3. Prénom NOM : ${PH} — CIN : ${PH} — Observation : ${PH}`,
    ] },
    { k: "p", t: "(Ajouter autant de lignes que nécessaire. Un reçu pour solde de tout compte est établi pour chaque salarié.)" },
  ];
}

function accordBlocks(v: RhRuptureView): LegalBlock[] {
  return [
    { k: "p", t: `Entre : ${employerLine(v)}, ci-après « l'Employeur »,` },
    { k: "p", t: `Et : ${politesse(v.civility ?? null)} ${fullName(v.employee)}, CIN ${val(v.cin ?? v.employee.cin)}, demeurant à ${val(v.address ?? v.employee.address)}, ci-après « le Salarié »,` },
    { k: "p", t: `Les parties, liées par un contrat de travail « pour accomplir un travail déterminé » sur le chantier ${val(v.site ?? v.employee.site)}, conviennent librement de ce qui suit :` },
    { k: "h", t: "Article 1 — Principe de la rupture" },
    { k: "p", t: `Les parties conviennent, d'un commun accord et sans réserve, de mettre fin au contrat de travail qui les lie, conformément à l'article 33 (al. 1) du Code du travail qui autorise la rupture par accord des parties. La rupture prend effet le ${valDate(v.effectDate)}.` },
    { k: "h", t: "Article 2 — Règlement des comptes" },
    { k: "p", t: `L'Employeur verse au Salarié, à la date d'effet, l'ensemble des sommes dues : salaire des jours travaillés non encore payés, indemnité compensatrice de congés payés (1/12 de la rémunération brute perçue), et le cas échéant ${val(v.autresSommes)}. Le détail figure sur le reçu pour solde de tout compte remis séparément.` },
    { k: "h", t: "Article 3 — Absence de dommages-intérêts" },
    { k: "p", t: "La rupture étant convenue d'un commun accord, aucune des parties ne réclame de dommages-intérêts à l'autre au titre de la rupture. Le Salarié reconnaît avoir été rempli de l'ensemble de ses droits." },
    { k: "h", t: "Article 4 — Documents de fin de contrat" },
    { k: "p", t: "L'Employeur remet au Salarié le certificat de travail, le dernier bulletin de paie et le reçu pour solde de tout compte, et procède à sa déclaration de sortie auprès de la CNSS." },
    { k: "h", t: "Article 5 — Libre consentement" },
    { k: "p", t: "Chaque partie déclare signer le présent accord librement et sans contrainte, après en avoir mesuré la portée." },
  ];
}

function recuBlocks(v: RhRuptureView): LegalBlock[] {
  const f = v.firm;
  const ident = [f.name.toUpperCase(), f.rc && `RC ${f.rc}`, f.ice && `ICE ${f.ice}`].filter(Boolean).join(", ");
  const net = val(v.netAmount);
  return [
    { k: "p", t: `Je soussigné(e) (Prénom et NOM) : ${fullName(v.employee) || PH}, CIN n° ${val(v.cin ?? v.employee.cin)}, N° CNSS ${val(v.cnss ?? v.employee.cnss_number)}, ayant été employé(e) par la société ${ident}, en qualité d'ouvrier de chantier : ${val(v.jobTitle ?? v.employee.position)}, dans le cadre d'un contrat pour accomplir un travail déterminé sur le chantier ${val(v.site ?? v.employee.site)}, du ${valDate(v.contractStart)} au ${valDate(v.contractEnd)},` },
    { k: "p", t: `reconnais avoir reçu de l'Employeur, à la cessation de mon contrat, la somme nette de ${net} DH, pour solde de tout compte, se décomposant comme suit :` },
    { k: "ul", items: [
      `Salaire des jours travaillés non encore payés : ${PH} DH`,
      `Indemnité compensatrice de congés payés (art. 231) : ${PH} DH`,
      `Autres sommes dues (heures supplémentaires, indemnités…) : ${PH} DH`,
      `Total brut : ${PH} DH`,
      `Retenues sociales et fiscales (CNSS, AMO, IR) : (–) ${PH} DH`,
      `NET PAYÉ : ${net} DH`,
    ] },
    { k: "check", items: [`Virement bancaire (réf. : ${PH})`, "Espèces"] },
    { k: "p", t: "Le présent reçu :" },
    { k: "ul", items: [
      "est établi en deux (2) exemplaires, dont un remis au Salarié ;",
      "peut être dénoncé dans les soixante (60) jours suivant sa signature (art. 75) ; passé ce délai, il devient définitif et a effet libératoire pour les sommes qui y sont mentionnées.",
    ] },
  ];
}

const BODY: Record<RuptureType, (v: RhRuptureView) => LegalBlock[]> = {
  "pv-fin-travaux": pvBlocks,
  "accord-amiable": accordBlocks,
  "recu-solde": recuBlocks,
};

/* ------------------------------------------------------------------ assemblage ------------------------------------------------------------------ */
export function buildRuptureDoc(v: RhRuptureView): LegalDoc {
  const city = v.issueCity?.trim() || v.firm.city || PH;
  const faitA = `Fait à ${city}, le ${valDate(v.issueDate)}`;

  const doc: LegalDoc = {
    fileTitle: `${RUPTURE_TITLE[v.type]} — ${v.type === "pv-fin-travaux" ? v.firm.name.toUpperCase() : fullName(v.employee)}`,
    heading: RUPTURE_TITLE[v.type],
    subheading: SUBHEADING[v.type],
    blocks: BODY[v.type](v),
  };

  if (v.type === "pv-fin-travaux") {
    doc.meta = [
      { label: "Employeur", value: `${v.firm.name.toUpperCase()}, représenté par ${val(v.signatoryName ?? v.firm.signatory_name)}` },
      { label: "Chantier / projet", value: val(v.site ?? v.employee.site) },
      { label: "Lieu d'exécution", value: val(v.lieuExecution) },
    ];
    doc.faitA = `${faitA}, pour servir et valoir ce que de droit.`;
    doc.signatures = [
      { title: "Pour l'Employeur", lines: [v.firm.name.toUpperCase(), `Représenté par : ${val(v.signatoryName ?? v.firm.signatory_name)}`], caption: "Signature et cachet" },
      { title: "Chef de chantier", lines: [`Nom : ${val(v.chefChantier)}`], caption: "Signature" },
    ];
  } else if (v.type === "accord-amiable") {
    doc.faitA = `${faitA}, en deux exemplaires originaux, signatures légalisées.`;
    doc.signatures = [
      { title: "L'Employeur", lines: [`Représenté par : ${val(v.signatoryName ?? v.firm.signatory_name)}`], caption: "Signature, cachet et légalisation" },
      { title: "Le Salarié", lines: [], caption: "Signature précédée de « Lu et approuvé — bon pour accord », et légalisation" },
    ];
  } else {
    doc.faitA = faitA + ".";
    doc.legalNote =
      "Ce reçu n'a pas à être légalisé : la mention manuscrite « lu et approuvé » et la signature du Salarié suffisent (art. 74). Pour un salarié illettré, le reçu lui est lu et expliqué, et son empreinte digitale est apposée avec la mention « lecture faite ».";
    doc.signatures = [
      { title: "Le Salarié", lines: [], caption: "Signature précédée de la mention manuscrite obligatoire « Lu et approuvé — pour solde de tout compte » (art. 74)" },
      { title: "Pour l'Employeur", lines: [v.firm.name.toUpperCase(), `Représenté par : ${val(v.signatoryName ?? v.firm.signatory_name)}`], caption: "Signature et cachet" },
    ];
  }
  return doc;
}

/* ------------------------------------------------------------------ transparence & export ------------------------------------------------------------------ */
export function ruptureMissingFields(v: RhRuptureView): string[] {
  const out: string[] = [];
  if (v.type === "pv-fin-travaux") {
    if (!v.site?.trim() && !v.employee.site?.trim()) out.push("Chantier / projet");
    if (!v.lieuExecution?.trim()) out.push("Lieu d'exécution");
    if (!v.objetTravaux?.trim()) out.push("Objet des travaux achevés");
    if (!v.constatDate?.trim()) out.push("Date d'achèvement");
    if (!v.chefChantier?.trim()) out.push("Chef de chantier");
  }
  if (v.type === "accord-amiable") {
    if (!(v.cin ?? v.employee.cin)?.trim()) out.push("N° CIN");
    if (!(v.address ?? v.employee.address)?.trim()) out.push("Adresse du salarié");
    if (!v.site?.trim() && !v.employee.site?.trim()) out.push("Chantier");
    if (!v.effectDate?.trim()) out.push("Date d'effet de la rupture");
  }
  if (v.type === "recu-solde") {
    if (!(v.cin ?? v.employee.cin)?.trim()) out.push("N° CIN");
    if (!(v.cnss ?? v.employee.cnss_number)?.trim()) out.push("N° CNSS");
    if (!v.contractStart?.trim()) out.push("Début du contrat");
    if (!v.contractEnd?.trim()) out.push("Fin du contrat");
    if (!v.netAmount?.trim()) out.push("Net payé");
    out.push("Décomposition des montants");
  }
  if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire employeur");
  return out;
}

export function rupturePrefilled(v: RhRuptureView): { label: string; value: string }[] {
  const e = v.employee;
  const rows: { label: string; value: string }[] = [
    { label: "Entité", value: v.firm.name.toUpperCase() },
  ];
  if (v.type !== "pv-fin-travaux") rows.unshift({ label: "Salarié", value: fullName(e) });
  if ((v.jobTitle ?? e.position)?.trim()) rows.push({ label: "Fonction", value: (v.jobTitle ?? e.position)!.trim() });
  if ((v.site ?? e.site)?.trim()) rows.push({ label: "Chantier / site", value: (v.site ?? e.site)!.trim() });
  if (v.type === "recu-solde" && (v.cnss ?? e.cnss_number)?.trim()) rows.push({ label: "CNSS", value: (v.cnss ?? e.cnss_number)!.trim() });
  return rows;
}

export function ruptureFileName(v: RhRuptureView): string {
  const who = v.type === "pv-fin-travaux" ? v.firm.name : `${v.employee.first_name}_${v.employee.last_name}`;
  return legalFileName(RUPTURE_TITLE[v.type], who);
}

export async function exportRupturePdf(v: RhRuptureView) {
  const doc = await renderLegalPdf(v.firm, buildRuptureDoc(v));
  doc.save(ruptureFileName(v));
}

export function openRuptureHtml(v: RhRuptureView) {
  const html = renderLegalHtml(v.firm, buildRuptureDoc(v));
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
