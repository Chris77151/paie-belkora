/** Ponts entre les entités du store et le moteur de paie pur. */
import type { Employee, Firm, PayslipInput } from "@/data/types";
import { computePayslip, type PayrollInput, type PayrollResult } from "./payroll-engine";

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
