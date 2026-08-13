/**
 * Pénalités CNSS d'une déclaration COMPLÉMENTAIRE / tardive — moteur PUR & testé.
 *
 * Deux postes CUMULABLES (agent expert-comptable, sources CNSS 2025-2026) :
 *   1. Majoration de retard sur le PAIEMENT des cotisations : 3 % le 1er mois (ou fraction) +
 *      un taux par mois supplémentaire RÉFORMÉ au 01/04/2025 (1 % → 0,5 %). Le taux « par mois »
 *      se choisit selon la DATE D'EXIGIBILITÉ de la période régularisée (pas la date de dépôt).
 *   2. Astreinte de déclaration tardive : 50 DH / mois de retard / salarié, au-delà de 7 mois.
 *
 * Le retard court dès le lendemain de l'échéance DAMANCOM (le 10 du mois M+1). Un mois entamé
 * compte pour un mois entier (« mois ou fraction de mois »). Tous les taux/seuils viennent de
 * `params.ts` (aucune constante en dur ici). AVERTISSEMENT : valeurs indicatives, cf. `sourceNote`.
 */
import type { PayrollParams } from "./params";
import { round2 } from "./payroll-engine";

export interface DeclarationPenaltyInput {
  /** Montant des cotisations complémentaires dues (salariale + patronale), en DH. */
  cotisations: number;
  /** Nombre de salariés concernés par la déclaration complémentaire (pour l'astreinte). */
  employees: number;
  /** Période RÉGULARISÉE — année et mois (1-12). Fixe la date d'exigibilité. */
  periodYear: number;
  periodMonth: number;
  /** Date de paiement effectif du complément (ISO « AAAA-MM-JJ »). */
  paymentDate: string;
}

export interface DeclarationPenalty {
  /** Date d'exigibilité DAMANCOM (le 10 du mois M+1), ISO. */
  dueDate: string;
  /** Nombre de mois (ou fraction) de retard. 0 = pas de retard → aucune pénalité. */
  monthsLate: number;
  firstMonthRate: number;
  /** Taux « par mois supplémentaire » retenu (selon la date d'exigibilité vs réforme). */
  extraMonthRate: number;
  /** Majoration de retard sur le paiement des cotisations. */
  majorationPaiement: number;
  /** Astreinte de déclaration tardive (au-delà du seuil). */
  astreinte: number;
  /** Total des pénalités (majoration + astreinte). */
  total: number;
}

/** Date d'exigibilité : le `dueDayOfNextMonth` du mois SUIVANT la période (M+1). */
function dueDateOf(periodYear: number, periodMonth: number, dueDay: number): Date {
  // periodMonth est 1-indexé ; `new Date(y, periodMonth, d)` prend l'index 0-based, donc periodMonth
  // (= M) pointe déjà sur M+1. Ex. mai (5) → new Date(y, 5, 10) = 10 juin.
  return new Date(periodYear, periodMonth, dueDay);
}

/**
 * Nombre de mois de retard entre l'échéance et le paiement, un mois entamé comptant pour un mois
 * entier. Renvoie 0 si le paiement intervient au plus tard à l'échéance (aucune pénalité).
 */
function monthsLateBetween(due: Date, payment: Date): number {
  if (payment.getTime() <= due.getTime()) return 0;
  let months = (payment.getFullYear() - due.getFullYear()) * 12 + (payment.getMonth() - due.getMonth());
  if (payment.getDate() > due.getDate()) months += 1; // fraction de mois entamée → +1
  return Math.max(1, months);
}

/** ISO « AAAA-MM-JJ » d'une date locale (sans décalage de fuseau). */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parse une date « AAAA-MM-JJ » en date LOCALE (comme `dueDateOf`) — pas en UTC comme le ferait
 * `new Date("AAAA-MM-JJ")`, ce qui décalerait la comparaison d'un fuseau et fausserait le retard.
 * Renvoie null si le format est invalide.
 */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Calcule les pénalités CNSS d'une déclaration complémentaire. PURE : ne lit que ses entrées et
 * `params`. Si le complément n'est pas en retard (paiement ≤ échéance), tout est à zéro.
 */
export function computeDeclarationPenalty(inp: DeclarationPenaltyInput, p: PayrollParams): DeclarationPenalty {
  const dp = p.declarationPenalty;
  const due = dueDateOf(inp.periodYear, inp.periodMonth, dp.dueDayOfNextMonth);
  const payment = parseLocalDate(inp.paymentDate);
  const dueIso = iso(due);

  const monthsLate = payment == null ? 0 : monthsLateBetween(due, payment);
  // Taux « par mois supplémentaire » selon la date d'exigibilité vs la réforme du 01/04/2025.
  const extraMonthRate = dueIso >= dp.extraMonthRateReformDate ? dp.extraMonthRateAfter : dp.extraMonthRateBefore;

  if (monthsLate <= 0 || inp.cotisations <= 0) {
    return { dueDate: dueIso, monthsLate: 0, firstMonthRate: dp.firstMonthRate, extraMonthRate, majorationPaiement: 0, astreinte: 0, total: 0 };
  }

  const majorationPaiement = round2(inp.cotisations * (dp.firstMonthRate + extraMonthRate * (monthsLate - 1)));
  const astreinte =
    monthsLate > dp.astreinteThresholdMonths
      ? round2(dp.astreintePerMonthPerEmployee * Math.max(0, inp.employees) * (monthsLate - dp.astreinteThresholdMonths))
      : 0;

  return {
    dueDate: dueIso,
    monthsLate,
    firstMonthRate: dp.firstMonthRate,
    extraMonthRate,
    majorationPaiement,
    astreinte,
    total: round2(majorationPaiement + astreinte),
  };
}
