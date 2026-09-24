/** Ponts entre les entités du store et le moteur de paie pur. */
import type { YtdExempt } from "./indemnites";
import type { AppState } from "@/data/types";
import type { Employee, Firm, PayslipInput } from "@/data/types";
import { computePayslip, type PayrollInput, type PayrollResult } from "./payroll-engine";

/**
 * Le salarié était-il EMPLOYÉ pendant le mois (année, mois) ? PUR & testable.
 *
 * Règle (pour la cohérence des périodes, notamment historiques / DAMANCOM) :
 *  - embauché au plus tard le dernier jour du mois (jamais de paie avant l'embauche) ;
 *  - non SORTI avant le premier jour du mois (jamais de paie après la sortie). La borne de
 *    sortie est la DATE DE SORTIE EFFECTIVE (`exit_date`) si elle est renseignée — elle fait
 *    foi (art. 24) — sinon, à défaut, le terme prévu du CDD (`contract_end`) ;
 *  - un salarié aujourd'hui INACTIF et SANS aucune date de sortie n'est pas plaçable dans le
 *    temps → exclu (on ne sait pas quand il a quitté).
 * Sans date d'embauche renseignée, on ne bloque pas sur l'embauche (donnée absente ≠ preuve).
 */
export function isEmployedInPeriod(emp: Employee, year: number, month: number): boolean {
  const periodStart = Date.UTC(year, month - 1, 1);
  const periodEnd = Date.UTC(year, month, 0); // dernier jour du mois
  const hire = emp.hire_date ? Date.parse(emp.hire_date) : NaN;
  if (Number.isFinite(hire) && hire > periodEnd) return false; // pas encore embauché
  // Sortie effective (exit_date) prioritaire sur le terme prévu du CDD (contract_end).
  const exitStr = emp.exit_date || emp.contract_end;
  const exit = exitStr ? Date.parse(exitStr) : NaN;
  if (Number.isFinite(exit) && exit < periodStart) return false; // déjà sorti avant la période
  if (!emp.is_active && !Number.isFinite(exit)) return false; // inactif sans date de sortie : non plaçable
  return true;
}

/** Sous-ensemble des salariés réellement employés pendant le mois (année, mois). */
export function employeesForPeriod(list: Employee[], year: number, month: number): Employee[] {
  return list.filter((e) => isEmployedInPeriod(e, year, month));
}

export function defaultInput(emp: Employee): PayslipInput {
  return {
    days_worked: 26,
    hours_normal: emp.monthly_hours,
    hours_ot_25: 0,
    hours_ot_50: 0,
    hours_ot_100: 0,
    prime_anciennete_override: null,
    panier: 0,
    transport: 0,
    salissure: 0,
    lait: 0,
    representation: 0,
    other_gross: 0,
    transport_outside_urban: false,
  };
}

export function toEngineInput(
  emp: Employee,
  firm: Firm,
  year: number,
  month: number,
  input: PayslipInput,
  /** Montants déjà exonérés depuis le 1er janvier — cf. `indemnityYtd`. */
  ytd?: YtdExempt,
): PayrollInput {
  return {
    year,
    month,
    regime: firm.regime,
    hireDate: emp.hire_date,
    dependents: emp.dependents,
    hourlyRate: emp.base_hourly_rate,
    daysWorked: input.days_worked,
    hoursNormal: input.hours_normal,
    hoursOt25: input.hours_ot_25,
    hoursOt50: input.hours_ot_50,
    hoursOt100: input.hours_ot_100,
    primeAncienneteOverride: input.prime_anciennete_override,
    applySeniority: emp.seniority_bonus ?? true, // droit légal par défaut ; désactivable par salarié
    panier: input.panier,
    transport: input.transport,
    salissure: input.salissure,
    lait: input.lait,
    representation: input.representation,
    indemnites: input.indemnites,
    kmProfessionnels: input.km_professionnels,
    kmMutation: input.km_mutation,
    nuitees: input.nuitees,
    voitureService: input.voiture_service ?? "aucune",
    voitureJustifiee: input.voiture_service_justifiee,
    avantageVoiture: input.avantage_voiture,
    ytdExempt: ytd,
    otherGross: input.other_gross,
    transportOutsideUrban: input.transport_outside_urban,
    cnssExemption: emp.cnss_exemption ?? "none",
  };
}

export function computeFor(
  emp: Employee,
  firm: Firm,
  year: number,
  month: number,
  input: PayslipInput,
  ytd?: YtdExempt,
): PayrollResult {
  return computePayslip(toEngineInput(emp, firm, year, month, input, ytd));
}

/**
 * Montants déjà exonérés depuis le 1er janvier pour un salarié, par régime et par indemnité —
 * lus sur ses bulletins VALIDÉS des mois ANTÉRIEURS de la même année.
 *
 * Indispensable aux plafonds annuels (gratifications sociales) : sans ce cumul, chaque mois
 * repartirait d'un plafond plein, et trois versements de 4 000 DH seraient exonérés trois fois.
 */
export function indemnityYtd(s: AppState, employeeId: string, year: number, month: number): YtdExempt {
  const periodIds = new Set(
    s.periods.filter((pd) => pd.year === year && pd.month < month).map((pd) => pd.id),
  );
  const ytd: YtdExempt = { ir: {}, cnss: {} };
  for (const sl of s.payslips ?? []) {
    if (sl.employee_id !== employeeId || !periodIds.has(sl.period_id) || !sl.result) continue;
    for (const l of sl.result.indemnitesDetail ?? []) {
      ytd.ir![l.key] = (ytd.ir![l.key] ?? 0) + l.exoIr;
      ytd.cnss![l.key] = (ytd.cnss![l.key] ?? 0) + l.exoCnss;
    }
  }
  return ytd;
}
