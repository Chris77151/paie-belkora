import { describe, it, expect } from "vitest";
import { runStabilityChecks, buildReport } from "./stability-engine";
import { seed } from "@/data/seed";
import type { AppState, Payslip } from "@/data/types";

/** État de base propre (seed) : 2 sociétés, 0 salarié, 0 bulletin. */
function clean(): AppState {
  return seed();
}

describe("stability-engine — référentiel params", () => {
  it("le seed ne produit AUCUN finding (params valides, aucune donnée orpheline)", () => {
    const findings = runStabilityChecks(clean());
    expect(findings).toHaveLength(0);
  });

  it("le barème IR réel est monotone → aucun finding 'calcul' sur params", () => {
    const calc = runStabilityChecks(clean()).filter((f) => f.axis === "calcul");
    expect(calc).toHaveLength(0);
  });
});

describe("stability-engine — intégrité des données", () => {
  it("détecte un bulletin orphelin (salarié/période inexistants) et le marque réparable", () => {
    const s = clean();
    const orphan: Payslip = {
      id: "slip_orphan",
      period_id: "per_inexistant",
      employee_id: "emp_inexistant",
      input: {
        days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
        panier: 0, transport: 0, salissure: 0, other_gross: 0,
      },
      result: null,
    };
    s.payslips.push(orphan);
    const findings = runStabilityChecks(s);
    const f = findings.find((x) => x.id === "orphan-payslips");
    expect(f).toBeDefined();
    expect(f!.repairable).toBe(true);
    expect(f!.axis).toBe("integrite");
  });

  it("détecte une société active invalide (réparable)", () => {
    const s = clean();
    s.currentFirmId = "firm_inexistante";
    const f = runStabilityChecks(s).find((x) => x.id === "invalid-current-firm");
    expect(f).toBeDefined();
    expect(f!.repairable).toBe(true);
  });

  it("détecte l'absence de super administrateur (non réparable in-app)", () => {
    const s = clean();
    s.users = (s.users ?? []).filter((u) => u.role !== "super_admin" && !u.is_super);
    const f = runStabilityChecks(s).find((x) => x.id === "no-super-admin");
    expect(f).toBeDefined();
    expect(f!.repairable).toBe(false);
    expect(f!.severity).toBe("critique");
  });
});

describe("stability-engine — invariants de calcul des bulletins", () => {
  it("signale un net supérieur au brut (défaut de calcul)", () => {
    const s = clean();
    const emp = { ...seed().firms[0] }; // pour firm id valide
    // Rattache un salarié + une période + un bulletin cohérents en identité, sauf net>brut.
    s.employees.push({
      id: "emp_x", firm_id: emp.id, first_name: "A", last_name: "B",
      hire_date: "2024-01-01", contract_type: "CDI", base_hourly_rate: 20, monthly_hours: 191,
      dependents: 0, is_active: true,
    });
    s.periods.push({ id: "per_x", firm_id: emp.id, year: 2026, month: 1, status: "draft" });
    s.payslips.push({
      id: "slip_x", period_id: "per_x", employee_id: "emp_x",
      input: { days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0, panier: 0, transport: 0, salissure: 0, other_gross: 0 },
      // net (5000) > brut (4000) : incohérent
      result: {
        salaireBase: 4000, overtime: 0, overtimeDetail: { ot25: 0, ot50: 0, ot100: 0 },
        seniorityYears: 0, seniorityRate: 0, primeAnciennete: 0,
        panierExonere: 0, transportExonere: 0, salissureExoneree: 0, indemnitesExonerees: 0, indemnitesImposables: 0,
        salaireBrut: 4000, sbi: 4000, cnssSalarie: 179.2, amoSalarie: 90.4, fraisPro: 0, fraisProRate: 0.35,
        sni: 3730, irBrut: 0, chargesFamille: 0, ir: 0, netAPayer: 5000,
        cnssPatronal: 0, amoPatronal: 0, tfp: 0, af: 0,
      } as Payslip["result"],
    });
    const f = runStabilityChecks(s).find((x) => x.id === "slip-slip_x-netgtbrut");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critique");
  });
});

describe("stability-engine — rapport", () => {
  it("score = 100 sans finding, et décroît avec les findings", () => {
    expect(buildReport([]).score).toBe(100);
    const s = clean();
    s.currentFirmId = "x"; // 1 finding 'eleve' (poids 12)
    const rep = buildReport(runStabilityChecks(s));
    expect(rep.score).toBeLessThan(100);
    expect(rep.repairableCount).toBeGreaterThanOrEqual(1);
  });
});
