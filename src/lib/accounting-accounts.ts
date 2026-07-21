/**
 * Plan de comptes de paie par défaut — PCGE / CGNC marocain.
 * Validé par l'expert-comptable (corpus PCGE classes 4 & 6, CNSS). Modifiable par société.
 * Aucun numéro de compte codé en dur ailleurs que dans ce fichier.
 *
 * Points de conformité (expert-comptable) :
 *  - 61741 = cotisations de sécurité sociale (CNSS + AMO patronales) ; 61742 = RETRAITE, 61743 = MUTUELLES.
 *    -> l'AMO patronale se loge sous 61741 (sous-comptes 617411/617412), jamais 61742/61743.
 *  - TFP = TAXE (pas une cotisation) -> charge 6167 (61671) ; au crédit 4457 (État - taxes à payer), pas 4441.
 *  - AMO (sal.+patr.) se paie sur le bordereau CNSS -> crédit 4441 (pas 4445 Mutuelles).
 *  - IR retenu à la source sur salaires -> 44525.
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
  /** 61671 — Taxe de formation professionnelle (impôts et taxes, pas une cotisation). */
  tfp: string;
  /** 4432 — Rémunérations dues au personnel (net à payer). */
  remunerationsDues: string;
  /** 4441 — CNSS (CNSS + AMO + AF, parts salariale et patronale). */
  cnssOrganisme: string;
  /** 4457 — État, TFP à payer. */
  etatTfp: string;
  /** 44525 — État, IR retenu à la source. */
  etatIr: string;
  /** 5141 — Banque (règlement). */
  banque: string;
}

export const DEFAULT_ACCOUNTS: PayrollAccounts = {
  remunerations: "6171",
  cnssPatronal: "617411",
  amoPatronal: "617412",
  allocationsFamiliales: "61744",
  tfp: "61671",
  remunerationsDues: "4432",
  cnssOrganisme: "4441",
  etatTfp: "4457",
  etatIr: "44525",
  banque: "5141",
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
};
