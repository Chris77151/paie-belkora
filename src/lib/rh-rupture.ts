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
import { num, amountToWordsFr } from "./format";
import { firmIdentityClause } from "./firm-legal";

/** Décomposition chiffrée du solde de tout compte, injectée dans le reçu (calcul auto). */
export interface StcBreakdown {
  lines: { label: string; amount: number }[];
  grossTotal: number;
  cnss: number;
  amo: number;
  ir: number;
  otherDeductions: number;
  net: number;
}

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
  /** Reçu : bornes du contrat + net payé (saisi, ou issu du calcul automatique du STC). */
  contractStart?: string;
  contractEnd?: string;
  netAmount?: string;
  /** Décomposition chiffrée issue du moteur STC — quand présente, le reçu affiche les vrais montants. */
  stc?: StcBreakdown;
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

/**
 * Reçu pour solde de tout compte — modèle MBD (art. 73-76). 5 sections + annexe illettré.
 * Auto-remplissage : identité depuis l'employé, décompte depuis le moteur STC quand disponible ;
 * sinon rubriques vierges à remplir (pointillés). Tout en blocs (l'ordre du modèle est respecté).
 */
function recuBlocks(v: RhRuptureView): LegalBlock[] {
  const f = v.firm;
  const e = v.employee;
  const identity = firmIdentityClause(f);
  const sig = val(v.signatoryName ?? f.signatory_name);
  const role = val(v.signatoryRole ?? f.signatory_role);
  const dot = "……………";
  const b = v.stc;
  const netStr = b ? num(b.net) : (v.netAmount?.trim() ? v.netAmount.trim() : dot);
  const netLettres = b ? amountToWordsFr(b.net) : dot;
  const year = (() => { const d = new Date(v.issueDate); return isNaN(d.getFullYear()) ? "" : d.getFullYear(); })();

  // Décompte : lignes réelles du moteur STC si dispo, sinon rubriques vierges du modèle.
  const decompteRows: string[][] = b
    ? [
        ...b.lines.map((l) => [l.label, "", "", num(l.amount)]),
        ["TOTAL BRUT", "", "", num(b.grossTotal)],
        ["– Cotisation salariale CNSS (4,48 % ; plafond 6 000 DH/mois)", "", "", `(–) ${num(b.cnss)}`],
        ["– Cotisation salariale AMO (2,26 % ; sans plafond)", "", "", `(–) ${num(b.amo)}`],
        ["– Impôt sur le revenu, retenue à la source (barème CGI)", "", "", `(–) ${num(b.ir)}`],
        ...(b.otherDeductions > 0 ? [["– Compensation avance / prêt consenti au Salarié", "", "", `(–) ${num(b.otherDeductions)}`]] : []),
        ["NET À PAYER (pour solde de tout compte)", "", "", num(b.net)],
      ]
    : [
        ["1. Salaire des jours travaillés non réglés", dot, `${dot} j`, dot],
        ["2. Heures supplémentaires (art. 201)", dot, `${dot} h`, dot],
        ["3. Indemnité compensatrice de congé annuel payé (1,5 j/mois — art. 231, 238)", dot, `${dot} mois`, dot],
        ["4. Indemnité compensatrice de préavis (art. 43 et 51)", dot, dot, dot],
        ["5. Indemnité de licenciement (art. 52, 53, 55)", dot, dot, dot],
        ["6. Reliquats / primes / rappels divers", dot, dot, dot],
        ["TOTAL BRUT", "", "", dot],
        ["– Cotisation salariale CNSS (4,48 % ; plafond 6 000 DH/mois)", "", "", dot],
        ["– Cotisation salariale AMO (2,26 % ; sans plafond)", "", "", dot],
        ["– Impôt sur le revenu, retenue à la source (barème CGI)", "", "", dot],
        ["– Compensation avance / prêt consenti au Salarié", "", "", dot],
        ["NET À PAYER (pour solde de tout compte)", "", "", dot],
      ];

  return [
    { k: "center", t: `Référence reçu : STC-${year || 2026}-${dot}` },

    // 1. Les parties
    { k: "h", t: "1. Les parties" },
    { k: "p", t: `L'EMPLOYEUR : ${f.name.toUpperCase()}${identity ? ` — ${identity}` : ""}, représentée par ${sig}, en qualité de ${role}, ci-après désignée « l'Employeur », d'une part.` },
    { k: "h", t: "Le Salarié" },
    { k: "p", t: `Nom et prénom : ${fullName(e) || dot}      N° CIN : ${val(v.cin ?? e.cin)}` },
    { k: "p", t: `N° CNSS : ${val(v.cnss ?? e.cnss_number)}      Né(e) le : ${valDate(e.birth_date)}` },
    { k: "p", t: `Fonction / qualification : ${val(v.jobTitle ?? e.position)}      Chantier / affectation : ${val(v.site ?? e.site)}` },
    { k: "p", t: `Adresse : ${val(v.address ?? e.address)}` },
    { k: "p", t: "ci-après désigné(e) « le Salarié », d'autre part." },

    // 2. Relation de travail et rupture
    { k: "h", t: "2. Relation de travail et rupture" },
    { k: "p", t: "Nature du contrat :" },
    { k: "check", items: ["CDD de chantier / travail déterminé", "CDD à terme", "Journalier", "CDI"] },
    { k: "p", t: `Date d'entrée : ${valDate(v.contractStart)}      Date de sortie (cessation) : ${valDate(v.contractEnd)}` },
    { k: "p", t: "Motif de la rupture :" },
    { k: "check", items: ["Arrivée du terme / achèvement du travail déterminé", "Démission", "Licenciement", "Rupture d'un commun accord", `Autre : ${dot}`] },

    // 3. Décompte des sommes dues
    { k: "h", t: "3. Décompte des sommes dues" },
    { k: "p", t: "Article 74-1 : le reçu pour solde de tout compte doit porter indication détaillée des sommes versées au Salarié." },
    { k: "table", head: ["Rubrique (fondement légal)", "Base", "Nombre", "Montant (DH)"], align: ["left", "right", "right", "right"], rows: decompteRows },
    { k: "p", t: `Arrêté le présent reçu à la somme nette de ${netStr} dirhams, en toutes lettres : ${netLettres}.` },
    { k: "p", t: "Réglé par :" },
    { k: "check", items: ["Virement bancaire", `Chèque n° ${dot}`, `Espèces — le ${dot}`] },

    // 4. Mentions légales
    { k: "h", t: "4. Mentions légales" },
    { k: "p", t: "Le Salarié reconnaît avoir reçu de l'Employeur la somme nette ci-dessus, pour solde de tout compte, en règlement de tout paiement dû au titre de l'exécution et de la cessation de son contrat de travail (art. 73)." },
    { k: "p", t: "Le présent reçu, établi en deux exemplaires, peut être dénoncé dans les soixante (60) jours de sa signature, par lettre recommandée avec accusé de réception ou par assignation précisant les droits invoqués ; passé ce délai sans dénonciation régulière, il vaut solde de tout compte définitif (art. 74 à 76)." },

    // 5. Signatures
    { k: "h", t: "5. Signatures" },
    { k: "p", t: `Fait à ${v.issueCity?.trim() || f.city || dot}, le ${valDate(v.issueDate)}, en deux exemplaires originaux, dont un remis au Salarié.` },
    { k: "table", head: ["Le Salarié", "Pour l'Entreprise"], rows: [
      ["", f.name.toUpperCase()],
      ["", `Représentée par ${sig}, ${role}`],
      [" ", " "],
      [" ", " "],
      ["Signature (précédée de « Lu et approuvé — pour solde de tout compte », art. 74)", "Signature et cachet"],
    ] },

    // Annexe — salarié illettré (art. 74 in fine)
    { k: "h", t: "Annexe — Salarié ne sachant ni lire ni écrire (art. 74 in fine)" },
    { k: "p", t: "Le Salarié déclarant ne savoir ni lire ni écrire, le présent reçu lui a été intégralement lu ; il y appose son empreinte digitale ci-après, et le reçu est contresigné par l'agent chargé de l'inspection du travail, dans le cadre de la conciliation prévue à l'article 532 du Code du travail." },
    { k: "table", head: ["Empreinte digitale du Salarié", "Contreseing — Inspection du travail"], rows: [
      [" ", `Nom de l'agent : ${dot}`],
      [" ", `Cachet et signature : ${dot}`],
      [" ", `Le : ${dot}`],
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
  }
  // recu-solde : signatures + « Fait à » + annexe sont intégrés aux blocs (modèle complet), rien à ajouter ici.
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
    // Le calcul automatique du STC remplit le net et la décomposition.
    if (!v.stc) {
      if (!v.netAmount?.trim()) out.push("Net payé");
      out.push("Décomposition des montants");
    }
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
