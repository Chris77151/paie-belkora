/**
 * Plan de comptes de paie par défaut — PCGE / CGNC marocain.
 * Validé par l'expert-comptable (corpus PCGE classes 4 & 6, CNSS). Modifiable par société.
 * Aucun numéro de compte codé en dur ailleurs que dans ce fichier.
 *
 * Points de conformité (expert-comptable) :
 *  - 61741 = cotisations de sécurité sociale (CNSS + AMO patronales) ; 61742 = RETRAITE, 61743 = MUTUELLES.
 *    -> l'AMO patronale se loge sous 61741 (sous-comptes 617411/617412), jamais 61742/61743.
 *  - TFP = TAXE (pas une cotisation) -> charge 6167 = **61678** « Autres impôts, taxes et droits
 *    assimilés » (le 61671 est RÉSERVÉ aux « droits d'enregistrement et de timbre » — ne pas l'y loger).
 *    Au crédit 4457 (État - taxes à payer) par défaut ; option `tfpInCnss` pour la loger en 4441
 *    (recouvrement par la CNSS/OFPPT) — à trancher selon la politique de l'entité (réserve expert-comptable).
 *  - AMO (sal.+patr.) se paie sur le bordereau CNSS -> crédit 4441 (pas 4445 Mutuelles).
 *  - IR retenu à la source sur salaires -> 44525.
 *  - Retenue d'AVANCE/ACOMPTE sur salaire -> crédit 3431 « Personnel — avances et acomptes »
 *    (extinction de la créance) au règlement ; le net décaissé est diminué d'autant.
 */
export interface PayrollAccounts {
  /** 6171 — Rémunérations du personnel (brut). */
  remunerations: string;
  /** 617411 — CNSS part patronale (sous-compte de 61741). */
  cnssPatronal: string;
  /** 617412 — AMO part patronale (sous-compte de 61741). */
  amoPatronal: string;
  /** 61744 — Prestations familiales (allocations familiales). */
  allocationsFamiliales: string;
  /** 61678 — Taxe de formation professionnelle (« Autres impôts, taxes et droits assimilés »). */
  tfp: string;
  /** 4432 — Rémunérations dues au personnel (net à payer). */
  remunerationsDues: string;
  /** 4441 — CNSS (CNSS + AMO + AF, parts salariale et patronale). */
  cnssOrganisme: string;
  /** 4457 — État, TFP à payer. */
  etatTfp: string;
  /** 44525 — État, IR retenu à la source. */
  etatIr: string;
  /** 5141 — Banque (règlement par virement / chèque). */
  banque: string;
  /** 5161 — Caisse (règlement des salaires en espèces). */
  caisse: string;
  /** 3431 — Personnel, avances et acomptes (retenue d'avance/acompte sur salaire). */
  avancesPersonnel: string;
}

export const DEFAULT_ACCOUNTS: PayrollAccounts = {
  remunerations: "6171",
  cnssPatronal: "617411",
  amoPatronal: "617412",
  allocationsFamiliales: "61744",
  tfp: "61678",
  remunerationsDues: "4432",
  cnssOrganisme: "4441",
  etatTfp: "4457",
  etatIr: "44525",
  banque: "5141",
  caisse: "5161",
  avancesPersonnel: "3431",
};

export const ACCOUNT_LABELS: Record<keyof PayrollAccounts, string> = {
  remunerations: "Rémunérations du personnel",
  cnssPatronal: "Cotisations CNSS (part patronale)",
  amoPatronal: "Cotisations AMO (part patronale)",
  allocationsFamiliales: "Prestations familiales (AF)",
  tfp: "Taxe de formation professionnelle",
  remunerationsDues: "Rémunérations dues au personnel",
  cnssOrganisme: "CNSS (organisme social)",
  etatTfp: "État - TFP à payer",
  etatIr: "État - IR retenu à la source",
  banque: "Banque",
  caisse: "Caisse",
  avancesPersonnel: "Personnel - avances et acomptes",
};
