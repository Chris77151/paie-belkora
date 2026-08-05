import { describe, it, expect } from "vitest";
import { computeFor, isEmployedInPeriod, employeesForPeriod } from "./payroll-helpers";
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

describe("isEmployedInPeriod — cohérence des périodes (historique / DAMANCOM)", () => {
  it("exclut un salarié pas encore embauché à la période", () => {
    const e = emp({ hire_date: "2020-03-01" });
    expect(isEmployedInPeriod(e, 2016, 6)).toBe(false); // embauché 4 ans après
    expect(isEmployedInPeriod(e, 2020, 2)).toBe(false); // mois avant l'embauche
  });

  it("inclut dès le mois d'embauche (embauche ≤ dernier jour du mois)", () => {
    expect(isEmployedInPeriod(emp({ hire_date: "2020-03-31" }), 2020, 3)).toBe(true);
    expect(isEmployedInPeriod(emp({ hire_date: "2020-03-01" }), 2020, 3)).toBe(true);
  });

  it("exclut un salarié dont le contrat s'est terminé avant la période", () => {
    const e = emp({ hire_date: "2019-01-01", contract_end: "2021-05-31", is_active: false });
    expect(isEmployedInPeriod(e, 2021, 6)).toBe(false); // mois après la fin
    expect(isEmployedInPeriod(e, 2021, 5)).toBe(true); // dernier mois du contrat
    expect(isEmployedInPeriod(e, 2020, 8)).toBe(true); // en cours de contrat
  });

  it("exclut un salarié aujourd'hui INACTIF sans date de fin (non plaçable dans le temps)", () => {
    expect(isEmployedInPeriod(emp({ is_active: false, contract_end: undefined }), 2022, 6)).toBe(false);
  });

  it("sans date d'embauche renseignée, ne bloque pas sur l'embauche", () => {
    expect(isEmployedInPeriod(emp({ hire_date: "" }), 2016, 6)).toBe(true);
  });

  it("employeesForPeriod ne garde que les salariés employés le mois donné", () => {
    const list = [
      emp({ id: "old", hire_date: "2015-01-01" }),
      emp({ id: "new", hire_date: "2024-01-01" }),
    ];
    expect(employeesForPeriod(list, 2016, 6).map((e) => e.id)).toEqual(["old"]);
    expect(employeesForPeriod(list, 2024, 6).map((e) => e.id).sort()).toEqual(["new", "old"]);
  });
});
