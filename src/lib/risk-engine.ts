/**
 * Cartographie des risques du processus paie — moteur PUR (COSO / ISO 31000, droit social marocain).
 *
 * Le principe qui structure tout : **le risque résiduel se CALCULE, il ne se déclare pas.**
 * La faute classique d'une cartographie est de saisir deux cotations côte à côte — « brut 20 »
 * puis « résiduel 4 » — sans que rien ne justifie l'écart. Le résiduel devient alors une opinion.
 * Ici il est DÉRIVÉ du brut par l'abattement qu'apportent les contrôles réellement en place.
 *
 * Trois règles, non négociables :
 *  1. Un contrôle NON PROUVÉ n'abat rien (`proven: false` → efficacité 0). Un contrôle déclaré
 *     mais non constatable ne réduit pas le risque : il le masque.
 *  2. L'abattement est PLAFONNÉ (`MAX_ABATEMENT_POINTS`). Aucun dispositif ne fait descendre un
 *     risque critique au niveau négligeable.
 *  3. La nature du contrôle détermine l'axe abattu : PRÉVENTIF → probabilité (il empêche
 *     l'événement) ; DÉTECTIF / CORRECTIF → impact (il en limite les conséquences).
 *
 * Aucun effet de bord, aucune lecture du store, aucune horloge : les FAITS constatés sont
 * injectés (`RiskFacts`, cf. `risk-facts.ts`), de sorte que la cartographie soit reproductible
 * d'une édition à l'autre et testable sans navigateur.
 */
import {
  AUTOMATION_FACTOR,
  AXIS_FLOOR,
  CONTROL_WEIGHT,
  DEFAULT_APPETITE,
  levelOf,
  MAX_ABATEMENT_POINTS,
  type RiskLevel,
} from "./risk-params";
import type { CustomRisk } from "@/data/types";

/* ============================================================ types ============================================================ */

/** Étape du processus paie. Un risque se rattache à une ÉTAPE, jamais à un service. */
export type RiskStep =
  | "collecte" | "calcul" | "controle" | "reglement" | "declaration" | "comptabilisation" | "archivage";

export const STEP_LABEL: Record<RiskStep, string> = {
  collecte: "Collecte des données",
  calcul: "Calcul du bulletin",
  controle: "Contrôle et validation",
  reglement: "Règlement des salaires",
  declaration: "Déclarations sociales et fiscales",
  comptabilisation: "Comptabilisation",
  archivage: "Archivage et traçabilité",
};

/** Ordre du processus, de bout en bout. */
export const STEPS: RiskStep[] = [
  "collecte", "calcul", "controle", "reglement", "declaration", "comptabilisation", "archivage",
];

export type RiskCategory =
  | "conformite_sociale" | "fiscal" | "juridique_social" | "financier" | "fraude" | "operationnel" | "donnees";

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  conformite_sociale: "Conformité sociale",
  fiscal: "Fiscal",
  juridique_social: "Juridique / social",
  financier: "Financier",
  fraude: "Fraude",
  operationnel: "Opérationnel",
  donnees: "Données personnelles",
};

/** Nature du contrôle — elle détermine l'axe abattu. */
export type ControlType = "preventif" | "detectif" | "correctif";
export const CONTROL_TYPE_LABEL: Record<ControlType, string> = {
  preventif: "Préventif",
  detectif: "Détectif",
  correctif: "Correctif",
};

export type ControlAutomation = keyof typeof AUTOMATION_FACTOR;
export const AUTOMATION_LABEL: Record<ControlAutomation, string> = {
  automatique: "Automatique",
  semi: "Semi-automatique",
  manuel: "Manuel",
};

export type ControlStrength = keyof typeof CONTROL_WEIGHT;

/**
 * Clé d'un FAIT constatable dans l'application. C'est ce qui distingue cette cartographie d'un
 * tableur : la preuve d'un contrôle n'est pas déclarée, elle est relue à chaque affichage depuis
 * l'état réel de la société. Un contrôle sans clé (`proof: "declaratif"`) n'abat jamais rien.
 */
export type FactKey =
  | "builtIn"
  | "pinConfigured"
  | "rolesSegregated"
  | "loginAuditActive"
  | "allDeclaredCnss"
  | "noSubSmig"
  | "exitDocumented"
  | "exemptionsDocumented"
  | "cinOnFile"
  | "ribOnFile"
  | "medicalOnFile"
  | "bankBaselineSet"
  | "payrollValidated"
  | "accountingLocked"
  | "docArchiveActive"
  | "declarationsOnTime"
  | "noMinorAlert"
  /** Preuve ÉCRITE fournie pour un contrôle saisi à la main. */
  | "declaredProven";

/** Un contrôle du dispositif de maîtrise. */
export interface RiskControl {
  id: string;
  label: string;
  type: ControlType;
  automation: ControlAutomation;
  strength: ControlStrength;
  /**
   * Fait qui PROUVE l'application du contrôle. `"builtIn"` = le contrôle est dans le code et
   * s'exécute toujours. Absent = contrôle purement déclaratif : jamais crédité.
   */
  proof?: FactKey;
  /** Pourquoi le contrôle vaut ce qu'il vaut, ou ce qui manque pour le prouver. */
  note?: string;
}

/** Un risque du référentiel, coté à dispositif NUL. */
export interface RiskDefinition {
  ref: string;
  step: RiskStep;
  category: RiskCategory;
  /** [cause] → [événement redouté] → [conséquence]. */
  event: string;
  /** Base normative VÉRIFIÉE, ou marquée « à confirmer ». */
  basis: string;
  /** Probabilité BRUTE (1-5), cotée comme si aucun contrôle n'existait. */
  grossLikelihood: 1 | 2 | 3 | 4 | 5;
  /** Impact BRUT (1-5). */
  grossImpact: 1 | 2 | 3 | 4 | 5;
  controls: RiskControl[];
}

/** Faits constatés dans l'application pour la société évaluée. */
export type RiskFacts = Partial<Record<FactKey, boolean>>;

/** Un contrôle après confrontation aux faits. */
export interface AssessedControl extends RiskControl {
  proven: boolean;
  /** Abattement réellement apporté par CE contrôle, avant plafonnement collectif. */
  abatement: number;
  /** Axe sur lequel il porte. */
  axis: "likelihood" | "impact";
}

export type Treatment = "reduire" | "accepter" | "transferer" | "eviter";

/** Un risque évalué : brut, dispositif, résiduel, appétence. */
export interface AssessedRisk extends RiskDefinition {
  grossScore: number;
  grossLevel: RiskLevel;
  assessedControls: AssessedControl[];
  provenCount: number;
  /** Abattements plafonnés effectivement appliqués. */
  abatementLikelihood: number;
  abatementImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  residualScore: number;
  residualLevel: RiskLevel;
  /** Réduction en points de score (brut − résiduel). */
  reduction: number;
  /** Réduction en pourcentage du brut, 0-100. */
  reductionPct: number;
  /** Le résiduel dépasse-t-il l'appétence ? */
  aboveAppetite: boolean;
  /** Traitement déduit : « accepter » sous appétence, « réduire » au-dessus. */
  treatment: Treatment;
}

/* ============================================================ référentiel ============================================================ */

/** Raccourci de déclaration d'un contrôle. */
const c = (
  id: string,
  label: string,
  type: ControlType,
  automation: ControlAutomation,
  strength: ControlStrength,
  proof?: FactKey,
  note?: string,
): RiskControl => ({ id, label, type, automation, strength, proof, note });

/**
 * Référentiel des risques du processus paie marocain — 25 événements ancrés.
 *
 * Les cotations brutes sont indicatives et se cotent À DISPOSITIF NUL : c'est le point où la
 * plupart des cartographies dérapent, en cotant spontanément la situation observée aujourd'hui
 * — donc déjà du résiduel —, ce qui écrase l'écart et rend le dispositif de contrôle invisible.
 */
export const RISK_CATALOGUE: RiskDefinition[] = [
  /* ---------------------------------------------- 1. Collecte ---------------------------------------------- */
  {
    ref: "R01", step: "collecte", category: "conformite_sociale",
    event: "Absence de contrôle des entrées → un salarié embauché n'est pas déclaré à la CNSS dans le délai → majoration de retard, astreinte, et exposition à une requalification en travail dissimulé.",
    basis: "dahir 1-72-184 (régime de sécurité sociale)",
    grossLikelihood: 4, grossImpact: 5,
    controls: [
      c("R01-1", "Registre des salariés : statut de déclaration calculé par salarié (déclaré / délai en cours / hors délai)", "detectif", "automatique", "moyen", "builtIn"),
      c("R01-2", "Tous les salariés présents portent un numéro CNSS", "preventif", "automatique", "fort", "allDeclaredCnss"),
      c("R01-3", "Attestation d'immatriculation ou accusé DAMANCOM au dossier du salarié", "preventif", "semi", "moyen", undefined, "Pièce à déposer dans le volet Salariés — non encore généralisée."),
    ],
  },
  {
    ref: "R02", step: "collecte", category: "financier",
    event: "Une sortie n'est pas enregistrée → le salarié continue d'être payé et déclaré après son départ → décaissement indu et assiette CNSS surévaluée.",
    basis: "art. 24 du Code du travail",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R02-1", "Périmètre de paie calculé par période d'emploi : un salarié sorti n'entre plus dans la période", "preventif", "automatique", "fort", "builtIn"),
      c("R02-2", "Date et motif de sortie renseignés pour tous les salariés sortis", "preventif", "automatique", "moyen", "exitDocumented"),
      c("R02-3", "Pièce de sortie au dossier (démission, licenciement + AR, PV de fin de travaux)", "detectif", "semi", "moyen", undefined, "Pièce à déposer dans le volet Salariés."),
    ],
  },
  {
    ref: "R03", step: "collecte", category: "juridique_social",
    event: "Un mineur est employé sans autorisation du représentant légal ni certificat d'aptitude, éventuellement affecté à un site dangereux.",
    basis: "art. 143 à 181 et 327 du Code du travail",
    grossLikelihood: 2, grossImpact: 5,
    controls: [
      c("R03-1", "Alerte de conformité « mineur » sur l'effectif", "detectif", "automatique", "moyen", "noMinorAlert"),
      c("R03-2", "Kit documentaire mineurs (autorisation du représentant légal, contrat dédié)", "preventif", "semi", "moyen", "builtIn"),
      c("R03-3", "Certificat d'aptitude médicale au dossier des mineurs et des postes dangereux", "preventif", "semi", "fort", "medicalOnFile"),
    ],
  },
  {
    ref: "R04", step: "collecte", category: "juridique_social",
    event: "Un salaire est fixé sous le minimum légal du régime (SMIG ou SMAG) → rappel de salaire, amende, contentieux.",
    basis: "art. 356 du Code du travail ; décrets SMIG / SMAG",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R04-1", "Salaire préremplit au minimum du régime de la société à la création de la fiche", "preventif", "automatique", "moyen", "builtIn"),
      c("R04-2", "Aucun salarié présent sous le minimum du régime", "detectif", "automatique", "fort", "noSubSmig"),
    ],
  },
  {
    ref: "R05", step: "collecte", category: "fraude",
    event: "Une fiche salarié est modifiée sans contrôle — erreur de saisie ou acte malveillant — et l'écart se propage silencieusement à la paie, aux déclarations CNSS et aux documents opposables.",
    basis: "contrôle interne (COSO) ; loi 09-08 pour la traçabilité",
    grossLikelihood: 4, grossImpact: 4,
    controls: [
      c("R05-1", "Code de validation à 4 chiffres exigé avant toute écriture sur une fiche salarié (bloquant)", "preventif", "automatique", "fort", "pinConfigured"),
      c("R05-2", "Journal des accès : connexions, échecs et déconnexions horodatés", "detectif", "automatique", "moyen", "loginAuditActive"),
      c("R05-3", "Habilitations par rôle : la lecture seule ne peut écrire aucune donnée", "preventif", "automatique", "moyen", "builtIn"),
    ],
  },
  {
    ref: "R06", step: "collecte", category: "conformite_sociale",
    event: "Un régime dérogatoire (ANAPEC Idmaj / Tahfiz, stage) est appliqué sans convention au dossier → exonération de cotisations injustifiée, redressement sur plusieurs exercices.",
    basis: "conventions ANAPEC ; dahir 1-72-184 — l'exonération porte sur les COTISATIONS, jamais sur la DÉCLARATION",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R06-1", "Convention ANAPEC ou de stage au dossier de chaque salarié exonéré", "preventif", "semi", "fort", "exemptionsDocumented"),
      c("R06-2", "Registre des salariés : statut « régime dérogatoire à confirmer », jamais compté comme conforme", "detectif", "automatique", "moyen", "builtIn"),
    ],
  },

  /* ---------------------------------------------- 2. Calcul ---------------------------------------------- */
  {
    ref: "R07", step: "calcul", category: "fiscal",
    event: "Un barème obsolète est appliqué après une loi de finances ou un décret (SMIG, plafond CNSS, barème IR) → l'ensemble des bulletins de la période est faux.",
    basis: "loi de finances annuelle ; décrets SMIG / SMAG ; dahir CNSS",
    grossLikelihood: 3, grossImpact: 5,
    controls: [
      c("R07-1", "Référentiel unique des taux : aucune valeur réglementaire en dur dans le moteur", "preventif", "automatique", "fort", "builtIn"),
      c("R07-2", "Barèmes datés d'effet : le calcul d'une période ancienne applique le barème d'époque", "preventif", "automatique", "fort", "builtIn"),
      c("R07-3", "Contrôles de cohérence du référentiel (barème IR monotone, taux dans les bornes)", "detectif", "automatique", "moyen", "builtIn"),
    ],
  },
  {
    ref: "R08", step: "calcul", category: "financier",
    event: "Le net est faux sur tout ou partie de l'effectif — plafonnement CNSS, frais professionnels, barème IR mal appliqués → rappels, contentieux, perte de confiance.",
    basis: "CGI (impôt sur le revenu) ; dahir 1-72-184",
    grossLikelihood: 3, grossImpact: 5,
    controls: [
      c("R08-1", "Moteur de calcul pur couvert par tests unitaires à valeurs vérifiées", "preventif", "automatique", "fort", "builtIn"),
      c("R08-2", "Invariants vérifiés sur les bulletins réels (net ≤ brut, CNSS plafonnée, identité du net)", "detectif", "automatique", "fort", "builtIn"),
      c("R08-3", "Restitution des formules réellement exécutées sur un exemple chiffré", "detectif", "automatique", "faible", "builtIn"),
    ],
  },
  {
    ref: "R09", step: "calcul", category: "juridique_social",
    event: "Les heures supplémentaires ne sont pas majorées au bon taux, ou ne sont pas payées → rappel de salaire assorti de dommages-intérêts.",
    basis: "art. 196 à 205 du Code du travail",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R09-1", "Taux de majoration (25 / 50 / 100 %) dans le référentiel, appliqués par le moteur", "preventif", "automatique", "moyen", "builtIn"),
      c("R09-2", "Feuille de pointage ou ordre de mission visé, joint à la période", "preventif", "manuel", "moyen", undefined, "Aucune pièce de pointage n'est rattachée à la période — angle mort du dispositif."),
    ],
  },
  {
    ref: "R10", step: "calcul", category: "juridique_social",
    event: "La prime d'ancienneté est omise, ou un palier n'est pas appliqué à sa date d'échéance → rappel sur plusieurs années.",
    basis: "art. 350 à 352 du Code du travail",
    grossLikelihood: 3, grossImpact: 3,
    controls: [
      c("R10-1", "Prime appliquée par défaut (droit légal) ; la désactiver est un acte explicite", "preventif", "automatique", "moyen", "builtIn"),
      c("R10-2", "Suivi automatique des franchissements de palier sur douze mois glissants", "detectif", "automatique", "moyen", "builtIn"),
    ],
  },
  {
    ref: "R11", step: "calcul", category: "juridique_social",
    event: "Une retenue d'avance dépasse la quotité légale du dixième du net → retenue illicite, restitution et sanction.",
    basis: "art. 385 et 386 du Code du travail",
    grossLikelihood: 2, grossImpact: 3,
    controls: [
      c("R11-1", "Écrêtement automatique de l'échéance au plafond du dixième", "preventif", "automatique", "fort", "builtIn"),
      c("R11-2", "Avertissement explicite sur l'allongement de la durée de remboursement", "detectif", "automatique", "faible", "builtIn"),
    ],
  },

  /* ---------------------------------------------- 3. Contrôle ---------------------------------------------- */
  {
    ref: "R12", step: "controle", category: "fraude",
    event: "Une paie est figée sans double consentement, ou par une personne non habilitée → écritures et déclarations engagées sur des montants non revus.",
    basis: "contrôle interne (COSO)",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R12-1", "Code de validation exigé avant le gel de la paie et le verrouillage des écritures", "preventif", "automatique", "fort", "pinConfigured"),
      c("R12-2", "Habilitations par rôle sur les actions de validation", "preventif", "automatique", "moyen", "builtIn"),
      c("R12-3", "Journal des accès horodaté", "detectif", "automatique", "faible", "loginAuditActive"),
    ],
  },
  {
    ref: "R13", step: "controle", category: "conformite_sociale",
    event: "Une période déjà déclarée est modifiée après coup → l'assiette déclarée ne correspond plus aux pièces, et l'écart est indétectable en aval.",
    basis: "loi 9-88 art. 22 (intangibilité des écritures) ; dahir 1-72-184",
    grossLikelihood: 2, grossImpact: 4,
    controls: [
      c("R13-1", "Gel de période et instantané figé des écritures à la validation", "preventif", "automatique", "fort", "builtIn"),
      c("R13-2", "Régularisation par écriture de reclassement datée du jour, jamais par réécriture de l'instantané", "correctif", "automatique", "fort", "builtIn"),
      c("R13-3", "Période close verrouillée pour la société évaluée", "preventif", "automatique", "moyen", "accountingLocked"),
    ],
  },
  {
    ref: "R14", step: "controle", category: "fraude",
    event: "Une seule personne saisit, calcule, valide et règle la paie → aucune séparation des tâches, la fraude ne rencontre aucun obstacle.",
    basis: "contrôle interne (COSO) — séparation des tâches",
    grossLikelihood: 4, grossImpact: 4,
    controls: [
      c("R14-1", "Au moins deux comptes actifs de rôles distincts sur l'application", "preventif", "automatique", "fort", "rolesSegregated"),
      c("R14-2", "Code de validation détenu par une personne distincte du gestionnaire de paie", "preventif", "manuel", "moyen", undefined, "Organisationnel : l'application ne peut pas constater qui détient le code."),
    ],
  },

  /* ---------------------------------------------- 4. Règlement ---------------------------------------------- */
  {
    ref: "R15", step: "reglement", category: "fraude",
    event: "Un RIB de salarié est modifié frauduleusement et le virement du mois part sur un compte tiers → détournement, difficilement récupérable.",
    basis: "fraude au virement ; devoir de vigilance de l'employeur",
    grossLikelihood: 3, grossImpact: 5,
    controls: [
      c("R15-1", "Base de référence des RIB et détection d'écart (empreinte salée, jamais le clair)", "detectif", "automatique", "fort", "bankBaselineSet"),
      c("R15-2", "RIB officiel et demande écrite signée au dossier du salarié", "preventif", "semi", "fort", "ribOnFile"),
      c("R15-3", "Contre-appel du salarié avant toute modification de coordonnées bancaires", "preventif", "manuel", "fort", undefined, "Procédure organisationnelle : aucune trace dans l'application."),
    ],
  },
  {
    ref: "R16", step: "reglement", category: "juridique_social",
    event: "Un salaire payé en espèces n'est pas prouvé — aucun état d'émargement signé → en contentieux, l'employeur ne peut pas établir le paiement.",
    basis: "art. 370 du Code du travail",
    grossLikelihood: 4, grossImpact: 4,
    controls: [
      c("R16-1", "État de règlement nominatif par mode (virement / chèque / espèces) avec solde par compte de trésorerie", "detectif", "automatique", "moyen", "builtIn"),
      c("R16-2", "État d'émargement signé, scanné et archivé", "preventif", "manuel", "fort", undefined, "Non couvert : aucun émargement n'est rattaché à la période. Angle mort majeur du dispositif."),
    ],
  },
  {
    ref: "R17", step: "reglement", category: "financier",
    event: "Un salarié est payé deux fois, ou omis du règlement → décaissement indu ou réclamation.",
    basis: "contrôle interne",
    grossLikelihood: 2, grossImpact: 3,
    controls: [
      c("R17-1", "État de règlement dérivé des seuls bulletins validés, sans ressaisie", "detectif", "automatique", "fort", "builtIn"),
      c("R17-2", "Rapprochement bancaire du montant réglé", "detectif", "manuel", "moyen", undefined, "Hors application : à opérer en comptabilité."),
    ],
  },

  /* ---------------------------------------------- 5. Déclarations ---------------------------------------------- */
  {
    ref: "R18", step: "declaration", category: "conformite_sociale",
    event: "La déclaration CNSS est déposée après le 10 du mois suivant → majoration de retard sur les cotisations et astreinte par salarié.",
    basis: "dahir 1-72-184 ; réforme des taux de majoration au 01/04/2025 (à confirmer CNSS)",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R18-1", "Calcul de la majoration et de l'astreinte, avec l'échéance de la période", "detectif", "automatique", "moyen", "builtIn"),
      c("R18-2", "Aucune période validée ne reste non déclarée au-delà de son échéance", "preventif", "automatique", "fort", "declarationsOnTime"),
      c("R18-3", "Accusé de télédéclaration DAMANCOM archivé", "detectif", "semi", "moyen", undefined, "Non couvert : l'accusé n'est rattaché à aucune période."),
    ],
  },
  {
    ref: "R19", step: "declaration", category: "conformite_sociale",
    event: "L'assiette déclarée à la CNSS diffère de la paie comptabilisée → écart relevé en contrôle, redressement sur la période et présomption sur les précédentes.",
    basis: "dahir 1-72-184 ; CGNC",
    grossLikelihood: 3, grossImpact: 5,
    controls: [
      c("R19-1", "Déclaration et écritures dérivées des MÊMES bulletins validés (source unique, aucun recalcul)", "preventif", "automatique", "fort", "builtIn"),
      c("R19-2", "Paie de la dernière période close réellement validée et figée", "preventif", "automatique", "moyen", "payrollValidated"),
      c("R19-3", "Audit comptable : contrôle de cohérence des comptes d'organismes sociaux", "detectif", "automatique", "moyen", "builtIn"),
    ],
  },
  {
    ref: "R20", step: "declaration", category: "fiscal",
    event: "L'IR retenu à la source n'est pas reversé, ou l'état 9421 est erroné → majoration, amende, et responsabilité personnelle du dirigeant.",
    basis: "CGI art. 79 (déclaration des traitements et salaires)",
    grossLikelihood: 2, grossImpact: 5,
    controls: [
      c("R20-1", "État 9421 dérivé des bulletins validés", "preventif", "automatique", "fort", "builtIn"),
      c("R20-2", "IR isolé au compte 44525 dans l'écriture de paie", "detectif", "automatique", "moyen", "builtIn"),
      c("R20-3", "Accusé SIMPL-IR et avis de paiement archivés", "detectif", "semi", "moyen", undefined, "Non couvert : l'accusé DGI n'est rattaché à aucune période."),
    ],
  },

  /* ---------------------------------------------- 6. Comptabilisation ---------------------------------------------- */
  {
    ref: "R21", step: "comptabilisation", category: "financier",
    event: "Une écriture de paie est déséquilibrée ou mal ventilée entre les comptes d'organismes → comptes sociaux faux, rapprochement impossible.",
    basis: "CGNC / PCGE ; loi 9-88",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R21-1", "Invariants bloquants à la génération : débit = crédit, organismes = somme des cotisations, 6171 = 4432 + retenues + IR", "preventif", "automatique", "fort", "builtIn"),
      c("R21-2", "Libellés et numéros de comptes normalisés sur le guide PCGE", "preventif", "automatique", "moyen", "builtIn"),
      c("R21-3", "Audit comptable déterministe (soldes anormaux, comptes d'attente, lettrage)", "detectif", "automatique", "moyen", "builtIn"),
    ],
  },
  {
    ref: "R22", step: "comptabilisation", category: "fiscal",
    event: "Une écriture est passée sans pièce justificative conservée → comptabilité irrégulière, rejet possible en contrôle fiscal.",
    basis: "loi 9-88 art. 22 — pièce justificative datée, conservation 10 ans",
    grossLikelihood: 4, grossImpact: 4,
    controls: [
      c("R22-1", "Écriture dérivée du livre de paie de la période (pièce interne reconstituable)", "preventif", "automatique", "moyen", "builtIn"),
      c("R22-2", "Pièce justificative rattachée à chaque écriture", "preventif", "semi", "fort", undefined, "Non couvert : la colonne « Pièce » de l'export comptable ne pointe vers aucun fichier."),
    ],
  },

  /* ---------------------------------------------- 7. Archivage ---------------------------------------------- */
  {
    ref: "R23", step: "archivage", category: "juridique_social",
    event: "Le livre de paie n'est pas tenu, ou n'est pas conservé deux ans → registre légal manquant en cas de contrôle de l'inspection du travail.",
    basis: "art. 371 et 373 du Code du travail",
    grossLikelihood: 3, grossImpact: 4,
    controls: [
      c("R23-1", "Livre de paie généré automatiquement des bulletins validés, aux montants figés", "preventif", "automatique", "fort", "builtIn"),
      c("R23-2", "Au moins une période validée alimente le livre pour la société", "detectif", "automatique", "moyen", "payrollValidated"),
    ],
  },
  {
    ref: "R24", step: "archivage", category: "juridique_social",
    event: "La preuve de remise d'un document est perdue — bulletin, avertissement, solde de tout compte → une sanction non notifiée est nulle, un solde non signé est inopposable.",
    basis: "art. 62-63, 73-76 et 370 du Code du travail",
    grossLikelihood: 4, grossImpact: 4,
    controls: [
      c("R24-1", "Journal des documents : chaque document produit est tracé (type, format, sujet, auteur, date)", "detectif", "automatique", "moyen", "builtIn"),
      c("R24-2", "Archivage du PDF réellement remis, retéléchargeable tel quel", "detectif", "automatique", "fort", "docArchiveActive"),
      c("R24-3", "Accusé de réception signé du salarié, scanné et rattaché", "preventif", "manuel", "fort", undefined, "Non couvert : l'accusé signé n'est rattaché ni au document ni au salarié."),
    ],
  },
  {
    ref: "R25", step: "archivage", category: "donnees",
    event: "Des données personnelles fuitent — RIB, CIN, pièces médicales — par export, partage ou accès non habilité.",
    basis: "loi 09-08 relative à la protection des personnes physiques (CNDP)",
    grossLikelihood: 2, grossImpact: 5,
    controls: [
      c("R25-1", "Habilitations par rôle : les zones sensibles sont réservées au super administrateur", "preventif", "automatique", "moyen", "builtIn"),
      c("R25-2", "Minimisation : le registre du personnel exporté ne contient ni salaire ni RIB (verrouillé par test)", "preventif", "automatique", "moyen", "builtIn"),
      c("R25-3", "RIB conservés sous empreinte salée, jamais en clair", "preventif", "automatique", "fort", "builtIn"),
      c("R25-4", "Déclaration CNDP du traitement des données du personnel", "preventif", "manuel", "moyen", undefined, "Non couvert : aucun récépissé CNDP n'est enregistré."),
    ],
  },
];

/* ============================================================ risques saisis ============================================================ */

/**
 * Convertit un risque saisi à la main en définition du référentiel, pour qu'il soit coté,
 * exporté et suivi EXACTEMENT comme les autres. Un risque propre à l'entité n'est pas un
 * citoyen de seconde zone de la cartographie.
 *
 * Différence de fond : la preuve d'un contrôle saisi est DÉCLARÉE, pas constatée. On l'exige
 * donc écrite — un contrôle coché « prouvé » sans preuve renseignée n'abat rien, exactement
 * comme un contrôle déclaratif du référentiel.
 */
export function customToDefinition(c: CustomRisk): RiskDefinition {
  const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
  return {
    ref: c.ref,
    step: (STEPS as string[]).includes(c.step) ? (c.step as RiskStep) : "collecte",
    category: (Object.keys(CATEGORY_LABEL) as string[]).includes(c.category)
      ? (c.category as RiskCategory) : "operationnel",
    event: c.event,
    basis: c.basis || "Base à préciser",
    grossLikelihood: clamp(c.grossLikelihood),
    grossImpact: clamp(c.grossImpact),
    controls: c.controls.map((ct) => ({
      id: ct.id,
      label: ct.label,
      type: (["preventif", "detectif", "correctif"] as string[]).includes(ct.type) ? (ct.type as ControlType) : "preventif",
      automation: (["automatique", "semi", "manuel"] as string[]).includes(ct.automation) ? (ct.automation as ControlAutomation) : "manuel",
      strength: (["fort", "moyen", "faible"] as string[]).includes(ct.strength) ? (ct.strength as ControlStrength) : "moyen",
      // Preuve exigée par écrit : cocher « prouvé » ne suffit pas.
      proof: ct.proven && ct.evidence?.trim() ? "declaredProven" : undefined,
      note: ct.proven && !ct.evidence?.trim()
        ? "Déclaré appliqué mais AUCUNE preuve renseignée : n'abat rien tant que la preuve manque."
        : ct.evidence?.trim() || undefined,
    })),
  };
}

/** Référence libre disponible pour un nouveau risque saisi : L01, L02… */
export function nextCustomRef(existing: CustomRisk[]): string {
  let n = 1;
  const used = new Set(existing.map((c) => c.ref.toUpperCase()));
  while (used.has(`L${String(n).padStart(2, "0")}`)) n += 1;
  return `L${String(n).padStart(2, "0")}`;
}

/* ============================================================ moteur ============================================================ */

/** Le contrôle est-il PROUVÉ ? Sans clé de preuve (contrôle déclaratif), la réponse est non. */
export function isProven(control: RiskControl, facts: RiskFacts): boolean {
  if (!control.proof) return false;
  if (control.proof === "builtIn") return true;
  return facts[control.proof] === true;
}

/** Abattement apporté par un contrôle prouvé : poids × facteur d'automatisation. */
export function controlAbatement(control: RiskControl): number {
  return CONTROL_WEIGHT[control.strength] * AUTOMATION_FACTOR[control.automation];
}

/** Axe abattu : préventif → probabilité (empêche) ; détectif / correctif → impact (limite). */
export function controlAxis(type: ControlType): "likelihood" | "impact" {
  return type === "preventif" ? "likelihood" : "impact";
}

/** Applique l'abattement à un axe : plafonné, plancher à 1, jamais au-dessus du brut. */
export function abate(gross: number, abatement: number): number {
  const capped = Math.min(abatement, MAX_ABATEMENT_POINTS);
  return Math.max(AXIS_FLOOR, Math.min(gross, Math.round(gross - capped)));
}

/**
 * Évalue un risque : confronte ses contrôles aux faits, calcule le résiduel, compare à l'appétence.
 */
export function assessRisk(def: RiskDefinition, facts: RiskFacts, appetite = DEFAULT_APPETITE): AssessedRisk {
  const assessedControls: AssessedControl[] = def.controls.map((ctrl) => {
    const proven = isProven(ctrl, facts);
    return {
      ...ctrl,
      proven,
      abatement: proven ? controlAbatement(ctrl) : 0,
      axis: controlAxis(ctrl.type),
    };
  });

  const sum = (axis: "likelihood" | "impact") =>
    assessedControls.filter((a) => a.axis === axis).reduce((t, a) => t + a.abatement, 0);

  const rawL = sum("likelihood");
  const rawI = sum("impact");

  const residualLikelihood = abate(def.grossLikelihood, rawL);
  const residualImpact = abate(def.grossImpact, rawI);

  const grossScore = def.grossLikelihood * def.grossImpact;
  const residualScore = residualLikelihood * residualImpact;
  const reduction = grossScore - residualScore;
  const aboveAppetite = residualScore > appetite;

  return {
    ...def,
    grossScore,
    grossLevel: levelOf(grossScore),
    assessedControls,
    provenCount: assessedControls.filter((a) => a.proven).length,
    // Abattements RÉELLEMENT appliqués (plafonnés), pas la somme brute : c'est ce que le
    // lecteur doit voir pour comprendre l'écart, sinon les chiffres ne se recoupent pas.
    abatementLikelihood: def.grossLikelihood - residualLikelihood,
    abatementImpact: def.grossImpact - residualImpact,
    residualLikelihood,
    residualImpact,
    residualScore,
    residualLevel: levelOf(residualScore),
    reduction,
    reductionPct: grossScore === 0 ? 0 : Math.round((reduction / grossScore) * 100),
    aboveAppetite,
    treatment: aboveAppetite ? "reduire" : "accepter",
  };
}

export interface RiskExposure {
  count: number;
  /** Répartition par niveau, brut puis résiduel. */
  grossByLevel: Record<RiskLevel, number>;
  residualByLevel: Record<RiskLevel, number>;
  grossTotal: number;
  residualTotal: number;
  /** Réduction globale d'exposition, en pourcentage. */
  reductionPct: number;
  /** Risques dont le résiduel dépasse l'appétence. */
  aboveAppetite: number;
  /** Contrôles prouvés / total, sur l'ensemble du dispositif. */
  controlsProven: number;
  controlsTotal: number;
  /** Score résiduel moyen, une décimale. */
  avgResidual: number;
}

const emptyByLevel = (): Record<RiskLevel, number> => ({ faible: 0, modere: 0, eleve: 0, critique: 0 });

/** Synthèse d'exposition sur un ensemble de risques évalués. */
export function exposure(risks: AssessedRisk[]): RiskExposure {
  const grossByLevel = emptyByLevel();
  const residualByLevel = emptyByLevel();
  let grossTotal = 0;
  let residualTotal = 0;
  let aboveAppetite = 0;
  let controlsProven = 0;
  let controlsTotal = 0;

  for (const r of risks) {
    grossByLevel[r.grossLevel] += 1;
    residualByLevel[r.residualLevel] += 1;
    grossTotal += r.grossScore;
    residualTotal += r.residualScore;
    if (r.aboveAppetite) aboveAppetite += 1;
    controlsTotal += r.assessedControls.length;
    controlsProven += r.provenCount;
  }

  return {
    count: risks.length,
    grossByLevel,
    residualByLevel,
    grossTotal,
    residualTotal,
    reductionPct: grossTotal === 0 ? 0 : Math.round(((grossTotal - residualTotal) / grossTotal) * 100),
    aboveAppetite,
    controlsProven,
    controlsTotal,
    avgResidual: risks.length === 0 ? 0 : Math.round((residualTotal / risks.length) * 10) / 10,
  };
}

/**
 * Cartographie complète : chaque risque du référentiel évalué contre les faits constatés,
 * trié du résiduel le plus élevé au plus faible (l'attention va où le risque reste).
 */
export function buildRiskMap(
  facts: RiskFacts,
  appetite = DEFAULT_APPETITE,
  catalogue = RISK_CATALOGUE,
  custom: CustomRisk[] = [],
): AssessedRisk[] {
  // Un contrôle saisi ne devient « prouvé » que si sa preuve écrite a été renseignée : c'est
  // `customToDefinition` qui pose la clé, on se contente ici de la reconnaître.
  const merged = [...catalogue, ...custom.map(customToDefinition)];
  return merged
    .map((d) => assessRisk(d, { ...facts, declaredProven: true }, appetite))
    .sort((a, b) => b.residualScore - a.residualScore || b.grossScore - a.grossScore || a.ref.localeCompare(b.ref));
}

/**
 * Contrôles NON PROUVÉS regroupés — la liste des angles morts du dispositif. C'est la sortie la
 * plus actionnable de la cartographie : chaque ligne est un contrôle qui n'abat rien aujourd'hui.
 */
export interface ControlGap {
  /** Le contrôle tel qu'ÉVALUÉ (donc `proven: false` ici) — pas sa simple définition. */
  control: AssessedControl;
  /** Risques que ce contrôle couvrirait s'il était prouvé. */
  refs: string[];
  /** Abattement qu'il apporterait une fois prouvé. */
  potential: number;
  axis: "likelihood" | "impact";
}

export function controlGaps(risks: AssessedRisk[]): ControlGap[] {
  const map = new Map<string, ControlGap>();
  for (const r of risks) {
    for (const ctrl of r.assessedControls) {
      if (ctrl.proven) continue;
      const key = ctrl.label;
      const cur = map.get(key);
      if (cur) cur.refs.push(r.ref);
      else {
        map.set(key, {
          control: ctrl,
          refs: [r.ref],
          potential: controlAbatement(ctrl),
          axis: ctrl.axis,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.refs.length * b.potential - a.refs.length * a.potential);
}

/**
 * Matrice de criticité 5 × 5 : pour chaque case (probabilité, impact), les références des risques
 * qui s'y trouvent. `axis` choisit la lecture — brute ou résiduelle.
 */
export function criticityMatrix(risks: AssessedRisk[], axis: "gross" | "residual"): string[][][] {
  // grid[impact-1][likelihood-1] — impact en ordonnée pour une lecture « haut = grave ».
  const grid: string[][][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => [] as string[]));
  for (const r of risks) {
    const l = axis === "gross" ? r.grossLikelihood : r.residualLikelihood;
    const i = axis === "gross" ? r.grossImpact : r.residualImpact;
    grid[i - 1][l - 1].push(r.ref);
  }
  return grid;
}

/** Réserve portée sur tout export — une cartographie n'est pas un certificat de conformité. */
export const RISK_DISCLAIMER =
  "Cartographie établie à dispositif constaté dans l'application à la date d'arrêté. Les cotations "
  + "brutes sont des estimations à valider par la direction ; les bases normatives signalées « à "
  + "confirmer » doivent l'être avant tout usage déclaratif ou contentieux. Un contrôle non prouvé "
  + "n'abat rien : son absence d'effet est un constat, pas une opinion. Ce document ne vaut ni "
  + "certificat de conformité, ni rapport d'audit.";
