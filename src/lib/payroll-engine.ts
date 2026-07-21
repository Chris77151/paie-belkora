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
import { getParams, type PayrollParams } from "./params";

export type Regime = "SMIG" | "SMAG";

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

  panier: number;
  transport: number;
  salissure: number;
  otherGross: number; // primes diverses imposables

  /** Transport hors périmètre urbain -> plafond d'exonération 750 au lieu de 500. */
  transportOutsideUrban?: boolean;
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
  indemnitesExonerees: number;
  indemnitesImposables: number; // fractions réintégrées

  salaireBrut: number;
  sbi: number; // salaire brut imposable

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

/** IR annuel via le barème rapide (tranche × taux − somme à déduire). */
export function irAnnuel(sniAnnual: number, p: PayrollParams): number {
  if (sniAnnual <= 0) return 0;
  const bracket = p.irBrackets.find((b) => sniAnnual <= b.upTo) ?? p.irBrackets[p.irBrackets.length - 1];
  return Math.max(0, sniAnnual * bracket.rate - bracket.deduct);
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

  // Prime d'ancienneté : assiette = salaire + accessoires y compris majorations HS (art. 350-352)
  const sYears = seniorityYears(input.hireDate, input.year, input.month);
  const sRate = seniorityRate(sYears, p);
  const primeAnciennete =
    input.primeAncienneteOverride != null
      ? round2(input.primeAncienneteOverride)
      : round2((salaireBase + overtime) * sRate);

  // Indemnités : part exonérée sous plafonds, l'excédent réintègre le SBI
  const panierCap = round2(p.panierPerDayCapFactor * p.smigHourly * input.daysWorked);
  const panierExonere = round2(Math.min(input.panier, panierCap));
  const transportCap = input.transportOutsideUrban ? p.transportOutsideUrbanCap : p.transportIntraUrbanCap;
  const transportExonere = round2(Math.min(input.transport, transportCap));
  const salissureExoneree = round2(input.salissure); // justifiée -> exonérée (V1)
  const indemnitesExonerees = round2(panierExonere + transportExonere + salissureExoneree);

  const indemnitesBrutes = round2(input.panier + input.transport + input.salissure);
  const indemnitesImposables = round2(indemnitesBrutes - indemnitesExonerees);

  // 1 (fin). Salaire brut
  const salaireBrut = round2(
    salaireBase + overtime + primeAnciennete + indemnitesBrutes + input.otherGross,
  );

  // 2. SBI = brut − indemnités exonérées
  const sbi = round2(salaireBrut - indemnitesExonerees);

  // 3bis. Cotisations salariales (assiette = SBI, CNSS plafonnée)
  const cnssBase = Math.min(sbi, p.cnssCeiling);
  const cnssSalarie = round2(cnssBase * p.cnssEmployeeRate);
  const amoSalarie = round2(sbi * p.amoEmployeeRate);

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

  // Charges patronales — détail réglementaire puis agrégats
  const cnssCourtTerme = round2(cnssBase * p.cnssEmployerCourtTermeRate);
  const cnssIpe = round2(cnssBase * p.cnssEmployerIpeRate);
  const cnssLongTerme = round2(cnssBase * p.cnssEmployerLongTermeRate);
  const af = round2(sbi * p.familyAllocRate);
  const amoBase = round2(sbi * p.amoEmployerBaseRate);
  const amoSolidarite = round2(sbi * p.amoEmployerSolidariteRate);
  const tfp = round2(sbi * p.tfpRate);

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
    indemnitesExonerees,
    indemnitesImposables,
    salaireBrut,
    sbi,
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
      sbiBase: sbi,
      totalRate: totalEmployerRate,
    },
  };
}
