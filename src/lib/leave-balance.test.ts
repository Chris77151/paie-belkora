import { describe, it, expect } from "vitest";
import type { Employee, Leave } from "@/data/types";
import { acquiredLeaveDays, leaveBalance, payslipLeave } from "./leave-balance";
import { mapOdooLeave } from "./odoo";

const emp = (o: Partial<Employee>): Employee => ({
  id: "e1", firm_id: "f1", first_name: "A", last_name: "B",
  hire_date: "2020-01-01", contract_type: "CDI", base_hourly_rate: 20,
  monthly_hours: 191, dependents: 0, is_active: true, ...o,
});

const leave = (o: Partial<Leave>): Leave => ({
  id: "l", employee_id: "e1", type: "conge_paye", start_date: "2026-01-01", end_date: "2026-01-10", days: 0, cnss_ipe: false, ...o,
});

describe("leave-balance — solde de congés payés", () => {
  it("acquis ≈ 1,5 j/mois + majoration d'ancienneté (art. 231-232)", () => {
    // 6 ans de service (2020→2026) : ~72 mois × 1,5 = 108 j + 1,5 j (1 tranche de 5 ans) ≈ 109,5.
    const a = acquiredLeaveDays(emp({ hire_date: "2020-01-01" }), new Date(2026, 0, 1));
    expect(a).toBeGreaterThan(108);
    expect(a).toBeLessThan(112);
  });

  it("salarié mineur (<18 ans) : 2 j/mois au lieu de 1,5", () => {
    const at = new Date(2026, 0, 1);
    const minor = acquiredLeaveDays(emp({ hire_date: "2025-01-01", birth_date: "2010-01-01" }), at); // 16 ans
    const adult = acquiredLeaveDays(emp({ hire_date: "2025-01-01", birth_date: "1990-01-01" }), at);
    expect(minor).toBeGreaterThan(adult);
    expect(minor / adult).toBeCloseTo(2 / 1.5, 1);
  });

  it("solde = acquis − pris ; seuls les congés PAYÉS de CE salarié comptent", () => {
    const e = emp({ id: "e1", hire_date: "2024-01-01" });
    const leaves: Leave[] = [
      leave({ employee_id: "e1", type: "conge_paye", days: 10 }),
      leave({ employee_id: "e1", type: "conge_paye", days: 5 }),
      leave({ employee_id: "e1", type: "maladie", days: 3 }),   // ignoré (pas un congé payé)
      leave({ employee_id: "e2", type: "conge_paye", days: 20 }), // ignoré (autre salarié)
    ];
    const b = leaveBalance(e, leaves, new Date(2026, 0, 1));
    expect(b.taken).toBe(15);
    expect(b.balance).toBeCloseTo(b.acquired - 15, 6);
  });

  it("aucun congé pris → solde = acquis", () => {
    const e = emp({ hire_date: "2023-01-01" });
    const b = leaveBalance(e, [], new Date(2026, 0, 1));
    expect(b.taken).toBe(0);
    expect(b.balance).toBe(b.acquired);
  });

  it("mapOdooLeave : déduit acquis/pris/solde selon les champs présents (compat versions)", () => {
    // Tous présents.
    expect(mapOdooLeave({ id: 1, allocation_count: 26, allocation_used_count: 10, remaining_leaves: 16 }))
      .toEqual({ odoo_id: 1, allocated: 26, taken: 10, remaining: 16 });
    // Alloué + restant → pris déduit.
    expect(mapOdooLeave({ id: 2, allocation_count: 26, remaining_leaves: 16 }).taken).toBe(10);
    // Alloué + pris → restant déduit.
    expect(mapOdooLeave({ id: 3, allocation_count: 26, allocation_used_count: 10 }).remaining).toBe(16);
    // Champs false (version sans ces champs) → tout à zéro, jamais NaN.
    expect(mapOdooLeave({ id: 4, allocation_count: false })).toEqual({ odoo_id: 4, allocated: 0, taken: 0, remaining: 0 });
  });

  it("payslipLeave : source Odoo si demandée et disponible, sinon repli sur le décompte app", () => {
    const at = new Date(2026, 0, 1);
    const withOdoo = emp({ hire_date: "2024-01-01", odoo_leave: { allocated: 20, taken: 8, remaining: 12, fetched_at: "2026-01-01" } });
    const noOdoo = emp({ hire_date: "2024-01-01" });

    const odoo = payslipLeave(withOdoo, [], at, "odoo");
    expect(odoo.source).toBe("odoo");
    expect(odoo.balance).toEqual({ acquired: 20, taken: 8, balance: 12 });

    // Odoo demandé mais aucun solde importé → repli propre sur le décompte de l'app.
    const fallback = payslipLeave(noOdoo, [], at, "odoo");
    expect(fallback.source).toBe("app");
    expect(fallback.balance.acquired).toBeGreaterThan(0);

    // Source app (ou absente) → toujours le décompte de l'app.
    expect(payslipLeave(withOdoo, [], at, "app").source).toBe("app");
    expect(payslipLeave(withOdoo, [], at, undefined).source).toBe("app");
  });
});
