import { describe, expect, it } from "vitest";
import { buildPayment, isNonDeclare, totalsByFirm, totalsOf } from "./non-declares";
import type { AppState } from "@/data/types";

const emp = (id: string, firm_id: string, cnss?: string) =>
  ({
    id, firm_id, first_name: "A", last_name: "B", hire_date: "2025-01-01",
    contract_type: "CDI", base_hourly_rate: 17.92, monthly_hours: 191,
    dependents: 0, is_active: true, cnss_number: cnss,
  }) as never;

describe("non-declares", () => {
  it("sans CNSS = suivi ici, avec CNSS = paie normale", () => {
    expect(isNonDeclare(emp("1", "f1") as never)).toBe(true);
    expect(isNonDeclare(emp("2", "f1", "  ") as never)).toBe(true);
    expect(isNonDeclare(emp("3", "f1", "123") as never)).toBe(false);
  });

  it("net = brut - avance (jamais saisi)", () => {
    const p = buildPayment({
      id: "p1", firm_id: "f1", employee_id: "e1", year: 2026, month: 6,
      jours: 26, brut_verse: 3000, avance_deduite: 200, mode: "especes",
      created_at: "2026-06-30",
    });
    expect(p.net_verse).toBe(2800);
  });

  it("totaux par entité et par période, sans mélange", () => {
    const s = {
      firms: [{ id: "f1", name: "Miya" }, { id: "f2", name: "Ahmed" }],
      employees: [emp("e1", "f1"), emp("e2", "f1", "999"), emp("e3", "f2")],
      nonDeclarePayments: [
        { id: "p1", firm_id: "f1", employee_id: "e1", year: 2026, month: 6, jours: 26, brut_verse: 3000, avance_deduite: 0, net_verse: 3000, mode: "especes", created_at: "2026-06-30" },
        { id: "p2", firm_id: "f2", employee_id: "e3", year: 2026, month: 6, jours: 20, brut_verse: 2000, avance_deduite: 100, net_verse: 1900, mode: "especes", created_at: "2026-06-30" },
      ],
    } as unknown as AppState;
    const t = totalsOf(s.nonDeclarePayments!.filter((p) => p.firm_id === "f1"));
    expect(t.net).toBe(3000);
    const byFirm = totalsByFirm(s, s.firms as never, 2026, 6);
    expect(byFirm.find((x) => x.firm_id === "f1")!.effectifND).toBe(1);
    expect(byFirm.find((x) => x.firm_id === "f2")!.net).toBe(1900);
  });
});
