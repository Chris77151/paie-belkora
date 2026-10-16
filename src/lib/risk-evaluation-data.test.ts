import { describe, expect, it } from "vitest";
import type { AppState, Employee, Firm, PayrollPeriod, Payslip } from "@/data/types";
import {
  EVAL_ACTIONS, EXTRA_DEFS, addMonthsISO, computeLive, echeanceDate, window12,
} from "./risk-evaluation-data";

const firm = { id: "f1", name: "MBD", regime: "SMIG" } as unknown as Firm;
const ASOF = "2026-10-15";

const emp = (o: Partial<Employee>): Employee =>
  ({
    id: "e", firm_id: "f1", first_name: "A", last_name: "B", hire_date: "2020-01-01",
    contract_type: "CDI", base_hourly_rate: 30, monthly_hours: 191, dependents: 0,
    is_active: true, ...o,
  }) as unknown as Employee;

function state(): AppState {
  return {
    firms: [firm],
    employees: [
      emp({ id: "e1", cin: "C1", marital_status: "Célibataire" }),
      emp({ id: "e2", cin: "", marital_status: "" }), // sans CIN ni situation
      emp({ id: "e3", hire_date: "2020-01-01", cin: "C3", marital_status: "Marié(e)" }),
      emp({ id: "e4", base_hourly_rate: 5, cin: "C4", marital_status: "Célibataire" }), // sous-SMIG
    ],
    periods: [{ id: "p9", firm_id: "f1", year: 2026, month: 9, status: "validated" } as PayrollPeriod],
    payslips: [
      {
        id: "s1", period_id: "p9", employee_id: "e1",
        input: { days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0, panier: 0, transport: 0, salissure: 0, other_gross: 0 },
        result: { salaireBrut: 5000 } as never,
      } as Payslip,
    ],
    currentFirmId: "f1",
  } as unknown as AppState;
}

describe("formulaire d'évaluation — plan d'action 2.4", () => {
  it("16 actions (8 + 8), 5 définitions hors référentiel, échéances datées", () => {
    expect(EVAL_ACTIONS).toHaveLength(16);
    expect(EVAL_ACTIONS.filter((a) => a.plan === 1)).toHaveLength(8);
    expect(EVAL_ACTIONS.filter((a) => a.plan === 2)).toHaveLength(8);
    expect(new Set(EVAL_ACTIONS.map((a) => a.action)).size).toBe(16);
    expect(EXTRA_DEFS.map((d) => d.ref).sort()).toEqual(["R26", "R27", "R28", "R29", "R30"]);
    expect(echeanceDate("2026-10-15", "immediat")).toBe("2026-10-15");
    expect(echeanceDate("2026-10-15", "1mois")).toBe("2026-11-15");
    expect(echeanceDate("2026-10-15", "3mois")).toBe("2027-01-15");
    expect(echeanceDate("2026-10-15", "6mois")).toBe("2027-04-15");
    expect(addMonthsISO("2026-10-31", 4)).toBe("2027-02-28"); // jour bloqué au dernier du mois
    expect(window12("2026-10-15")).toHaveLength(12);
    expect(window12("2026-10-15")[0]).toEqual({ year: 2026, month: 9 });
  });

  it("indicateurs live relus dans l'état (R27, R29, R04, R26)", () => {
    const s = state();
    const ctx = { s, firm, asOf: ASOF };
    const r27 = computeLive("R27", ctx)!;
    expect(r27.alerte).toBe(true); // e2 sans situation familiale
    expect(r27.detail).toContain("B");
    const r29 = computeLive("R29", ctx)!;
    expect(r29.alerte).toBe(true); // e2 sans CIN
    const r04 = computeLive("R04", ctx)!;
    expect(r04.alerte).toBe(true); // e4 sous-SMIG (5 × 191)
    const r26 = computeLive("R26", ctx)!;
    expect(r26.alerte).toBe(true); // bulletin à 26 jours (proxy signalé)
    expect(r26.detail).toContain("PROXY");
  });

  it("indicateurs manuels renvoient null (champ à renseigner, jamais inventé)", () => {
    const s = state();
    const ctx = { s, firm, asOf: ASOF };
    for (const ref of ["R14", "R22", "R24", "R09", "R15", "R30"]) {
      expect(computeLive(ref, ctx)).toBeNull();
    }
  });
});
