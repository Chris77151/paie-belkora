import { describe, it, expect } from "vitest";
import { computeFor } from "./payroll-helpers";
import type { Employee, Firm } from "@/data/types";

/** Vérifie que l'exonération CNSS portée par l'ENTITÉ Employee (case du formulaire) est
 * réellement transmise au moteur — pas seulement via le PayrollInput. */
const firm: Firm = { id: "f", name: "Test", regime: "SMIG" };
const emp = (over: Partial<Employee> = {}): Employee => ({
  id: "e", firm_id: "f", first_name: "A", last_name: "B",
  hire_date: "2023-01-01", contract_type: "CDI",
  base_hourly_rate: 30, monthly_hours: 191, dependents: 1, is_active: true,
  ...over,
});

describe("computeFor — la case Exonération CNSS de l'Employee est prise en compte", () => {
  it("droit commun (cnss_exemption absent) : cotisations dues", () => {
    const r = computeFor(emp(), firm, 2026, 6, defInput());
    expect(r.cnssSalarie).toBeGreaterThan(0);
    expect(r.cnssPatronal).toBeGreaterThan(0);
  });

  it("cnss_exemption = 'totale' : toutes cotisations à 0 (via l'Employee)", () => {
    const r = computeFor(emp({ cnss_exemption: "totale" }), firm, 2026, 6, defInput());
    expect(r.cnssSalarie).toBe(0);
    expect(r.cnssPatronal).toBe(0);
    expect(r.amoSalarie).toBe(0);
    expect(r.af).toBe(0);
    expect(r.tfp).toBe(0);
  });

  it("cnss_exemption = 'patronale' : part patronale à 0, part salariale due (via l'Employee)", () => {
    const r = computeFor(emp({ cnss_exemption: "patronale" }), firm, 2026, 6, defInput());
    expect(r.cnssSalarie).toBeGreaterThan(0);
    expect(r.cnssPatronal).toBe(0);
    expect(r.af).toBe(0);
    expect(r.tfp).toBe(0);
  });
});

function defInput() {
  return {
    days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
    prime_anciennete_override: null, panier: 0, transport: 0, salissure: 0, other_gross: 0,
    transport_outside_urban: false,
  };
}
