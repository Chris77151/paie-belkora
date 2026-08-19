import { describe, it, expect } from "vitest";
import type { SalaryAdvance } from "@/data/types";
import {
  advanceInstallment, advanceDueForPeriod, advanceBalanceAfter, advanceOutstanding, cappedAdvanceDeduction,
} from "./advance-engine";

const adv = (o: Partial<SalaryAdvance>): SalaryAdvance => ({
  id: "a", firm_id: "f", employee_id: "e", kind: "avance", date: "2026-01-10", amount: 3000, months: 3, ...o,
});

describe("advance-engine — avances / acomptes sur salaire", () => {
  it("échéance et retenue par période (avance 3000 sur 3 mois à partir de janvier)", () => {
    const a = adv({ amount: 3000, months: 3, start_month: "2026-01" });
    expect(advanceInstallment(a)).toBe(1000);
    expect(advanceDueForPeriod(a, 2025, 12)).toBe(0); // avant le début
    expect(advanceDueForPeriod(a, 2026, 1)).toBe(1000);
    expect(advanceDueForPeriod(a, 2026, 3)).toBe(1000);
    expect(advanceDueForPeriod(a, 2026, 4)).toBe(0); // après la fenêtre
  });

  it("la dernière échéance solde exactement (rattrapage d'arrondi)", () => {
    const a = adv({ amount: 1000, months: 3, start_month: "2026-01" });
    const jan = advanceDueForPeriod(a, 2026, 1);
    const feb = advanceDueForPeriod(a, 2026, 2);
    const mar = advanceDueForPeriod(a, 2026, 3);
    expect(jan).toBe(333.33);
    expect(mar).toBe(333.34); // 1000 − 2×333.33
    expect(Math.round((jan + feb + mar) * 100) / 100).toBe(1000);
  });

  it("solde restant décroît puis s'annule", () => {
    const a = adv({ amount: 3000, months: 3, start_month: "2026-01" });
    expect(advanceBalanceAfter(a, 2025, 12)).toBe(3000); // pas commencé
    expect(advanceBalanceAfter(a, 2026, 1)).toBe(2000);
    expect(advanceBalanceAfter(a, 2026, 2)).toBe(1000);
    expect(advanceBalanceAfter(a, 2026, 3)).toBe(0);
  });

  it("acompte (months=1) : retenu en une fois, uniquement son mois", () => {
    const a = adv({ kind: "acompte", amount: 800, months: 1, start_month: "2026-06" });
    expect(advanceDueForPeriod(a, 2026, 6)).toBe(800);
    expect(advanceDueForPeriod(a, 2026, 7)).toBe(0);
  });

  it("plafonnement art. 386 : l'AVANCE est bornée au 1/10 du net, l'ACOMPTE non", () => {
    const list = [
      adv({ id: "a1", kind: "avance", amount: 3000, months: 3, start_month: "2026-01" }), // due 1000/mois
      adv({ id: "a2", kind: "acompte", amount: 500, months: 1, start_month: "2026-01" }), // due 500 (non plafonné)
    ];
    // net 4000, 1/10 → cap avance = 400 ; avance due 1000 → appliquée 400 (écrêtée) ; acompte 500 intact.
    const d = cappedAdvanceDeduction(list, "e", 2026, 1, 4000, 0.1);
    expect(d.acompte).toBe(500);
    expect(d.avance).toBe(1000);
    expect(d.cap).toBe(400);
    expect(d.avanceApplied).toBe(400);
    expect(d.capApplied).toBe(true);
    expect(d.applied).toBe(900); // 500 acompte + 400 avance écrêtée
    // net élevé (≥ 10× l'échéance) → pas d'écrêtement.
    const d2 = cappedAdvanceDeduction(list, "e", 2026, 1, 12000, 0.1);
    expect(d2.cap).toBe(1200);
    expect(d2.avanceApplied).toBe(1000);
    expect(d2.capApplied).toBe(false);
  });

  it("solde total d'un salarié = somme des soldes de ses avances", () => {
    const list = [
      adv({ id: "a1", amount: 3000, months: 3, start_month: "2026-01" }),
      adv({ id: "a2", amount: 1200, months: 2, start_month: "2026-01" }),
    ];
    // après janvier : (3000−1000) + (1200−600) = 2000 + 600 = 2600.
    expect(advanceOutstanding(list, "e", 2026, 1)).toBe(2600);
  });
});
