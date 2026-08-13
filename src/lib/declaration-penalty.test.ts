import { describe, it, expect } from "vitest";
import { getParams } from "./params";
import { computeDeclarationPenalty } from "./declaration-penalty";

const p = getParams(2026);

describe("declaration-penalty — majorations CNSS d'une déclaration complémentaire", () => {
  it("période après la réforme (0,5 %/mois) : 3000 DH, 4 mois de retard → 135 DH", () => {
    // Période régularisée : juin 2025 → échéance 10/07/2025 (≥ 01/04/2025 → taux 0,5 %).
    const r = computeDeclarationPenalty(
      { cotisations: 3000, employees: 1, periodYear: 2025, periodMonth: 6, paymentDate: "2025-11-05" },
      p,
    );
    expect(r.dueDate).toBe("2025-07-10");
    expect(r.monthsLate).toBe(4);
    expect(r.extraMonthRate).toBe(0.005);
    expect(r.majorationPaiement).toBeCloseTo(135, 2); // 3000 × (0,03 + 0,005×3)
    expect(r.astreinte).toBe(0); // ≤ 7 mois
    expect(r.total).toBeCloseTo(135, 2);
  });

  it("1 mois de retard : 1200 DH → 36 DH (3 % seul)", () => {
    const r = computeDeclarationPenalty(
      { cotisations: 1200, employees: 1, periodYear: 2025, periodMonth: 6, paymentDate: "2025-07-15" },
      p,
    );
    expect(r.monthsLate).toBe(1);
    expect(r.majorationPaiement).toBeCloseTo(36, 2);
    expect(r.total).toBeCloseTo(36, 2);
  });

  it("période avant la réforme (1 %/mois) : 3000 DH, 4 mois → 180 DH", () => {
    // Période janvier 2025 → échéance 10/02/2025 (< 01/04/2025 → ancien taux 1 %).
    const r = computeDeclarationPenalty(
      { cotisations: 3000, employees: 1, periodYear: 2025, periodMonth: 1, paymentDate: "2025-06-05" },
      p,
    );
    expect(r.dueDate).toBe("2025-02-10");
    expect(r.monthsLate).toBe(4);
    expect(r.extraMonthRate).toBe(0.01);
    expect(r.majorationPaiement).toBeCloseTo(180, 2); // 3000 × (0,03 + 0,01×3)
  });

  it("astreinte au-delà de 7 mois : 50 DH/mois/salarié", () => {
    // 8 mois de retard, 3 salariés → astreinte = 50 × 3 × (8 − 7) = 150.
    const r = computeDeclarationPenalty(
      { cotisations: 3000, employees: 3, periodYear: 2025, periodMonth: 6, paymentDate: "2026-03-05" },
      p,
    );
    expect(r.monthsLate).toBe(8);
    expect(r.astreinte).toBeCloseTo(150, 2);
    expect(r.majorationPaiement).toBeCloseTo(3000 * (0.03 + 0.005 * 7), 2);
    expect(r.total).toBeCloseTo(r.majorationPaiement + 150, 2);
  });

  it("aucun retard (paiement à l'échéance ou avant) → aucune pénalité", () => {
    const r = computeDeclarationPenalty(
      { cotisations: 5000, employees: 2, periodYear: 2025, periodMonth: 6, paymentDate: "2025-07-10" },
      p,
    );
    expect(r.monthsLate).toBe(0);
    expect(r.total).toBe(0);
  });

  it("cotisations nulles → aucune pénalité", () => {
    const r = computeDeclarationPenalty(
      { cotisations: 0, employees: 5, periodYear: 2024, periodMonth: 3, paymentDate: "2026-01-01" },
      p,
    );
    expect(r.total).toBe(0);
  });
});
