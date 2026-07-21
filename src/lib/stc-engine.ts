/**
 * Moteur de SOLDE DE TOUT COMPTE (STC) — Maroc.  Fonctions PURES, testées unitairement.
 * Porte le skill « calcul-solde-tout-compte » au navigateur.
 *
 * Calcule et décompose, poste par poste et avec base légale, toutes les sommes dues à un
 * salarié qui quitte l'entreprise, puis applique le traitement social (CNSS/AMO) et fiscal
 * (IR) correct pour aboutir au NET du solde de tout compte.
 *
 * RÈGLE D'OR (identique au reste de l'app) : aucun taux/plafond en dur ici — tout vient de
 * `params.ts`. Le motif de départ pilote les postes ; zéro montant inventé.
 *
 * Sources : Code du travail 65-99 (art. 41, 43, 52-53, 231-232, 350), CGI (art. 57-7°, 59-I-A,
 * 60), régime CNSS/AMO. Cf. skill `expert-rh-maroc` (paie-formules §7-10) validé.
 */
import { getParams, type PayrollParams, type PreavisBracket } from "./params";
import { round2, seniorityRate, irAnnuel, irMarginalRate } from "./payroll-engine";

/** Motif de départ — commande quels postes sont dus. */
export type DepartureReason =
  | "licenciement" // motif valable, hors faute grave
  | "faute_grave" // art. 39 — ni préavis ni indemnité
  | "demission"
  | "fin_cdd" // fin de CDD à l'échéance
  | "fin_travail_determine" // fin de chantier (art. 33)
  | "depart_retraite"
  | "rupture_amiable"; // rupture d'un commun accord (art. 33 al. 1)

export type EmployeeCategory = "cadre" | "non_cadre";

export const DEPARTURE_REASONS: { value: DepartureReason; label: string; hint: string }[] = [
  { value: "licenciement", label: "Licenciement (motif valable)", hint: "Hors faute grave — préavis + indemnité légale" },
  { value: "faute_grave", label: "Licenciement pour faute grave", hint: "Art. 39 — ni préavis ni indemnité de licenciement" },
  { value: "demission", label: "Démission", hint: "Préavis dû par le salarié — pas d'indemnité de licenciement" },
  { value: "fin_cdd", label: "Fin de CDD (échéance)", hint: "Indemnité de fin de CDD 7 %, sauf exceptions" },
  { value: "fin_travail_determine", label: "Fin de travail déterminé (chantier)", hint: "Art. 33 — terme de plein droit, sans préavis" },
  { value: "depart_retraite", label: "Départ à la retraite", hint: "Salaire + congés (allocation retraite hors périmètre)" },
  { value: "rupture_amiable", label: "Rupture d'un commun accord", hint: "Art. 33 al. 1 — indemnité négociée" },
];

/** Une ligne du décompte. */
export interface StcLine {
  key: string;
  label: string;
  /** Base légale (article). */
  article: string;
  /** Montant brut de la ligne (DH). */
  gross: number;
  /** La ligne est-elle de nature salariale (soumise CNSS/AMO/IR) ? */
  taxable: boolean;
  /** Explication courte du calcul (transparence). */
  detail?: string;
}

export interface StcInput {
  year: number;
  reason: DepartureReason;
  category: EmployeeCategory;
  /** Salaire brut mensuel de référence (moyenne 52 semaines, à défaut brut courant). */
  monthlyGrossRef: number;
  hireDate: string; // ISO
  endDate: string; // ISO — date de sortie
  /** Salaire du mois de sortie : jours travaillés / jours ouvrables du mois. */
  daysWorkedLastMonth: number;
  workingDaysLastMonth: number; // ex. 26
  /** Jours ouvrables de congés acquis et non pris (si vide, estimés depuis l'ancienneté). */
  accruedLeaveDays?: number | null;
  /** Prime d'ancienneté du mois (part imposable, si versée). */
  seniorityPremiumBase?: number; // assiette (salaire de base de la période) sur laquelle appliquer le taux
  /** L'employeur dispense-t-il le salarié du préavis (→ indemnité compensatrice) ? */
  preavisDispensed: boolean;
  /** Licenciement jugé abusif → dommages-intérêts art. 41. */
  abusive?: boolean;
  /** Total des salaires bruts perçus pendant le CDD (pour l'indemnité de fin de CDD). */
  cddTotalGross?: number;
  /** Personnes à charge (pour l'IR). */
  dependents: number;
  /** Autres retenues (avances, prêts, matériel non restitué…). */
  otherDeductions?: number;
}

export interface StcResult {
  /** Bases affichées (vérifiables à la main). */
  seniorityYears: number;
  hourlyRate: number;
  dailyRate: number;
  /** Détail des lignes (bruts). */
  lines: StcLine[];
  /** Sous-totaux. */
  grossTotal: number;
  exonereTotal: number; // indemnités exonérées (licenciement légal + dommages)
  taxableTotal: number; // assiette salariale
  cnssSalarie: number;
  amoSalarie: number;
  fraisPro: number;
  sni: number;
  ir: number;
  irMarginalRate: number;
  otherDeductions: number;
  /** NET du solde de tout compte. */
  netAPayer: number;
  /** Coût employeur additionnel (charges patronales sur la part salariale). */
  chargesPatronales: number;
  coutTotalEmployeur: number;
  /** Postes non calculés / avertissements (transparence). */
  notes: string[];
}

/** Ancienneté en années (avec fraction) entre l'embauche et la date de sortie. */
export function seniorityYearsFraction(hireDate: string, endDate: string): number {
  const hire = new Date(hireDate);
  const end = new Date(endDate);
  if (isNaN(hire.getTime()) || isNaN(end.getTime())) return 0;
  const ms = end.getTime() - hire.getTime();
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 3600 * 1000);
}

/** Sélectionne le niveau de préavis applicable (seuil le plus élevé atteint). */
export function preavisBracket(years: number, brackets: PreavisBracket[]): PreavisBracket {
  let chosen = brackets[0];
  for (const b of brackets) if (years >= b.minYears) chosen = b;
  return chosen;
}

/**
 * Indemnité légale de licenciement (art. 52-53) : somme, tranche par tranche, des heures dues
 * par année d'ancienneté, multipliée par le taux horaire. Années incomplètes proratisées.
 */
export function licenciementHours(years: number, p: PayrollParams): number {
  let remaining = years;
  let prevCap = 0;
  let hours = 0;
  for (const t of p.stc.licenciement) {
    const span = Math.min(remaining, t.upToYears - prevCap);
    if (span <= 0) break;
    hours += span * t.hoursPerYear;
    remaining -= span;
    prevCap = t.upToYears;
    if (remaining <= 0) break;
  }
  return hours;
}

/** Estime les jours de congés acquis (art. 231-232) sur toute l'ancienneté, si non renseignés. */
export function estimateAccruedLeave(years: number, p: PayrollParams): number {
  const months = years * 12;
  const base = months * p.paidLeavePerMonth; // 1,5 j / mois
  const bonusTranches = Math.floor(years / p.paidLeaveSeniorityTrancheYears);
  const bonus = bonusTranches * p.paidLeaveSeniorityBonusDays;
  // Plafond annuel du congé — on borne l'acquisition annuelle moyenne au plafond légal.
  const perYearCapped = Math.min(
    p.paidLeavePerMonth * 12 + bonus,
    p.paidLeaveMaxDays,
  );
  // On retient le plus prudent : min(acquisition brute, plafond × années) — approximation transparente.
  return round2(Math.min(base + bonus, perYearCapped * Math.max(1, years)));
}

export function computeStc(input: StcInput): StcResult {
  const p = getParams(input.year);
  const s = p.stc;
  const B = Math.max(0, input.monthlyGrossRef);
  const hourlyRate = round2(B / s.monthlyHoursRef);
  const dailyRate = round2(B / s.workingDaysPerMonth);
  const years = seniorityYearsFraction(input.hireDate, input.endDate);

  const lines: StcLine[] = [];
  const notes: string[] = [];

  // 1. Salaire du mois de départ (toujours dû) — nature salariale.
  const dayFactor = input.workingDaysLastMonth > 0
    ? Math.min(Math.max(input.daysWorkedLastMonth, 0) / input.workingDaysLastMonth, 1)
    : 0;
  const salaireMois = round2(B * dayFactor);
  lines.push({
    key: "salaire_mois",
    label: "Salaire du mois de départ",
    article: "Art. 351",
    gross: salaireMois,
    taxable: true,
    detail: `${input.daysWorkedLastMonth}/${input.workingDaysLastMonth} j × ${round2(B)} DH`,
  });

  // 2. Prime d'ancienneté au prorata (art. 350) — nature salariale.
  const sRate = seniorityRate(Math.floor(years), p);
  const primeBase = input.seniorityPremiumBase ?? salaireMois;
  const primeAnc = round2(primeBase * sRate);
  if (primeAnc > 0) {
    lines.push({
      key: "prime_anciennete",
      label: "Prime d'ancienneté (prorata)",
      article: "Art. 350",
      gross: primeAnc,
      taxable: true,
      detail: `${(sRate * 100).toFixed(0)} % × ${round2(primeBase)} DH`,
    });
  }

  // 3. Indemnité compensatrice de congés payés non pris (art. 231) — nature salariale.
  const leaveDays = input.accruedLeaveDays != null && input.accruedLeaveDays >= 0
    ? input.accruedLeaveDays
    : estimateAccruedLeave(years, p);
  const indConges = round2(dailyRate * leaveDays);
  if (leaveDays > 0) {
    lines.push({
      key: "conges_payes",
      label: "Indemnité compensatrice de congés payés",
      article: "Art. 231",
      gross: indConges,
      taxable: true,
      detail: `${round2(leaveDays)} j × ${dailyRate} DH${input.accruedLeaveDays == null ? " (estimé)" : ""}`,
    });
    if (input.accruedLeaveDays == null) notes.push("Jours de congés non pris estimés depuis l'ancienneté — à confirmer avec le solde réel.");
  }

  // 4. Indemnité compensatrice de préavis (art. 43) — si dispensé.
  const preavisDue =
    input.preavisDispensed &&
    (input.reason === "licenciement" || input.reason === "rupture_amiable");
  if (input.preavisDispensed && input.reason === "faute_grave") {
    notes.push("Faute grave (art. 39) : aucun préavis n'est dû.");
  }
  if (preavisDue) {
    const br = preavisBracket(years, input.category === "cadre" ? s.preavis.cadre : s.preavis.nonCadre);
    const preavisGross = br.months != null
      ? round2(B * br.months)
      : round2(dailyRate * (br.days ?? 0));
    const dur = br.months != null ? `${br.months} mois` : `${br.days} j`;
    lines.push({
      key: "preavis",
      label: "Indemnité compensatrice de préavis",
      article: "Art. 43",
      gross: preavisGross,
      taxable: true,
      detail: `${input.category === "cadre" ? "Cadre" : "Non-cadre"} · ${dur}`,
    });
  }

  // 5. Indemnité légale de licenciement (art. 52-53) — EXONÉRÉE (dans la limite légale).
  if (input.reason === "licenciement") {
    const minYears = s.licenciementMinSeniorityMonths / 12;
    if (years >= minYears) {
      const h = licenciementHours(years, p);
      const indLic = round2(h * hourlyRate);
      lines.push({
        key: "licenciement",
        label: "Indemnité légale de licenciement",
        article: "Art. 52-53",
        gross: indLic,
        taxable: false,
        detail: `${round2(h)} h × ${hourlyRate} DH (exonérée)`,
      });
    } else {
      notes.push(`Ancienneté (${round2(years)} ans) inférieure à ${s.licenciementMinSeniorityMonths} mois : pas d'indemnité de licenciement (art. 52).`);
    }
  }

  // 6. Dommages-intérêts pour licenciement abusif (art. 41) — EXONÉRÉS dans la limite.
  if (input.abusive && (input.reason === "licenciement" || input.reason === "faute_grave")) {
    const months = Math.min(s.abusiveMonthsPerYear * years, s.abusiveMaxMonths);
    const di = round2(B * months);
    lines.push({
      key: "dommages_interets",
      label: "Dommages-intérêts (licenciement abusif)",
      article: "Art. 41",
      gross: di,
      taxable: false,
      detail: `${round2(months)} mois × ${round2(B)} DH (plafond ${s.abusiveMaxMonths} mois)`,
    });
  }

  // 7. Indemnité de fin de CDD (7 %) — nature salariale.
  if (input.reason === "fin_cdd" && (input.cddTotalGross ?? 0) > 0) {
    const indCdd = round2((input.cddTotalGross ?? 0) * s.cddEndRate);
    lines.push({
      key: "fin_cdd",
      label: "Indemnité de fin de CDD",
      article: "Art. 16 · usage",
      gross: indCdd,
      taxable: true,
      detail: `${(s.cddEndRate * 100).toFixed(0)} % × ${round2(input.cddTotalGross ?? 0)} DH`,
    });
  }

  if (input.reason === "faute_grave") {
    notes.push("Faute grave : le STC est limité au salaire couru et aux congés payés non pris (ni préavis, ni indemnité de licenciement).");
  }
  if (input.reason === "demission") {
    notes.push("Démission : le préavis est dû par le salarié ; aucune indemnité de licenciement.");
  }

  // ---- Agrégats et traitement social/fiscal ----
  const grossTotal = round2(lines.reduce((a, l) => a + l.gross, 0));
  const taxableTotal = round2(lines.filter((l) => l.taxable).reduce((a, l) => a + l.gross, 0));
  const exonereTotal = round2(grossTotal - taxableTotal);

  // Cotisations salariales sur la part de nature salariale (CNSS plafonnée, AMO déplafonnée).
  const cnssBase = Math.min(taxableTotal, p.cnssCeiling);
  const cnssSalarie = round2(cnssBase * p.cnssEmployeeRate);
  const amoSalarie = round2(taxableTotal * p.amoEmployeeRate);

  // Frais professionnels (CGI 59-I-A) sur base annualisée.
  const annual = taxableTotal * 12;
  let fraisPro: number;
  if (annual <= p.fraisProLowThresholdAnnual) {
    fraisPro = round2(taxableTotal * p.fraisProLowRate);
  } else {
    fraisPro = round2(Math.min(taxableTotal * p.fraisProHighRate, p.fraisProHighCapAnnual / 12));
  }

  const sni = round2(Math.max(0, taxableTotal - fraisPro - cnssSalarie - amoSalarie));
  const irBrut = round2(irAnnuel(sni * 12, p) / 12);
  const nbCharges = Math.min(Math.max(0, input.dependents), p.familyDeductionMaxPersons);
  const chargesFamille = round2(nbCharges * p.familyDeductionMonthly);
  const ir = round2(Math.max(0, irBrut - chargesFamille));
  if (taxableTotal > 0) {
    notes.push("IR estimé par la méthode mensuelle sur la part imposable ; l'étalement (art. 60 CGI) peut le réduire — traitement fiscal définitif validé par l'expert-comptable.");
  }

  const otherDeductions = round2(Math.max(0, input.otherDeductions ?? 0));
  const netAPayer = round2(grossTotal - cnssSalarie - amoSalarie - ir - otherDeductions);

  // Charges patronales additionnelles sur la part salariale (indicatif).
  const cnssPatronal = round2(cnssBase * p.cnssEmployerRate);
  const amoPatronal = round2(taxableTotal * p.amoEmployerRate);
  const af = round2(taxableTotal * p.familyAllocRate);
  const tfp = round2(taxableTotal * p.tfpRate);
  const chargesPatronales = round2(cnssPatronal + amoPatronal + af + tfp);
  const coutTotalEmployeur = round2(grossTotal + chargesPatronales);

  return {
    seniorityYears: round2(years),
    hourlyRate,
    dailyRate,
    lines,
    grossTotal,
    exonereTotal,
    taxableTotal,
    cnssSalarie,
    amoSalarie,
    fraisPro,
    sni,
    ir,
    irMarginalRate: irMarginalRate(sni * 12, p),
    otherDeductions,
    netAPayer,
    chargesPatronales,
    coutTotalEmployeur,
    notes,
  };
}
