/**
 * Avances / acomptes sur salaire — moteur PUR & testé.
 *
 * Une avance est saisie UNE FOIS (montant, nombre d'échéances, date/mois de début, nature) ; le
 * moteur en déduit, pour chaque période de paie, l'échéance à retenir et le solde restant, sans
 * ressaisie. Deux natures (Code du travail marocain, art. 385/386) :
 *   - `acompte` : salaire déjà gagné ce mois → retenu EN UNE FOIS, NON plafonné (art. 386 :
 *                 « les acomptes ne sont pas considérés comme prêts ») ;
 *   - `avance`  : prêt remboursé par retenues successives → échelonné et PLAFONNÉ au dixième (1/10)
 *                 du salaire échu (art. 386). Le taux du plafond vient de `params.ts`
 *                 (`advanceMonthlyCapRate`), jamais en dur ici.
 *
 * Si l'échéance théorique dépasse le plafond, la retenue est écrêtée (`capApplied`) et la durée
 * réelle de remboursement s'allonge au-delà du nombre d'échéances saisi — à signaler dans l'UI.
 *
 * La dernière échéance solde exactement le montant (rattrapage de l'arrondi). Toutes les fonctions
 * sont déterministes : la période est passée en paramètre (jamais `new Date()` implicite).
 */
import type { SalaryAdvance } from "@/data/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Mois de la 1re retenue (« AAAA-MM ») : `start_month` s'il est fourni, sinon le mois de `date`. */
export function advanceStartMonth(a: SalaryAdvance): string {
  if (a.start_month && /^\d{4}-\d{2}$/.test(a.start_month)) return a.start_month;
  return (a.date || "").slice(0, 7);
}

/** Échéance mensuelle théorique = montant / nombre d'échéances (≥ 1). */
export function advanceInstallment(a: SalaryAdvance): number {
  return round2(a.amount / Math.max(1, a.months));
}

/** Index 0-based du mois (year, month) par rapport au mois de début (< 0 = avant le début). */
function monthIndex(start: string, year: number, month: number): number {
  const [sy, sm] = start.split("-").map(Number);
  if (!sy || !sm) return -1;
  return (year - sy) * 12 + (month - sm);
}

/**
 * Retenue due pour UNE avance à la période (year, month), avant plafonnement. Dans la fenêtre
 * [début, début + months − 1] : l'échéance ; la DERNIÈRE échéance ajuste l'arrondi pour solder
 * exactement le montant. Hors fenêtre : 0.
 */
export function advanceDueForPeriod(a: SalaryAdvance, year: number, month: number): number {
  const n = Math.max(1, a.months);
  const idx = monthIndex(advanceStartMonth(a), year, month);
  if (idx < 0 || idx >= n) return 0;
  const inst = advanceInstallment(a);
  return idx === n - 1 ? round2(a.amount - inst * (n - 1)) : inst;
}

/** Solde restant d'UNE avance APRÈS la période (year, month) = montant − échéances échues. */
export function advanceBalanceAfter(a: SalaryAdvance, year: number, month: number): number {
  const n = Math.max(1, a.months);
  const idx = monthIndex(advanceStartMonth(a), year, month);
  if (idx < 0) return round2(a.amount); // pas encore commencé
  const elapsed = Math.min(idx + 1, n);
  const paid = elapsed >= n ? a.amount : round2(advanceInstallment(a) * elapsed);
  return round2(Math.max(0, a.amount - paid));
}

/** Solde total restant d'un salarié à la fin de la période (year, month). */
export function advanceOutstanding(advances: SalaryAdvance[], employeeId: string, year: number, month: number): number {
  return round2(
    advances.filter((a) => a.employee_id === employeeId).reduce((s, a) => s + advanceBalanceAfter(a, year, month), 0),
  );
}

export interface AdvanceDeduction {
  /** Total dû ce mois (acompte + avance), avant plafond. */
  due: number;
  /** Part « acompte » (non plafonnée). */
  acompte: number;
  /** Part « avance » due (avant plafond). */
  avance: number;
  /** Plafond légal applicable à la part « avance » = net × 1/10 (art. 386 CT). */
  cap: number;
  /** Part « avance » réellement retenue (bornée au plafond). */
  avanceApplied: number;
  /** Le plafond a-t-il réduit la retenue de la part « avance » ? */
  capApplied: boolean;
  /** Retenue EFFECTIVE à porter sur le bulletin = acompte + avanceApplied. */
  applied: number;
}

/**
 * Retenue d'avances EFFECTIVE pour un salarié sur une période, avec plafonnement de la seule part
 * « avance/prêt » au dixième du net (`capRate` ∈ [0,1] = `advanceMonthlyCapRate` de `params.ts`,
 * art. 386 CT). L'acompte (salaire déjà gagné) n'est pas plafonné. PURE.
 */
export function cappedAdvanceDeduction(
  advances: SalaryAdvance[],
  employeeId: string,
  year: number,
  month: number,
  net: number,
  capRate: number,
): AdvanceDeduction {
  const list = advances.filter((a) => a.employee_id === employeeId);
  const acompte = round2(list.filter((a) => a.kind === "acompte").reduce((s, a) => s + advanceDueForPeriod(a, year, month), 0));
  const avance = round2(list.filter((a) => a.kind === "avance").reduce((s, a) => s + advanceDueForPeriod(a, year, month), 0));
  const cap = round2(Math.max(0, net) * Math.max(0, Math.min(1, capRate)));
  const avanceApplied = round2(Math.min(avance, cap));
  return {
    due: round2(acompte + avance),
    acompte,
    avance,
    cap,
    avanceApplied,
    capApplied: avanceApplied < avance - 0.001,
    applied: round2(acompte + avanceApplied),
  };
}
