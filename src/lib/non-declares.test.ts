import { describe, expect, it } from "vitest";
import {
  backfillPeriodes, buildPayment, isNonDeclare, lastDayOfMonth,
  paymentPeriodLabel, quinzaineLabel, totalsByFirm, totalsOf,
} from "./non-declares";
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

  it("les 2 quinzaines sont toujours précisées (libellés exacts, février inclus)", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2024, 2)).toBe(29); // bissextile
    expect(lastDayOfMonth(2026, 10)).toBe(31);
    expect(quinzaineLabel(2026, 10, "Q1")).toBe("du 01/10/2026 au 15/10/2026");
    expect(quinzaineLabel(2026, 2, "Q2")).toBe("du 16/02/2026 au 28/02/2026");
    const p = buildPayment({
      id: "p", firm_id: "f", employee_id: "e", year: 2026, month: 10,
      jours: 12, brut_verse: 1000, avance_deduite: 0, mode: "especes",
      quinzaine: "Q1", periode: "du 20/09/2026 au 03/10/2026", created_at: "2026-10-05",
    });
    expect(paymentPeriodLabel(p)).toBe("10/2026 · Q1 (du 20/09/2026 au 03/10/2026)");
  });

  it("backfill : les versements importés sans période sont rattachés (Q1 + fiche), idempotent", () => {
    const s = {
      nonDeclarePayments: [
        { id: "a", firm_id: "f", employee_id: "e", year: 2026, month: 10, jours: 1, brut_verse: 100, net_verse: 100, mode: "especes", created_at: "x", created_by: "import-fiche-12/EM-2026-10-MIYA" },
        { id: "b", firm_id: "f", employee_id: "e", year: 2026, month: 10, jours: 1, brut_verse: 100, net_verse: 100, mode: "especes", created_at: "x", created_by: "saisie-manuelle", quinzaine: "Q2" as const, periode: "du 16/10/2026 au 31/10/2026" },
      ],
    } as unknown as AppState;
    expect(backfillPeriodes(s)).toBe(1);
    expect(s.nonDeclarePayments![0].quinzaine).toBe("Q1");
    expect(s.nonDeclarePayments![0].periode).toBe("du 20/09/2026 au 03/10/2026");
    expect(s.nonDeclarePayments![1].periode).toBe("du 16/10/2026 au 31/10/2026"); // saisie intacte
    expect(backfillPeriodes(s)).toBe(0);
  });
});
