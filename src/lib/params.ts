/**
 * Référentiel réglementaire Maroc — table `payroll_params` (spec §4.7).
 *
 * RÈGLE PERMANENTE : aucun taux, plafond ou barème ne doit être codé en dur ailleurs
 * que dans ce fichier. Toute loi de finances / revalorisation SMIG-SMAG se traduit par
 * une nouvelle entrée d'année, sans toucher au moteur (`payroll-engine.ts`).
 *
 * Sources : Code du travail (art. 201, 350-352), CGI art. 59-I-A, régime CNSS/AMO,
 * barème IR LF 2025. Cf. journal d'audit v2 (07/07/2026) de la spécification.
 */

export interface IrBracket {
  /** Borne haute de la tranche ANNUELLE en DH (Infinity pour la dernière). */
  upTo: number;
  rate: number;
  /** Somme à déduire (méthode rapide du barème). */
  deduct: number;
}

export interface PayrollParams {
  year: number;
  /** SMIG horaire (DH). */
  smigHourly: number;
  /** Base mensuelle légale (heures). */
  legalMonthlyHours: number;
  /** SMAG journalier (régime agricole, DH). */
  smagDaily: number;
  /** Convention : nombre de jours travaillés par mois (pour mensualiser un salaire journalier). */
  smagMonthlyDays: number;
  /** Nombre de jours ouvrés d'un mois complet — base de la proratisation du salaire (26 j = 191 h). */
  standardMonthlyDays: number;

  /** Majorations heures supplémentaires (art. 201). */
  overtime: {
    day: number; // jour ouvrable, 6h-21h : +25 %
    night: number; // jour ouvrable, 21h-6h : +50 %
    restDay: number; // repos/férié, jour : +50 %
    restNight: number; // repos/férié, nuit : +100 %
  };

  /** Prime d'ancienneté (art. 350-352) : seuils croissants en années -> taux. */
  seniority: { years: number; rate: number }[];

  /** Cotisations salariales. */
  cnssEmployeeRate: number; // 4,48 %
  cnssCeiling: number; // 6 000 DH/mois
  amoEmployeeRate: number; // 2,26 % déplafonné
  /**
   * Mois d'ENTRÉE EN VIGUEUR de l'AMO (« AAAA-MM »). Avant ce mois, l'AMO n'existait pas :
   * aucune cotisation AMO (ni salariale ni patronale) — DAMANCOM ne la comptait pas. Le moteur
   * neutralise donc l'AMO pour toute période antérieure, au MOIS près (l'AMO a démarré le
   * 01/03/2006, pas au 1er janvier). Absent = AMO applicable sans restriction de date.
   */
  amoEffectiveFrom?: string;

  /** Charges patronales — agrégats. */
  cnssEmployerRate: number; // 8,98 %
  familyAllocRate: number; // 6,40 %
  amoEmployerRate: number; // 4,11 % (2,26 + 1,85)
  tfpRate: number; // 1,60 %

  /** Charges patronales — détail réglementaire (bulletin officiel). */
  cnssEmployerCourtTermeRate: number; // 0,67 %
  cnssEmployerIpeRate: number; // 0,38 % (perte d'emploi)
  cnssEmployerLongTermeRate: number; // 7,93 %  (0,67 + 0,38 + 7,93 = 8,98)
  amoEmployerBaseRate: number; // 2,26 %
  amoEmployerSolidariteRate: number; // 1,85 %  (2,26 + 1,85 = 4,11)

  /** Frais professionnels (CGI art. 59-I-A). */
  fraisProLowRate: number; // 35 %
  fraisProLowThresholdAnnual: number; // SBI annuel <= 78 000 -> 35 % sans écrêtement
  fraisProHighRate: number; // 25 %
  fraisProHighCapAnnual: number; // plafond 35 000 DH/an (taux 25 % uniquement)

  /** IR — barème annuel LF 2025. */
  irBrackets: IrBracket[];

  /** Charges de famille : déduction mensuelle par personne à charge et plafond. */
  familyDeductionMonthly: number; // 41,67 DH
  familyDeductionMaxPersons: number; // 6

  /** Indemnités exonérées (plafonds légaux). */
  panierPerDayCapFactor: number; // 2 x SMIG horaire / jour travaillé
  transportIntraUrbanCap: number; // 500 DH/mois
  transportOutsideUrbanCap: number; // 750 DH/mois
  /**
   * Barème des indemnités exonérées — plafonds IR et CNSS DISTINCTS (cf. `IndemniteDef`).
   * Remplace les plafonds infinis `laitCap` / `representationCap` : une indemnité exonérée sans
   * limite est un trou dans l'assiette, pas une exonération.
   */
  indemnitesBareme: IndemniteDef[];

  /**
   * Plafond mensuel de retenue d'une AVANCE / prêt employeur = 1/10 du salaire échu
   * (art. 386 du Code du travail — « retenues successives ne dépassant pas le dixième »).
   * L'ACOMPTE (salaire déjà gagné, art. 385/386) N'EST PAS soumis à ce plafond.
   * Base retenue par l'app : le net à payer du mois. Réserve : pour les bas salaires, le barème
   * de la quotité cessible (art. 387 CT / art. 488 CPC) peut offrir un plafond plus protecteur —
   * à confirmer par le conseil juridique avant tout durcissement automatique.
   */
  advanceMonthlyCapRate: number; // 0,10 (le dixième)

  /** Congés payés (Code du travail, art. 231-232). */
  paidLeavePerMonth: number; // 1,5 jour ouvrable/mois (art. 231) — 18 j/an
  paidLeaveMinorPerMonth: number; // 2 jours/mois pour les salariés de moins de 18 ans (art. 231) — 24 j/an
  paidLeaveSeniorityBonusDays: number; // majoration d'ancienneté : +1,5 jour (art. 232)
  paidLeaveSeniorityTrancheYears: number; // par tranche entière de 5 ans de service (art. 232)
  paidLeaveMaxDays: number; // plafond total du congé annuel : 30 jours ouvrables (art. 232)

  /** Solde de tout compte — barèmes de rupture (Code du travail + CGI). */
  stc: StcParams;

  /** Registre du personnel — délais et expositions de la déclaration CNSS. */
  registre: RegistreParams;

  /** Pénalités CNSS d'une déclaration tardive / complémentaire (majorations + astreinte). */
  declarationPenalty: DeclarationPenaltyParams;
}

/**
 * Régime des pénalités CNSS applicables à une déclaration COMPLÉMENTAIRE ou tardive
 * (art. 28 du Dahir 1-72-184 et pratique CNSS/DAMANCOM). Deux postes CUMULABLES :
 *   1. Majoration de retard sur le PAIEMENT des cotisations (assiette = cotisations dues).
 *   2. Astreinte pour DÉCLARATION tardive (au-delà d'un seuil de mois).
 *
 * AVERTISSEMENT DE FIABILITÉ : les sources publiques divergent sur le taux du 1er mois
 * (3 % officiel CNSS vs 5 % selon certains cabinets) et sur le mode exact de l'astreinte.
 * Valeurs prudentes (officielles), `sourceNote` à afficher partout. À confirmer auprès de la
 * CNSS / du conseil avant toute régularisation contentieuse. Le taux « par mois supplémentaire »
 * a été RÉFORMÉ au 01/04/2025 (1 % → 0,5 %) : il se choisit selon la DATE D'EXIGIBILITÉ de la
 * période régularisée, d'où la date de réforme et les deux taux ci-dessous.
 */
export interface DeclarationPenaltyParams {
  /** Majoration du 1er mois (ou fraction) de retard, sur les cotisations dues. Ex. 3 %. */
  firstMonthRate: number;
  /** Date de réforme du taux « par mois supplémentaire » (ISO « AAAA-MM-JJ »). */
  extraMonthRateReformDate: string;
  /** Taux par mois supplémentaire AVANT la réforme (période exigible avant la date). Ex. 1 %. */
  extraMonthRateBefore: number;
  /** Taux par mois supplémentaire À PARTIR de la réforme. Ex. 0,5 %. */
  extraMonthRateAfter: number;
  /** Astreinte de déclaration tardive : DH par mois de retard et par salarié, au-delà du seuil. */
  astreintePerMonthPerEmployee: number;
  /** Seuil (mois de retard) au-delà duquel l'astreinte s'applique. */
  astreinteThresholdMonths: number;
  /** Jour du mois M+1 avant lequel la déclaration/paiement DAMANCOM est dû (le retard court après). */
  dueDayOfNextMonth: number;
  /** Mention de source/réserve à afficher avec tout calcul de pénalité. */
  sourceNote: string;
}

/**
 * Délais et sanctions encadrant la déclaration d'un salarié à la CNSS.
 *
 * Ces valeurs vivent ici — et NON dans le moteur du registre — parce qu'elles relèvent du décret
 * et de la pratique CNSS, donc changent sans toucher au Code du travail.
 *
 * AVERTISSEMENT DE FIABILITÉ : les sources publiques divergent sur le délai d'immatriculation
 * d'un NOUVEAU SALARIÉ (48 h selon certaines, 30 jours selon d'autres), alors qu'elles
 * s'accordent sur les 30 jours d'AFFILIATION DE L'ENTREPRISE après l'embauche du premier
 * salarié — deux obligations distinctes, souvent confondues. La valeur retenue ci-dessous est
 * donc la plus prudente pour l'employeur (la plus courte), et `sourceNote` doit être affichée
 * partout où l'échéance est présentée. À faire confirmer auprès de la CNSS ou du conseil
 * juridique avant tout usage contentieux.
 */
export interface RegistreParams {
  /** Délai d'immatriculation d'un nouveau salarié, en jours calendaires depuis l'embauche. */
  declarationDeadlineDays: number;
  /** Délai d'affiliation de l'entreprise après l'embauche du premier salarié (jours). */
  affiliationDeadlineDays: number;
  /**
   * Ordre de grandeur de l'amende par salarié non immatriculé (DH). ORDRE DE GRANDEUR, jamais
   * un calcul exact : le poste dominant reste le rappel de cotisations depuis l'embauche réelle.
   */
  amendeNonImmatriculationParSalarie: number;
  /** Majoration mensuelle par salarié au-delà du seuil de retard (DH/mois). */
  majorationRetardMensuelleParSalarie: number;
  /** Seuil de retard (mois) à partir duquel la majoration mensuelle s'applique. */
  seuilRetardMois: number;
  /** Mention de source à afficher avec toute échéance ou exposition. */
  sourceNote: string;
}

/** Barème de préavis : durée en mois OU en jours, par seuil d'ancienneté (années révolues). */
export interface PreavisBracket {
  /** Ancienneté minimale (années) pour appliquer ce niveau. */
  minYears: number;
  /** Durée du préavis en mois (indemnité = salaire mensuel × months). */
  months?: number;
  /** Durée du préavis en jours ouvrables (indemnité = (salaire/26) × days). */
  days?: number;
}

/** Tranche d'indemnité de licenciement (art. 52-53) : heures de salaire par année. */
export interface LicenciementTranche {
  /** Borne haute de la tranche d'ancienneté (années). Infinity pour la dernière. */
  upToYears: number;
  /** Heures de salaire dues par année d'ancienneté dans cette tranche. */
  hoursPerYear: number;
}

/** Paramètres du calcul de solde de tout compte (STC). */
export interface StcParams {
  /** Heures mensuelles servant de diviseur pour le taux horaire de référence (191 h). */
  monthlyHoursRef: number;
  /** Jours ouvrables mensuels servant de diviseur pour le taux journalier (26 j). */
  workingDaysPerMonth: number;
  /** Barème de préavis (art. 43) selon la catégorie. */
  preavis: { cadre: PreavisBracket[]; nonCadre: PreavisBracket[] };
  /** Ancienneté minimale (en mois) ouvrant droit à l'indemnité de licenciement (art. 52). */
  licenciementMinSeniorityMonths: number;
  /** Barème de l'indemnité légale de licenciement (art. 53). */
  licenciement: LicenciementTranche[];
  /** Dommages-intérêts licenciement abusif (art. 41) : mois de salaire par année. */
  abusiveMonthsPerYear: number;
  /** Plafond des dommages-intérêts (art. 41), en mois de salaire. */
  abusiveMaxMonths: number;
  /** Indemnité de fin de CDD : taux sur le total brut perçu. */
  cddEndRate: number;
}

/* ============================================================================================
 * INDEMNITÉS EXONÉRÉES — barème établi sur les DEUX TEXTES OFFICIELS
 * ============================================================================================
 *
 * CNSS — Arrêté de la ministre de l'Économie et des Finances n° 1314-25 du 21 kaada 1446
 *        (19 mai 2025), pris pour l'application du décret n° 2-25-266, publié au Bulletin
 *        officiel n° 7443 du 29 septembre 2025 (édition arabe, p. 7324-7332), en vigueur au
 *        1er octobre 2025. Annexe : 7 titres, 44 éléments. Référencé ci-dessous « BO 7443 ».
 *
 * IR   — Note de service de la Direction générale des impôts du 13 mars 2017, « Exonérations
 *        des indemnités prévues par l'article 57-1° du CGI », tableau récapitulatif des plafonds.
 *        Référencée ci-dessous « note DGI 2017 ». Elle précise : « Le montant de ces indemnités
 *        est indexé au SMIG horaire » pour l'outillage, la salissure et le lait. La base de
 *        l'indexation est le SMIG horaire en vigueur à la date de la note, 13,46 DH ; la
 *        méthode (proportionnelle) est la lecture retenue de cette mention.
 *
 * Les deux textes ne donnent PAS les mêmes plafonds : la CNSS exprime la caisse, le lait,
 * l'outillage et la salissure en multiples du SMIG horaire par 26 jours travaillés ; l'IR les
 * exprime en dirhams (indexés, sauf la caisse). D'où deux assiettes distinctes dans le moteur.
 *
 * À faire valider par l'expert-comptable avant tout usage déclaratif.
 */

/** Indemnités prises en charge par le barème. */
export type IndemniteKey =
  | "panier" | "titres_restaurant" | "transport" | "salissure" | "usure_vetements" | "lait"
  | "caisse" | "outillage" | "representation" | "deplacement" | "kilometrique" | "tournee"
  | "mutation" | "voiture_service" | "gratification_sociale";

/** Mode de calcul d'un plafond d'exonération. */
export type CapRule =
  /** Montant fixe par mois. */
  | { kind: "fixe_mois"; amount: number }
  /** Montant fixe par jour travaillé, borné le cas échéant à un % du brut imposable. */
  | { kind: "fixe_jour"; amount: number; maxPctBrut?: number }
  /** Multiple du SMIG horaire par jour travaillé, borné le cas échéant à un % du brut imposable. */
  | { kind: "smig_jour"; factor: number; maxPctBrut?: number }
  /** Multiple du SMIG horaire par tranche de 26 jours travaillés (formulation du BO 7443). */
  | { kind: "smig_26j"; factor: number }
  /** Montant fixé à une date, indexé proportionnellement au SMIG horaire (note DGI 2017). */
  /** Pourcentage du salaire de base du mois, avec un plafond absolu éventuel. */
  | { kind: "pct_base"; rate: number; max?: number }
  /** Montant par kilomètre déclaré (`kmField` : quel kilométrage). */
  | { kind: "par_km"; rate: number; kmField: "km_professionnels" | "km_mutation" }
  /** Montant fixe par an : le plafond se CONSOMME d'un mois sur l'autre. */
  | { kind: "fixe_an"; amount: number }
  /** 500 DH en périmètre urbain, 750 DH au-delà. */
  | { kind: "transport" }
  /** Exonéré en totalité SI la condition du texte est remplie et justifiée, sinon soumis. */
  | { kind: "si_justifie" };

export type CapStatus = "confirme" | "a_confirmer";
export type Regime = "ir" | "cnss";

/**
 * Règle de NON-CUMUL : l'exonération tombe dans les régimes indiqués quand la situation se
 * présente. Elle vient des textes eux-mêmes — le panier n'est exonéré que si le salarié ne
 * reçoit pas de titres-restaurant ; l'indemnité kilométrique ne se cumule pas avec une voiture
 * de service.
 */
export interface Exclusion {
  when: "titres_restaurant" | "voiture_service";
  regimes: Regime[];
  reason: string;
}

export interface IndemniteDef {
  key: IndemniteKey;
  label: string;
  /** Condition d'exonération, en clair — ce que l'employeur doit pouvoir justifier. */
  condition: string;
  ir: CapRule;
  cnss: CapRule;
  irStatus: CapStatus;
  cnssStatus: CapStatus;
  /** Groupe partageant UN SEUL plafond par régime (salissure et usure de vêtements). */
  group?: string;
  /** Non-cumuls prévus par les textes. */
  excludedBy?: Exclusion[];
  /** Références exactes. */
  source: string;
}

/** SMIG horaire à la date de la note DGI du 13 mars 2017 — base de son indexation. */
// Les montants IR de la note DGI de 2017 portent la mention « (*) montant indexé au SMIG horaire ».
// La DGI n'a JAMAIS publié de montant revalorisé depuis — ni après l'arrêté CNSS 1314-25, qui ne
// touche qu'à l'assiette sociale. La pratique 2026 applique donc les montants nominaux de 2017, et
// c'est ce que retient le barème : indexer nous-mêmes reviendrait à exonérer au-delà du seul
// montant que l'administration a publié. À revoir si la DGI met sa note à jour.
const BO = "BO 7443 (arrêté 1314-25)";
const DGI = "note DGI 2017";

export const INDEMNITES_BAREME_2025_10: IndemniteDef[] = [
  {
    key: "panier", label: "Prime de panier",
    condition: "Pas de restaurant d'entreprise ; le salarié ne reçoit pas de titres-restaurant. Par jour effectivement travaillé.",
    ir: { kind: "smig_jour", factor: 2 }, cnss: { kind: "smig_jour", factor: 2 },
    irStatus: "confirme", cnssStatus: "confirme",
    excludedBy: [{ when: "titres_restaurant", regimes: ["ir", "cnss"], reason: "Non cumulable avec les titres-restaurant (BO 7443, él. 12-13 ; note DGI 2017)." }],
    source: `CNSS : ${BO}, titre IV él. 12 — 2 x SMIG horaire par jour de travail. IR : ${DGI} — 2 x SMIG horaire ; non cumulable avec les bons de nourriture.`,
  },
  {
    key: "titres_restaurant", label: "Titres-restaurant",
    condition: "Remis à l'ensemble du personnel. Par jour effectivement travaillé ; non cumulables avec le panier.",
    ir: { kind: "fixe_jour", amount: 20, maxPctBrut: 0.2 }, cnss: { kind: "smig_jour", factor: 2 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre IV él. 13 — 2 x SMIG horaire par jour, s'ils sont remis à tous les salariés. IR : ${DGI} — 20 DH par jour, dans la limite de 20 % du salaire brut imposable ; non cumulables avec les indemnités alimentaires des chantiers éloignés.`,
  },
  {
    key: "transport", label: "Indemnité de transport",
    condition: "Domicile à 2 km au moins du lieu de travail ; aucun transport assuré par l'employeur ni voiture de service.",
    ir: { kind: "transport" }, cnss: { kind: "transport" },
    irStatus: "confirme", cnssStatus: "confirme",
    excludedBy: [{ when: "voiture_service", regimes: ["ir", "cnss"], reason: "Perdue avec une voiture de service ou de fonction (BO 7443, él. 3 ; note DGI 2017)." }],
    source: `CNSS : ${BO}, titre I él. 3. IR : ${DGI}. 500 DH/mois en périmètre urbain, 750 DH au-delà.`,
  },
  {
    key: "salissure", label: "Prime de salissure",
    condition: "Travaux particulièrement salissants, exercés indistinctement. Plafond COMMUN avec l'usure de vêtements.",
    ir: { kind: "fixe_mois", amount: 210 }, cnss: { kind: "smig_26j", factor: 14 },
    irStatus: "confirme", cnssStatus: "confirme", group: "salissure",
    source: `CNSS : ${BO}, titre VII él. 30 — salissure et usure de vêtements : 14 x SMIG horaire par 26 jours. IR : ${DGI} — 210 DH/mois. La note porte la mention « (*) montant indexé au SMIG horaire », mais la DGI n'a publié aucun montant revalorisé depuis 2017 : le montant nominal est retenu — il sous-exonère au pire, jamais l'inverse.`,
  },
  {
    key: "usure_vetements", label: "Prime d'usure de vêtements",
    condition: "Même élément que la prime de salissure (« prime de bleu ») : plafond commun.",
    ir: { kind: "fixe_mois", amount: 210 }, cnss: { kind: "smig_26j", factor: 14 },
    irStatus: "confirme", cnssStatus: "confirme", group: "salissure",
    source: `CNSS : ${BO}, titre VII él. 30. IR : ${DGI} — « prime de salissure (prime de bleu ou d'usure de vêtement) ».`,
  },
  {
    key: "lait", label: "Indemnité de lait",
    condition: "Salarié manipulant des produits toxiques.",
    ir: { kind: "fixe_mois", amount: 150 }, cnss: { kind: "smig_26j", factor: 11 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre VII él. 27 — 11 x SMIG horaire par 26 jours. IR : ${DGI} — 150 DH/mois. La note porte la mention « (*) montant indexé au SMIG horaire », mais la DGI n'a publié aucun montant revalorisé depuis 2017 : le montant nominal est retenu — il sous-exonère au pire, jamais l'inverse.`,
  },
  {
    key: "caisse", label: "Indemnité de caisse",
    condition: "Salarié manipulant des fonds, avec responsabilité pécuniaire.",
    ir: { kind: "fixe_mois", amount: 190 }, cnss: { kind: "smig_26j", factor: 14 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre VII él. 26 — 14 x SMIG horaire par 26 jours. IR : ${DGI} — 190 DH/mois (non indexé).`,
  },
  {
    key: "outillage", label: "Prime d'outillage",
    condition: "Ouvrier propriétaire de ses outils et matériel personnels.",
    ir: { kind: "fixe_mois", amount: 100 }, cnss: { kind: "smig_26j", factor: 7 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre VII él. 29 (« prime d'équipement ») — 7 x SMIG horaire par 26 jours. IR : ${DGI} — 100 DH/mois. La note porte la mention « (*) montant indexé au SMIG horaire », mais la DGI n'a publié aucun montant revalorisé depuis 2017 : le montant nominal est retenu — il sous-exonère au pire, jamais l'inverse.`,
  },
  {
    key: "representation", label: "Indemnité de représentation",
    condition: "Cadres dirigeants (PDG, DG, directeurs de département, de succursale, d'agence) ; exceptionnellement les agents commerciaux.",
    ir: { kind: "pct_base", rate: 0.1 }, cnss: { kind: "pct_base", rate: 0.1 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre II él. 9. IR : ${DGI}. 10 % du salaire de base.`,
  },
  {
    key: "deplacement", label: "Indemnité de déplacement (forfait)",
    condition: "Déplacements réguliers et continus du fait du poste (agents itinérants, VRP), au-delà de 50 km. Ordre écrit.",
    ir: { kind: "pct_base", rate: 1, max: 5000 }, cnss: { kind: "pct_base", rate: 1, max: 5000 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre I él. 1. IR : ${DGI}. 100 % du salaire de base, sans dépasser 5 000 DH/mois (transport, repas et hébergement compris).`,
  },
  {
    key: "kilometrique", label: "Indemnité kilométrique",
    condition: "Véhicule personnel, destination à 50 km au moins ; ordre écrit précisant date, lieu, trajet et kilométrage.",
    ir: { kind: "par_km", rate: 3, kmField: "km_professionnels" }, cnss: { kind: "par_km", rate: 3, kmField: "km_professionnels" },
    irStatus: "confirme", cnssStatus: "confirme",
    excludedBy: [{ when: "voiture_service", regimes: ["ir", "cnss"], reason: "Non cumulable avec une voiture de service (BO 7443, él. 2 ; note DGI 2017)." }],
    source: `CNSS : ${BO}, titre I él. 2. IR : ${DGI}. 3 DH par kilomètre, quelle que soit la puissance fiscale.`,
  },
  {
    key: "tournee", label: "Prime de tournée",
    condition: "Représentants commerciaux et agents itinérants visitant la clientèle dans un rayon de 50 km.",
    ir: { kind: "fixe_mois", amount: 1500 }, cnss: { kind: "fixe_mois", amount: 1500 },
    irStatus: "confirme", cnssStatus: "confirme",
    excludedBy: [{ when: "voiture_service", regimes: ["cnss"], reason: "Non cumulable avec l'avantage voiture de service (BO 7443, él. 5)." }],
    source: `CNSS : ${BO}, titre I él. 4 — 1 500 DH. IR : ${DGI} — 1 500 DH/mois.`,
  },
  {
    key: "mutation", label: "Indemnité de mutation",
    condition: "Mutation d'une ville à une autre, décidée par l'employeur pour les besoins du service.",
    ir: { kind: "par_km", rate: 10, kmField: "km_mutation" }, cnss: { kind: "par_km", rate: 10, kmField: "km_mutation" },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre I él. 7. IR : ${DGI}. 10 DH par kilomètre entre l'ancien et le nouveau lieu d'habitation (mutation au Maroc).`,
  },
  {
    key: "voiture_service", label: "Voiture de service — avantage en nature",
    condition: "Exonérée si rapportée chaque soir, ou si laissée en permanence à un cadre dirigeant ou, sur lettre d'affectation, à un agent itinérant.",
    ir: { kind: "si_justifie" }, cnss: { kind: "si_justifie" },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre I él. 5. IR : ${DGI} — les frais de voiture de fonction ou de service ne constituent pas un avantage imposable, sous condition de qualité du bénéficiaire.`,
  },
  {
    key: "gratification_sociale", label: "Gratifications sociales",
    condition: "Naissance, mariage, circoncision, décès d'un ascendant ou descendant, rentrée scolaire, Achoura, mouton de l'Aïd, dons et cadeaux — tous événements de l'année confondus.",
    ir: { kind: "fixe_an", amount: 2500 }, cnss: { kind: "fixe_an", amount: 5000 },
    irStatus: "confirme", cnssStatus: "confirme",
    source: `CNSS : ${BO}, titre V él. 17 — 5 000 DH par an et par salarié. IR : ${DGI} — 2 500 DH par an.`,
  },
];

/**
 * Indemnité de stage d'insertion (ANAPEC, dahir n° 1-93-16) — BO 7443, titre VI él. 24 :
 * exonérée de cotisations entre 1 600 et 6 000 DH par mois ; au-delà, elle devient soumise EN
 * TOTALITÉ, et pas seulement pour la part excédentaire.
 */
export const STAGE_INSERTION_CNSS = { min: 1600, max: 6000 } as const;
// NB : le texte fait du minimum de 1 600 DH une condition du CONTRAT de stage, sans en tirer de
// conséquence sur l'exonération ; seul le dépassement du maximum rend l'indemnité soumise. Le
// moteur n'applique donc QUE le maximum — appliquer le minimum priverait à tort d'exonération les
// stagiaires étudiants sous convention (él. 25), légitimement payés moins.

const PARAMS_2026: PayrollParams = {
  year: 2026,
  smigHourly: 17.92,
  legalMonthlyHours: 191,
  // SMAG porté à 97,44 DH/jour au 1er avril 2026 (décret n° 2.25.983 du 29 décembre 2025, seconde
  // tranche de l'accord social du 29 avril 2024) — 93,00 DH du 1er avril 2025 au 31 mars 2026.
  // Les paramètres sont annuels : une paie agricole de janvier à mars 2026 doit retenir 93,00 DH.
  smagDaily: 97.44,
  smagMonthlyDays: 26,
  standardMonthlyDays: 26,

  overtime: { day: 0.25, night: 0.5, restDay: 0.5, restNight: 1.0 },

  seniority: [
    { years: 2, rate: 0.05 },
    { years: 5, rate: 0.1 },
    { years: 12, rate: 0.15 },
    { years: 20, rate: 0.2 },
    { years: 25, rate: 0.25 },
  ],

  cnssEmployeeRate: 0.0448,
  cnssCeiling: 6000,
  amoEmployeeRate: 0.0226,

  cnssEmployerRate: 0.0898,
  familyAllocRate: 0.064,
  amoEmployerRate: 0.0411,
  tfpRate: 0.016,

  cnssEmployerCourtTermeRate: 0.0067,
  cnssEmployerIpeRate: 0.0038,
  cnssEmployerLongTermeRate: 0.0793,
  amoEmployerBaseRate: 0.0226,
  amoEmployerSolidariteRate: 0.0185,

  fraisProLowRate: 0.35,
  fraisProLowThresholdAnnual: 78000,
  fraisProHighRate: 0.25,
  fraisProHighCapAnnual: 35000,

  // Barème IR LF 2025 (annuel).
  irBrackets: [
    { upTo: 40000, rate: 0, deduct: 0 },
    { upTo: 60000, rate: 0.1, deduct: 4000 },
    { upTo: 80000, rate: 0.2, deduct: 10000 },
    { upTo: 100000, rate: 0.3, deduct: 18000 },
    { upTo: 180000, rate: 0.34, deduct: 22000 },
    { upTo: Infinity, rate: 0.37, deduct: 27400 },
  ],

  familyDeductionMonthly: 41.67,
  familyDeductionMaxPersons: 6,

  panierPerDayCapFactor: 2,
  transportIntraUrbanCap: 500,
  transportOutsideUrbanCap: 750,
  indemnitesBareme: INDEMNITES_BAREME_2025_10,

  advanceMonthlyCapRate: 0.1, // art. 386 CT — le dixième du salaire échu

  paidLeavePerMonth: 1.5,
  paidLeaveMinorPerMonth: 2,
  paidLeaveSeniorityBonusDays: 1.5,
  paidLeaveSeniorityTrancheYears: 5,
  paidLeaveMaxDays: 30,

  stc: {
    monthlyHoursRef: 191,
    workingDaysPerMonth: 26,
    // Préavis (art. 43) — cadres 1/2/3 mois ; non-cadres 8 j / 1 mois / 2 mois.
    preavis: {
      cadre: [
        { minYears: 0, months: 1 },
        { minYears: 1, months: 2 },
        { minYears: 5, months: 3 },
      ],
      nonCadre: [
        { minYears: 0, days: 8 },
        { minYears: 1, months: 1 },
        { minYears: 5, months: 2 },
      ],
    },
    licenciementMinSeniorityMonths: 6,
    // Indemnité légale de licenciement (art. 53) — heures de salaire par année.
    licenciement: [
      { upToYears: 5, hoursPerYear: 96 },
      { upToYears: 10, hoursPerYear: 144 },
      { upToYears: 15, hoursPerYear: 192 },
      { upToYears: Infinity, hoursPerYear: 240 },
    ],
    abusiveMonthsPerYear: 1.5, // art. 41
    abusiveMaxMonths: 36, // plafond art. 41
    cddEndRate: 0.07, // indemnité de fin de CDD
  },

  registre: {
    // Valeur prudente (la plus courte des sources publiques) — cf. avertissement sur RegistreParams.
    declarationDeadlineDays: 2,
    affiliationDeadlineDays: 30,
    amendeNonImmatriculationParSalarie: 1000,
    majorationRetardMensuelleParSalarie: 50,
    seuilRetardMois: 7,
    sourceNote:
      "Délais et montants indicatifs (sources publiques CNSS, vérifiées le 01/08/2026) — "
      + "les sources divergent sur le délai d'immatriculation du salarié ; à confirmer auprès de "
      + "la CNSS avant tout usage contentieux. Le poste dominant reste le rappel des cotisations "
      + "depuis la date réelle d'embauche.",
  },

  declarationPenalty: {
    firstMonthRate: 0.03, // 3 % le 1er mois (ou fraction) — source officielle CNSS (cabinets : 5 %, à confirmer)
    extraMonthRateReformDate: "2025-04-01", // réforme du taux « par mois supplémentaire »
    extraMonthRateBefore: 0.01, // 1 %/mois avant la réforme
    extraMonthRateAfter: 0.005, // 0,5 %/mois à partir du 01/04/2025
    astreintePerMonthPerEmployee: 50, // 50 DH/mois/salarié
    astreinteThresholdMonths: 7, // au-delà de 7 mois de retard
    dueDayOfNextMonth: 10, // DAMANCOM dû avant le 10 du mois M+1 ; retard dès le 11
    sourceNote:
      "Majorations et astreintes CNSS INDICATIVES (art. 28 Dahir 1-72-184 ; réforme du taux « par "
      + "mois supplémentaire » au 01/04/2025 : 1 % → 0,5 %). Sources publiques divergentes sur le taux "
      + "du 1er mois (3 % officiel vs 5 %) et sur le mode exact de l'astreinte de déclaration. Le retard "
      + "court dès le 11 du mois suivant la période. À CONFIRMER auprès de la CNSS / du conseil juridique "
      + "avant toute régularisation contentieuse.",
  },
};

/* ==================================================================================
 * HISTORIQUE DES BARÈMES — modèle « date d'effet » (cohérence DAMANCOM / CNSS)
 *
 * Chaque barème hérite du précédent et n'exprime que ce qui CHANGE cette année-là.
 * `getParams(year)` applique le barème dont l'année d'effet est la plus récente ≤ `year`.
 *
 * FIABILITÉ (source : recherche expert-comptable, 08/2026) :
 *  - HAUTE CONFIANCE (cœur DAMANCOM) : plafond CNSS 5 000→6 000 (01/04/2002) ; taux
 *    prestations sociales salarial 3,26→4,29 (2002) →4,48 (IPE, 01/12/2014, plein en 2015) ;
 *    patronal 8,60 (2002) →8,98 (2015) ; AMO créée 01/03/2006 ; part solidarité 1,85 % dès
 *    l'origine ; TFP 1,60 % stable ; 191 h dès le Code du travail (2004) ; frais pro 35/25 %
 *    (LF 2023) ; barème IR LF 2010 puis LF 2025.
 *  - À CONFIRMER (Bulletin Officiel / décrets) — marqués ci-dessous : SMIG pré-2014 et SMAG
 *    historiques (paliers/dates), taux AMO 2006→≈2018 (valeur actuelle 2,26/4,11 appliquée
 *    faute de source), patronal CNSS pré-2002 (≈6,60 %), barèmes IR 2007-2009.
 *  => Pour un usage DÉCLARATIF/CONTENTIEUX d'une période ancienne (2000-2014), faire valider
 *     les valeurs sur pièces (décrets BO, bordereaux CNSS d'époque) par l'expert-comptable.
 * ================================================================================== */

/** Barème IR/IGR antérieur à la réforme LF 2010 (≈2000-2009) — confiance moyenne. */
const IR_PRE2010: IrBracket[] = [
  { upTo: 20000, rate: 0, deduct: 0 },
  { upTo: 24000, rate: 0.13, deduct: 2600 },
  { upTo: 36000, rate: 0.21, deduct: 4520 },
  { upTo: 60000, rate: 0.35, deduct: 9560 },
  { upTo: Infinity, rate: 0.44, deduct: 14960 },
];

/** Barème IR LF 2010 — en vigueur 2010-2024 (confiance forte). */
const IR_2010: IrBracket[] = [
  { upTo: 30000, rate: 0, deduct: 0 },
  { upTo: 50000, rate: 0.1, deduct: 3000 },
  { upTo: 60000, rate: 0.2, deduct: 8000 },
  { upTo: 80000, rate: 0.3, deduct: 14000 },
  { upTo: 180000, rate: 0.34, deduct: 17200 },
  { upTo: Infinity, rate: 0.38, deduct: 24400 },
];

/** Frais professionnels avant la réforme LF 2023 : 20 % plafonnés à 30 000 DH/an (flat). */
const FP_PRE2023 = {
  fraisProLowRate: 0.2, fraisProLowThresholdAnnual: 0,
  fraisProHighRate: 0.2, fraisProHighCapAnnual: 30000,
} as const;

/** AMO inexistante avant le 01/03/2006. */
const AMO_OFF = {
  amoEmployeeRate: 0, amoEmployerRate: 0, amoEmployerBaseRate: 0, amoEmployerSolidariteRate: 0,
} as const;

/** Clone un barème de base et n'y applique QUE les champs modifiés cette année-là. */
function derive(base: PayrollParams, year: number, over: Partial<PayrollParams>): PayrollParams {
  return { ...structuredClone(base), year, ...over };
}

// Chaîne de barèmes par date d'effet (chacun hérite du précédent).
const P2000 = derive(PARAMS_2026, 2000, {
  smigHourly: 8.78,        // approximatif — à confirmer BO
  legalMonthlyHours: 208,  // 48 h/sem avant le Code du travail 2004
  cnssCeiling: 5000,
  cnssEmployeeRate: 0.0326,
  cnssEmployerRate: 0.066,
  cnssEmployerCourtTermeRate: 0.0067, cnssEmployerIpeRate: 0, cnssEmployerLongTermeRate: 0.0593,
  ...AMO_OFF, ...FP_PRE2023,
  irBrackets: IR_PRE2010,
});
const P2002 = derive(P2000, 2002, { // 01/04/2002 : plafond 6 000 + nouveaux taux
  cnssCeiling: 6000,
  cnssEmployeeRate: 0.0429,
  cnssEmployerRate: 0.086,
  cnssEmployerLongTermeRate: 0.0793, // 0,67 + 0 + 7,93 = 8,60
});
const P2004 = derive(P2002, 2004, { legalMonthlyHours: 191 }); // Code du travail (44 h/sem)
const P2006 = derive(P2004, 2006, { // 01/03/2006 : création AMO (taux 2006-≈2018 à confirmer, valeur actuelle appliquée)
  amoEffectiveFrom: "2006-03", // aucune AMO avant mars 2006 (janvier-février 2006 exclus, au mois près)
  amoEmployeeRate: 0.0226,
  amoEmployerRate: 0.0411,
  amoEmployerBaseRate: 0.0226,
  amoEmployerSolidariteRate: 0.0185,
});
const P2010 = derive(P2006, 2010, { irBrackets: IR_2010 }); // réforme IR LF 2010
const P2011 = derive(P2010, 2011, { smigHourly: 11.7 });
const P2014 = derive(P2011, 2014, { smigHourly: 12.85 });
const P2015 = derive(P2014, 2015, { // IPE (Loi 03-14, 01/12/2014) : 1er exercice plein
  smigHourly: 13.46,
  cnssEmployeeRate: 0.0448,
  cnssEmployerRate: 0.0898,
  cnssEmployerIpeRate: 0.0038, // 0,67 + 0,38 + 7,93 = 8,98
});
const P2019 = derive(P2015, 2019, { smigHourly: 14.13 });
const P2020 = derive(P2019, 2020, { smigHourly: 14.81 });
const P2022 = derive(P2020, 2022, { smigHourly: 15.55 });
const P2023 = derive(P2022, 2023, { // réforme frais professionnels LF 2023
  smigHourly: 16.29,
  fraisProLowRate: 0.35, fraisProLowThresholdAnnual: 78000,
  fraisProHighRate: 0.25, fraisProHighCapAnnual: 35000,
});
const P2025 = derive(P2023, 2025, { // barème IR LF 2025 (CNSS/AMO identiques à 2026)
  smigHourly: 17.1, // sources : 17,07-17,10
  irBrackets: PARAMS_2026.irBrackets,
});

const REGISTRY: Record<number, PayrollParams> = {
  2000: P2000, 2002: P2002, 2004: P2004, 2006: P2006, 2010: P2010, 2011: P2011,
  2014: P2014, 2015: P2015, 2019: P2019, 2020: P2020, 2022: P2022, 2023: P2023,
  2025: P2025, 2026: PARAMS_2026,
};

/** Années d'effet des barèmes, ordre croissant (pour la sélection « date d'effet »). */
const EFFECTIVE_YEARS = Object.keys(REGISTRY).map(Number).sort((a, b) => a - b);

/**
 * Renvoie le barème applicable à l'année demandée : celui dont l'ANNÉE D'EFFET est la plus
 * récente ≤ `year` (modèle « date d'effet »). Une année antérieure au plus ancien barème
 * connu retombe sur ce dernier.
 */
export function getParams(year: number): PayrollParams {
  if (REGISTRY[year]) return REGISTRY[year];
  let chosen = EFFECTIVE_YEARS[0];
  for (const y of EFFECTIVE_YEARS) {
    if (y <= year) chosen = y;
    else break;
  }
  return REGISTRY[chosen];
}

export const AVAILABLE_YEARS = Object.keys(REGISTRY).map(Number).sort((a, b) => b - a);

/**
 * Années SÉLECTIONNABLES dans les volets Paie / Comptabilité / Déclarations / Audit — source
 * UNIQUE (fini les listes `[2026, 2025]` en dur, divergentes d'une page à l'autre). Va de 2000
 * à l'année suivante (glissant : inclut automatiquement l'an prochain chaque année), ordre
 * décroissant. Pour une année sans barème dédié, `getParams` retombe sur le barème le plus
 * récent — au moins aussi juste que l'ancien comportement (2025 utilise déjà le barème 2026).
 */
export const SELECTABLE_YEARS: number[] = (() => {
  const FIRST = 2000;
  const last = Math.max(new Date().getFullYear() + 1, 2027);
  const out: number[] = [];
  for (let y = last; y >= FIRST; y--) out.push(y);
  return out;
})();

/**
 * Liste d'années sélectionnable EFFECTIVE d'un volet = plage standard (`SELECTABLE_YEARS`)
 * ∪ années ajoutées manuellement (`extra`, persistées dans l'état) ∪ années réellement
 * présentes dans les données (`data`, ex. périodes du Livre de paie). Dédupliquée, triée du
 * plus récent au plus ancien. Corrige les listes « à trous » (années sautées) tout en
 * autorisant l'ajout d'années hors plage (futures notamment). PURE.
 */
export function buildSelectableYears(extra: number[] = [], data: number[] = []): number[] {
  const set = new Set<number>(SELECTABLE_YEARS);
  for (const y of [...extra, ...data]) {
    if (Number.isFinite(y)) set.add(Math.round(y));
  }
  return [...set].sort((a, b) => b - a);
}
