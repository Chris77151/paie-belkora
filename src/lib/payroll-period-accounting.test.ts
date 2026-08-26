import { describe, it, expect } from "vitest";
import { computePayslip, type PayrollInput, type PayrollResult } from "./payroll-engine";
import { periodSplit, buildPeriodEntries, buildReclassementEntry, resolvePaymentMode, type PeriodSlip } from "./payroll-period-accounting";
import type { Employee, Firm, PayslipInput } from "@/data/types";

const firm: Firm = { id: "f", name: "MBD", regime: "SMIG" };
const emp = (id: string, mode?: Employee["payment_mode"]): Employee => ({
  id, firm_id: "f", first_name: id, last_name: "X", hire_date: "2023-01-01",
  contract_type: "CDI", base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
  payment_mode: mode,
});
const IN: PayrollInput = {
  year: 2026, month: 7, regime: "SMIG", hireDate: "2023-01-01", dependents: 0,
  hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
  panier: 0, transport: 0, salissure: 0, otherGross: 0,
};
const R: PayrollResult = computePayslip(IN);
const slip = (employee_id: string, advances = 0): PeriodSlip => ({
  employee_id,
  input: { advances } as unknown as PayslipInput,
  result: R,
});

describe("payroll-period-accounting — ventilation trésorerie par salarié", () => {
  it("resolvePaymentMode : fiche salarié > société > virement", () => {
    expect(resolvePaymentMode(emp("a", "especes"), firm)).toBe("especes");
    expect(resolvePaymentMode(emp("a"), { ...firm, payroll_payment_mode: "especes" })).toBe("especes");
    expect(resolvePaymentMode(undefined, firm)).toBe("virement");
  });

  it("periodSplit : sépare net espèces / net banque et les avances par groupe", () => {
    const employees = [emp("cash", "especes"), emp("bank", "virement")];
    const split = periodSplit([slip("cash", 100), slip("bank", 0)], employees, firm);
    expect(split.netCash).toBe(R.netAPayer);
    expect(split.netBank).toBe(R.netAPayer);
    expect(split.advanceCash).toBe(100);
    expect(split.advanceBank).toBe(0);
  });

  it("buildPeriodEntries : paiement mixte → 2 articles de règlement équilibrés (CA + BQ)", () => {
    const employees = [emp("cash", "especes"), emp("bank", "virement")];
    const { paie, reglements } = buildPeriodEntries([slip("cash"), slip("bank")], employees, firm, 2026, 7);
    expect(paie.balanced).toBe(true);
    expect(reglements).toHaveLength(2);
    expect(reglements.every((e) => e.balanced)).toBe(true);
    const caisse = reglements.find((e) => e.journal === "CA")!;
    const banque = reglements.find((e) => e.journal === "BQ")!;
    // Le net espèces est crédité en 5161, jamais en 5141 ; l'inverse pour la banque.
    expect(caisse.lines.find((l) => l.account === "5161")?.credit).toBe(R.netAPayer);
    expect(banque.lines.some((l) => l.account === "5161")).toBe(false);
    expect(banque.lines.some((l) => l.account === "5141")).toBe(true);
  });

  it("buildPeriodEntries : tous par banque → 1 seul article (BQ), pas de caisse", () => {
    const employees = [emp("b1", "virement"), emp("b2")]; // b2 sans mode → défaut société (virement)
    const { reglements } = buildPeriodEntries([slip("b1"), slip("b2")], employees, firm, 2026, 7);
    expect(reglements).toHaveLength(1);
    expect(reglements[0].journal).toBe("BQ");
    expect(reglements[0].lines.some((l) => l.account === "5161")).toBe(false);
  });

  it("buildReclassementEntry : OD équilibrée qui déplace la TFP 61671→61678, null si identique", () => {
    const employees = [emp("b1", "virement")];
    const { paie, reglements } = buildPeriodEntries([slip("b1")], employees, firm, 2026, 7);
    const nouveau = [paie, ...reglements];
    // « Ancien » instantané = identique mais TFP encore en 61671 (avant correction).
    const ancien = nouveau.map((e) => ({
      ...e,
      lines: e.lines.map((l) => (l.account === "61678" ? { ...l, account: "61671" } : l)),
    }));
    const od = buildReclassementEntry(ancien, nouveau, "2026-08-26", "RECL-2026-07")!;
    expect(od).not.toBeNull();
    expect(od.journal).toBe("OD");
    expect(od.balanced).toBe(true);
    const tfp = paie.lines.find((l) => l.account === "61678")!.debit; // montant TFP
    expect(od.lines.find((l) => l.account === "61678")?.debit).toBe(tfp);  // reclasse vers 61678
    expect(od.lines.find((l) => l.account === "61671")?.credit).toBe(tfp); // annule 61671
    // Aucun écart → null.
    expect(buildReclassementEntry(nouveau, nouveau, "2026-08-26", "R")).toBeNull();
  });
});
