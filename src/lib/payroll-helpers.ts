/** Ponts entre les entités du store et le moteur de paie pur. */
import type { Employee, Firm, PayslipInput } from "@/data/types";
import { computePayslip, type PayrollInput, type PayrollResult } from "./payroll-engine";

/**
 * Le salarié était-il EMPLOYÉ pendant le mois (année, mois) ? PUR & testable.
 *
 * Règle (pour la cohérence des périodes, notamment historiques / DAMANCOM) :
 *  - embauché au plus tard le dernier jour du mois (jamais de paie avant l'embauche) ;
 *  - contrat non terminé avant le premier jour du mois (jamais de paie après la sortie) ;
 *  - un salarié aujourd'hui INACTIF et SANS date de fin de contrat n'est pas plaçable dans le
 *    temps → exclu (on ne sait pas quand il a quitté).
 * Sans date d'embauche renseignée, on ne bloque pas sur l'embauche (donnée absente ≠ preuve).
 */
export function isEmployedInPeriod(emp: Employee, year: number, month: number): boolean {
  const periodStart = Date.UTC(year, month - 1, 1);
  const periodEnd = Date.UTC(year, month, 0); // dernier jour du mois
  const hire = emp.hire_date ? Date.parse(emp.hire_date) : NaN;
  if (Number.isFinite(hire) && hire > periodEnd) return false; // pas encore embauché
  const end = emp.contract_end ? Date.parse(emp.contract_end) : NaN;
  if (Number.isFinite(end) && end < periodStart) return false; // déjà sorti
  if (!emp.is_active && !Number.isFinite(end)) return false; // inactif sans date de fin : non plaçable
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
    panier: input.panier,
    transport: input.transport,
    salissure: input.salissure,
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
): PayrollResult {
  return computePayslip(toEngineInput(emp, firm, year, month, input));
}
