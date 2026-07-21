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

  /** Congés payés. */
  paidLeavePerMonth: number; // 1,5 jour/mois
}

const PARAMS_2026: PayrollParams = {
  year: 2026,
  smigHourly: 17.92,
  legalMonthlyHours: 191,
  smagDaily: 93.68,
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

  paidLeavePerMonth: 1.5,
};

const REGISTRY: Record<number, PayrollParams> = {
  2025: PARAMS_2026, // barèmes 2025-2026 identiques pour V1
  2026: PARAMS_2026,
};

/** Renvoie les paramètres applicables à l'année demandée (fallback : année la plus récente). */
export function getParams(year: number): PayrollParams {
  if (REGISTRY[year]) return REGISTRY[year];
  const years = Object.keys(REGISTRY).map(Number).sort((a, b) => b - a);
  return REGISTRY[years[0]];
}

export const AVAILABLE_YEARS = Object.keys(REGISTRY).map(Number).sort((a, b) => b - a);
