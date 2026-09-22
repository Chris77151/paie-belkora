/**
 * Moteur de paie — Maroc 2025-2026.  Fonctions PURES, testées unitairement.
 * Aucun taux/plafond en dur ici : tout vient de `params.ts` (table payroll_params).
 *
 * Séquence légale (spec §4.6) :
 *   1. Brut = base + HS + primes + indemnités
 *   2. SBI = brut − indemnités exonérées (sous plafonds)
 *   3. Frais pro (CGI 59-I-A) : 35 % si SBI annuel ≤ 78 000 (sans écrêtement)
 *                              sinon 25 % plafonné à 35 000 DH/an
 *   4. SNI = SBI − frais pro − CNSS sal. − AMO sal.
 *   5. IR brut = barème(SNI annualisé) / 12
 *   6. IR net = IR brut − charges de famille (41,67 DH/pers, max 6)
 *   7. Net à payer = brut − CNSS − AMO − IR net
 */
import { getParams, STAGE_INSERTION_CNSS, type IndemniteKey, type PayrollParams } from "./params";
import { splitIndemnites, totals, type IndemniteLine, type VoitureService, type YtdExempt } from "./indemnites";

export type Regime = "SMIG" | "SMAG";

/**
 * Exonération CNSS/AMO/AF/TFP d'un salarié (dispositifs marocains) :
 *  - `none`      : régime de droit commun (défaut).
 *  - `totale`    : indemnité de STAGE hors assiette (contrat de stage ANAPEC) — aucune cotisation
 *                  (parts salariale ET patronale : CNSS, AMO, AF, TFP = 0).
 *  - `patronale` : recrutement TAHFIZ / IDMAJ (ANAPEC) — exonération de la part PATRONALE
 *                  (CNSS patr., AMO patr., AF, TFP = 0) ; les parts SALARIALES restent dues.
 * Sous réserve d'éligibilité et de la durée du dispositif (à documenter par salarié).
 */
export type CnssExemption = "none" | "totale" | "patronale";

export interface PayrollInput {
  year: number;
  month: number;
  regime: Regime;
  hireDate: string; // ISO — pour l'ancienneté
  dependents: number;

  hourlyRate: number; // base_hourly_rate
  daysWorked: number; // jours réellement travaillés ce mois — proratise le salaire de base
  hoursNormal: number; // heures contractuelles d'un MOIS COMPLET (référence, ex. 191 h)

  hoursOt25: number; // jour ouvrable (+25 %)
  hoursOt50: number; // nuit / repos jour (+50 %)
  hoursOt100: number; // nuit un jour de repos ou férié (+100 %)

  /** Ancienneté saisie manuellement (override). Sinon calculée depuis hireDate. */
  primeAncienneteOverride?: number | null;
  /** La prime d'ancienneté s'applique-t-elle ? Défaut (absent/true) : OUI. `false` → prime = 0. */
  applySeniority?: boolean;

  panier: number;
  transport: number;
  salissure: number;
  lait?: number; // indemnité de lait (produits toxiques)
  representation?: number; // indemnité de représentation (cadres dirigeants)
  /**
   * Autres indemnités du barème (caisse, outillage, déplacement, kilométrique, tournée,
   * titres-restaurant, gratifications…). Les champs historiques ci-dessus restent acceptés et
   * PRIMENT pour leur propre clé.
   */
  indemnites?: Partial<Record<IndemniteKey, number>>;
  /** Kilomètres professionnels du mois — plafond de l'indemnité kilométrique. */
  kmProfessionnels?: number;
  /** Kilomètres entre ancien et nouveau lieu d'habitation — plafond de l'indemnité de mutation. */
  kmMutation?: number;
  /** Voiture de service du mois : conditionne l'avantage en nature et fait tomber certaines indemnités. */
  voitureService?: VoitureService;
  /** Voiture permanente justifiée (cadre dirigeant, ou lettre d'affectation d'un agent itinérant). */
  voitureJustifiee?: boolean;
  /** Valeur mensuelle de l'avantage en nature voiture, ajoutée au brut. */
  avantageVoiture?: number;
  /** Montants déjà exonérés depuis le 1er janvier, par régime (plafonds annuels). */
  ytdExempt?: YtdExempt;
  otherGross: number; // primes diverses imposables

  /** Transport hors périmètre urbain -> plafond d'exonération 750 au lieu de 500. */
  transportOutsideUrban?: boolean;

  /** Exonération CNSS/AMO/AF/TFP (dispositif ANAPEC/stage). Défaut : `none`. */
  cnssExemption?: CnssExemption;
}

export interface PayrollResult {
  salaireBase: number;
  overtime: number;
  overtimeDetail: { ot25: number; ot50: number; ot100: number };
  seniorityYears: number;
  seniorityRate: number;
  primeAnciennete: number;

  panierExonere: number;
  transportExonere: number;
  salissureExoneree: number;
  laitExonere: number;
  representationExonere: number;
  /** Part exonérée d'IR de l'ensemble des indemnités (assiette FISCALE). */
  indemnitesExonerees: number;
  /** Part exonérée de cotisations sociales (assiette CNSS) — peut différer de l'IR. */
  indemnitesExonereesCnss: number;
  indemnitesImposables: number; // fractions réintégrées à l'assiette fiscale
  /** Détail indemnité par indemnité, avec son sort dans chaque régime. */
  indemnitesDetail: IndemniteLine[];

  salaireBrut: number;
  sbi: number; // salaire brut IMPOSABLE (assiette de l'IR)
  /**
   * Salaire brut SOUMIS À COTISATIONS (assiette CNSS, AMO, AF, TFP). Distinct du SBI dès qu'une
   * indemnité n'a pas le même plafond dans les deux régimes.
   */
  assietteCnss: number;

  cnssSalarie: number;
  amoSalarie: number;
  fraisPro: number;
  fraisProRate: number;
  sni: number; // salaire net imposable
  irBrut: number;
  chargesFamille: number;
  ir: number; // IR net
  netAPayer: number;

  cnssPatronal: number;
  amoPatronal: number;
  tfp: number;
  af: number;
  chargesPatronales: number;
  coutTotalEmployeur: number;

  /** Taux marginal IR appliqué (pour l'affichage « tranche X % »). */
  irMarginalRate: number;

  /** Détail des charges patronales (bulletin officiel). */
  employerDetail: {
    cnssCourtTerme: number;
    cnssIpe: number;
    cnssLongTerme: number;
    af: number;
    amoBase: number;
    amoSolidarite: number;
    tfp: number;
    /** Assiette CNSS plafonnée et assiette déplafonnée (SBI) pour l'affichage. */
    cnssBase: number;
    sbiBase: number;
    totalRate: number; // 21,09 %
  };
}

/** Arrondi arithmétique à 2 décimales (demi vers le haut), ligne par ligne. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Ancienneté en années révolues entre l'embauche et la fin de la période de paie. */
export function seniorityYears(hireDate: string, year: number, month: number): number {
  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) return 0;
  const periodEnd = new Date(year, month, 0); // dernier jour du mois
  let years = periodEnd.getFullYear() - hire.getFullYear();
  const anniv = new Date(hire.getFullYear() + years, hire.getMonth(), hire.getDate());
  if (anniv > periodEnd) years -= 1;
  return Math.max(0, years);
}

/** Taux d'ancienneté applicable (seuil le plus élevé atteint). */
export function seniorityRate(years: number, p: PayrollParams): number {
  let rate = 0;
  for (const step of p.seniority) if (years >= step.years) rate = step.rate;
  return rate;
}

/** Une échéance de revalorisation de la prime d'ancienneté (franchissement de palier). */
export interface SeniorityMilestone {
  /** Palier en années (2, 5, 12, 20, 25). */
  years: number;
  /** Taux atteint à ce palier. */
  rate: number;
  /** Date (ISO aaaa-mm-jj) à laquelle le palier est atteint = date d'embauche + `years` ans. */
  date: string;
}

/**
 * Échéances de revalorisation de la prime d'ancienneté pour un salarié, à partir de sa date
 * d'embauche et des paliers de `params`. PUR & testable. Renvoie une entrée par palier (triée),
 * avec la date exacte du franchissement. Suivi AUTOMATIQUE des redressements de la prime.
 */
export function seniorityMilestones(hireDate: string, p: PayrollParams): SeniorityMilestone[] {
  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) return [];
  return [...p.seniority]
    .sort((a, b) => a.years - b.years)
    .map((step) => {
      const d = new Date(hire.getFullYear() + step.years, hire.getMonth(), hire.getDate());
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { years: step.years, rate: step.rate, date: iso };
    });
}

/**
 * Prochaine revalorisation STRICTEMENT postérieure à `asOf` (ou null si le palier maximal est
 * déjà atteint). `asOf` injecté pour rester déterministe/testable.
 */
export function nextSeniorityMilestone(hireDate: string, asOf: Date, p: PayrollParams): SeniorityMilestone | null {
  const at = asOf.getTime();
  for (const m of seniorityMilestones(hireDate, p)) {
    if (new Date(m.date).getTime() > at) return m;
  }
  return null;
}

/** IR annuel via le barème rapide (tranche × taux − somme à déduire). */
export function irAnnuel(sniAnnual: number, p: PayrollParams): number {
  if (sniAnnual <= 0) return 0;
  const bracket = p.irBrackets.find((b) => sniAnnual <= b.upTo) ?? p.irBrackets[p.irBrackets.length - 1];
  return Math.max(0, sniAnnual * bracket.rate - bracket.deduct);
}

/**
 * L'AMO est-elle en vigueur pour la période (année, mois) ? PURE & testable.
 * Faux avant `p.amoEffectiveFrom` (« AAAA-MM ») — l'AMO n'existait pas (créée le 01/03/2006) et
 * DAMANCOM ne la comptait pas. Sans date d'effet, l'AMO s'applique sans restriction.
 */
export function amoActiveAt(p: PayrollParams, year: number, month: number): boolean {
  if (!p.amoEffectiveFrom) return true;
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  return ym >= p.amoEffectiveFrom; // comparaison lexicographique sûre sur « AAAA-MM » zéro-paddé
}

/** Taux marginal IR de la tranche où tombe le SNI annuel. */
export function irMarginalRate(sniAnnual: number, p: PayrollParams): number {
  if (sniAnnual <= 0) return 0;
  const bracket = p.irBrackets.find((b) => sniAnnual <= b.upTo) ?? p.irBrackets[p.irBrackets.length - 1];
  return bracket.rate;
}

export function computePayslip(input: PayrollInput): PayrollResult {
  const p = getParams(input.year);
  const rate = input.hourlyRate;

  // 1. Salaire de base proratisé aux jours travaillés.
  //    hoursNormal = heures contractuelles d'un MOIS COMPLET (référence, ex. 191 h).
  //    Le salaire est réduit au prorata des jours réellement travaillés :
  //      facteur = jours travaillés / jours d'un mois complet (26), plafonné à 1.
  //    Les jours au-delà du mois complet ne gonflent pas la base (ils relèvent des HS).
  const daysFactor = Math.min(
    Math.max(input.daysWorked, 0) / p.standardMonthlyDays,
    1,
  );
  const salaireBase = round2(input.hoursNormal * rate * daysFactor);
  const ot25 = round2(input.hoursOt25 * rate * (1 + p.overtime.day));
  const ot50 = round2(input.hoursOt50 * rate * (1 + p.overtime.restDay));
  const ot100 = round2(input.hoursOt100 * rate * (1 + p.overtime.restNight));
  const overtime = round2(ot25 + ot50 + ot100);

  // Prime d'ancienneté : assiette = salaire + accessoires y compris majorations HS (art. 350-352).
  // Désactivable par salarié (applySeniority = false → prime nulle, taux affiché 0).
  const applySeniority = input.applySeniority ?? true;
  const sYears = seniorityYears(input.hireDate, input.year, input.month);
  const sRate = applySeniority ? seniorityRate(sYears, p) : 0;
  const primeAnciennete = !applySeniority
    ? 0
    : input.primeAncienneteOverride != null
      ? round2(input.primeAncienneteOverride)
      : round2((salaireBase + overtime) * sRate);

  // Indemnités : chaque indemnité est confrontée à son plafond, SÉPARÉMENT pour l'IR et pour la
  // CNSS (barème `indemnitesBareme` de params.ts). L'excédent réintègre l'assiette concernée.
  // Les champs historiques (panier, transport, salissure, lait, représentation) priment pour leur
  // propre clé ; les autres indemnités arrivent par `indemnites`.
  const amounts: Partial<Record<IndemniteKey, number>> = {
    ...(input.indemnites ?? {}),
    voiture_service: input.avantageVoiture ?? input.indemnites?.voiture_service ?? 0,
    panier: input.panier ?? 0,
    transport: input.transport ?? 0,
    salissure: input.salissure ?? 0,
    lait: input.lait ?? input.indemnites?.lait ?? 0,
    representation: input.representation ?? input.indemnites?.representation ?? 0,
  };
  const indemnitesDetail = splitIndemnites(
    amounts,
    p.indemnitesBareme,
    {
      smigHourly: p.smigHourly,
      daysWorked: input.daysWorked,
      salaireBase,
      // Brut HORS indemnités : référence des plafonds « 20 % du brut imposable » (IR).
      brutRef: round2(salaireBase + overtime + primeAnciennete + (input.otherGross ?? 0)),
      km: input.kmProfessionnels ?? 0,
      kmMutation: input.kmMutation ?? 0,
      transportOutsideUrban: !!input.transportOutsideUrban,
      voitureService: input.voitureService ?? "aucune",
      voitureJustifiee: !!input.voitureJustifiee,
    },
    p,
    input.ytdExempt,
  );
  const tot = totals(indemnitesDetail);
  const exoIrOf = (k: IndemniteKey) => indemnitesDetail.find((l) => l.key === k)?.exoIr ?? 0;
  const panierExonere = exoIrOf("panier");
  const transportExonere = exoIrOf("transport");
  const salissureExoneree = exoIrOf("salissure");
  const laitExonere = exoIrOf("lait");
  const representationExonere = exoIrOf("representation");
  const indemnitesExonerees = tot.exoIr;
  const indemnitesExonereesCnss = tot.exoCnss;
  const indemnitesBrutes = tot.brut;
  const indemnitesImposables = round2(indemnitesBrutes - indemnitesExonerees);

  // 1 (fin). Salaire brut
  const salaireBrut = round2(
    salaireBase + overtime + primeAnciennete + indemnitesBrutes + input.otherGross,
  );

  // 2. Deux assiettes, deux barèmes d'exonération :
  //    SBI (IR)       = brut − exonérations fiscales
  //    assiette CNSS  = brut − exonérations sociales (arrêté 1314-25)
  const sbi = round2(salaireBrut - indemnitesExonerees);
  const assietteCnss = round2(salaireBrut - indemnitesExonereesCnss);

  // Exonération CNSS/AMO/AF/TFP (dispositif ANAPEC/stage), appliquée AVANT le calcul du SNI/IR.
  // Stage d'insertion (BO 7443, titre VI él. 24) : au-delà de 6 000 DH par mois, l'indemnité de
  // stage devient soumise EN TOTALITÉ — pas seulement pour la part excédentaire. Le seuil se
  // compare à l'indemnité de stage elle-même, donc HORS indemnités déjà exonérées à part (panier,
  // transport…) : les y inclure ferait perdre l'exonération à un stagiaire payé 5 730 DH.
  const indemniteStage = round2(salaireBrut - indemnitesExonereesCnss);
  const stageHorsBornes =
    input.cnssExemption === "totale" && indemniteStage > STAGE_INSERTION_CNSS.max;
  const exemption = stageHorsBornes ? "none" : (input.cnssExemption ?? "none");
  const exoSalarial = exemption === "totale"; // stage : aucune retenue salariale
  const exoPatronal = exemption === "totale" || exemption === "patronale"; // stage OU TAHFIZ/IDMAJ

  // AMO : inexistante avant sa date d'effet (01/03/2006) → aucune cotisation, au MOIS près.
  // DAMANCOM ne comptait pas l'AMO sur ces périodes : le moteur la neutralise automatiquement.
  const amoInactive = !amoActiveAt(p, input.year, input.month);

  // 3bis. Cotisations salariales (assiette = SBI, CNSS plafonnée)
  const cnssBase = Math.min(assietteCnss, p.cnssCeiling);
  const cnssSalarie = exoSalarial ? 0 : round2(cnssBase * p.cnssEmployeeRate);
  const amoSalarie = (exoSalarial || amoInactive) ? 0 : round2(assietteCnss * p.amoEmployeeRate);

  // 3. Frais professionnels (CGI art. 59-I-A)
  const sbiAnnual = sbi * 12;
  let fraisProRate: number;
  let fraisPro: number;
  if (sbiAnnual <= p.fraisProLowThresholdAnnual) {
    fraisProRate = p.fraisProLowRate; // 35 % sans écrêtement
    fraisPro = round2(sbi * fraisProRate);
  } else {
    fraisProRate = p.fraisProHighRate; // 25 % plafonné 35 000/an
    fraisPro = round2(Math.min(sbi * fraisProRate, p.fraisProHighCapAnnual / 12));
  }

  // 4. SNI
  const sni = round2(sbi - fraisPro - cnssSalarie - amoSalarie);

  // 5-6. IR
  const irBrut = round2(irAnnuel(sni * 12, p) / 12);
  const nbCharges = Math.min(Math.max(0, input.dependents), p.familyDeductionMaxPersons);
  const chargesFamille = round2(nbCharges * p.familyDeductionMonthly);
  const ir = round2(Math.max(0, irBrut - chargesFamille));

  // 7. Net à payer
  const netAPayer = round2(salaireBrut - cnssSalarie - amoSalarie - ir);

  // Charges patronales — détail réglementaire puis agrégats (exonérées si dispositif patronal)
  const cnssCourtTerme = exoPatronal ? 0 : round2(cnssBase * p.cnssEmployerCourtTermeRate);
  const cnssIpe = exoPatronal ? 0 : round2(cnssBase * p.cnssEmployerIpeRate);
  const cnssLongTerme = exoPatronal ? 0 : round2(cnssBase * p.cnssEmployerLongTermeRate);
  // Charges patronales déplafonnées : assiette SOCIALE, jamais l'assiette fiscale.
  const af = exoPatronal ? 0 : round2(assietteCnss * p.familyAllocRate);
  const amoBase = (exoPatronal || amoInactive) ? 0 : round2(assietteCnss * p.amoEmployerBaseRate);
  const amoSolidarite = (exoPatronal || amoInactive) ? 0 : round2(assietteCnss * p.amoEmployerSolidariteRate);
  const tfp = exoPatronal ? 0 : round2(assietteCnss * p.tfpRate);

  const cnssPatronal = round2(cnssCourtTerme + cnssIpe + cnssLongTerme);
  const amoPatronal = round2(amoBase + amoSolidarite);
  const chargesPatronales = round2(cnssPatronal + af + amoPatronal + tfp);
  const coutTotalEmployeur = round2(salaireBrut + chargesPatronales);
  const totalEmployerRate = round2(
    (p.cnssEmployerRate + p.familyAllocRate + p.amoEmployerRate + p.tfpRate) * 100,
  );

  return {
    salaireBase,
    overtime,
    overtimeDetail: { ot25, ot50, ot100 },
    seniorityYears: sYears,
    seniorityRate: sRate,
    primeAnciennete,
    panierExonere,
    transportExonere,
    salissureExoneree,
    laitExonere,
    representationExonere,
    indemnitesExonerees,
    indemnitesExonereesCnss,
    indemnitesImposables,
    indemnitesDetail,
    salaireBrut,
    sbi,
    assietteCnss,
    cnssSalarie,
    amoSalarie,
    fraisPro,
    fraisProRate,
    sni,
    irBrut,
    chargesFamille,
    ir,
    netAPayer,
    cnssPatronal,
    amoPatronal,
    tfp,
    af,
    chargesPatronales,
    coutTotalEmployeur,
    irMarginalRate: irMarginalRate(sni * 12, p),
    employerDetail: {
      cnssCourtTerme,
      cnssIpe,
      cnssLongTerme,
      af,
      amoBase,
      amoSolidarite,
      tfp,
      cnssBase,
      sbiBase: assietteCnss, // assiette déplafonnée des cotisations (AF, AMO, TFP)
      totalRate: totalEmployerRate,
    },
  };
}
