import { describe, expect, it } from "vitest";
import type { AppState, Employee, Firm, Payslip, PayslipInput, PayrollPeriod } from "@/data/types";
import { computePayslip } from "./payroll-engine";
import { buildSettlementReport, settlementAccount } from "./payroll-settlement";
import { buildSettlementPdf } from "./payroll-settlement-export";

const firm = { id: "f1", name: "MBD", regime: "SMIG", payroll_payment_mode: "virement" } as unknown as Firm;

const emp = (o: Partial<Employee>): Employee => ({
  id: "e1", firm_id: "f1", first_name: "Ahmed", last_name: "Alaoui",
  hire_date: "2022-01-01", contract_type: "CDI", base_hourly_rate: 20,
  monthly_hours: 191, dependents: 0, is_active: true, ...o,
});

const input = (o: Partial<PayslipInput> = {}): PayslipInput => ({
  days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
  panier: 0, transport: 0, salissure: 0, other_gross: 0, ...o,
});

function slip(id: string, employee_id: string, e: Employee, inp: PayslipInput): Payslip {
  const result = computePayslip({
    year: 2026, month: 7, regime: "SMIG", hireDate: e.hire_date, dependents: e.dependents,
    hourlyRate: e.base_hourly_rate, daysWorked: inp.days_worked, hoursNormal: inp.hours_normal,
    hoursOt25: inp.hours_ot_25, hoursOt50: inp.hours_ot_50, hoursOt100: inp.hours_ot_100,
    panier: inp.panier, transport: inp.transport, salissure: inp.salissure, otherGross: inp.other_gross,
  });
  return { id, period_id: "per7", employee_id, input: inp, result };
}

function state(): AppState {
  const e1 = emp({ id: "e1", matricule: "001", first_name: "Ahmed", last_name: "Alaoui", payment_mode: "virement", bank_rib: "0123" });
  const e2 = emp({ id: "e2", matricule: "002", first_name: "Sara", last_name: "Bennani", payment_mode: "especes" });
  const e3 = emp({ id: "e3", matricule: "003", first_name: "Omar", last_name: "Cherkaoui" }); // pas de mode → société (virement)
  return {
    firms: [firm],
    employees: [e1, e2, e3],
    periods: [{ id: "per7", firm_id: "f1", year: 2026, month: 7, status: "validated" } as unknown as PayrollPeriod],
    payslips: [
      slip("s1", "e1", e1, input({ advances: 500 })),
      slip("s2", "e2", e2, input()),
      slip("s3", "e3", e3, input()),
    ],
    current_firm_id: "f1",
  } as unknown as AppState;
}

describe("payroll-settlement — état de règlement par mode", () => {
  it("compte de trésorerie : espèces → 5161, virement/chèque → 5141", () => {
    expect(settlementAccount("especes")).toBe("5161");
    expect(settlementAccount("virement")).toBe("5141");
    expect(settlementAccount("cheque")).toBe("5141");
  });

  it("liste les salariés déclarés avec leur mode et net à régler = net − avances", () => {
    const rep = buildSettlementReport(state(), firm, 2026, 7);
    expect(rep.rows).toHaveLength(3);
    const ahmed = rep.rows.find((r) => r.matricule === "001")!;
    expect(ahmed.mode).toBe("virement");
    expect(ahmed.advances).toBe(500);
    expect(ahmed.netToPay).toBeCloseTo(ahmed.net - 500, 2);
    // e3 sans mode → mode société (virement).
    expect(rep.rows.find((r) => r.matricule === "003")!.mode).toBe("virement");
  });

  it("solde par mode : regroupe et somme (virement = e1 + e3, espèces = e2)", () => {
    const rep = buildSettlementReport(state(), firm, 2026, 7);
    const vir = rep.byMode.find((m) => m.mode === "virement")!;
    const esp = rep.byMode.find((m) => m.mode === "especes")!;
    expect(vir.count).toBe(2);
    expect(esp.count).toBe(1);
    // pas de chèque utilisé → absent de byMode
    expect(rep.byMode.find((m) => m.mode === "cheque")).toBeUndefined();
    // cohérence : somme des modes = total général
    const sumNet = rep.byMode.reduce((a, m) => a + m.netToPay, 0);
    expect(rep.total.netToPay).toBeCloseTo(sumNet, 2);
    expect(rep.total.count).toBe(3);
  });

  it("export PDF : A4 portrait, non vide", async () => {
    const warnings: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { warnings.push(a.map(String).join(" ")); };
    try {
      const doc = await buildSettlementPdf(buildSettlementReport(state(), firm, 2026, 7));
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    } finally {
      console.error = orig;
    }
    expect(warnings.join(" ")).not.toContain("could not fit");
  });
});
