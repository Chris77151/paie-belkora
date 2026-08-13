import { describe, it, expect } from "vitest";
import type { Employee, Leave } from "@/data/types";
import { acquiredLeaveDays, leaveBalance } from "./leave-balance";

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
});
