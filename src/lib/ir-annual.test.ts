import { describe, expect, it } from "vitest";
import { buildIrAnnual, irAnnualCoverageLine } from "./ir-annual";
import { computePayslip } from "./payroll-engine";
import type { AppState, Employee, Firm, PayrollPeriod, Payslip } from "@/data/types";

const FIRM: Firm = { id: "f1", name: "MBD", regime: "SMIG", if_fiscal: "12345678" };

const emp = (id: string, o: Partial<Employee> = {}): Employee => ({
  id, firm_id: "f1", first_name: "Prénom", last_name: `Nom${id}`,
  hire_date: "2020-01-01", contract_type: "CDI",
  base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
  cin: `C${id}`, cnss_number: `N${id}`, ...o,
});

/** Bulletin validé d'un mois, calculé par le VRAI moteur (les montants figés font foi). */
function slip(empId: string, month: number, o: { panier?: number; otherGross?: number; advances?: number; dependents?: number } = {}): Payslip {
  const result = computePayslip({
    year: 2025, month, regime: "SMIG", hireDate: "2020-01-01", dependents: o.dependents ?? 0,
    hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
    panier: o.panier ?? 0, transport: 0, salissure: 0, otherGross: o.otherGross ?? 0,
  });
  return {
    id: `s_${empId}_${month}`, period_id: `p${month}`, employee_id: empId,
    input: {
      days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
      panier: o.panier ?? 0, transport: 0, salissure: 0, other_gross: o.otherGross ?? 0,
      advances: o.advances ?? 0,
    },
    result,
  };
}

const period = (month: number): PayrollPeriod => ({ id: `p${month}`, firm_id: "f1", year: 2025, month, status: "validated" });

const state = (employees: Employee[], periods: PayrollPeriod[], payslips: Payslip[]): AppState => ({
  firms: [FIRM], employees, periods, payslips, leaves: [], currentFirmId: "f1",
});

const twelve = (id: string) => Array.from({ length: 12 }, (_, i) => slip(id, i + 1));
const allPeriods = () => Array.from({ length: 12 }, (_, i) => period(i + 1));

describe("état annuel IR — agrégation", () => {
  it("ne retient QUE les bulletins validés (result non nul)", () => {
    const s = state([emp("e1")], [period(1)], [
      slip("e1", 1),
      { id: "brouillon", period_id: "p1", employee_id: "e1", input: slip("e1", 1).input, result: null },
    ]);
    const st = buildIrAnnual(s, FIRM, 2025);
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0].moisPayes).toBe(1);
  });

  it("cumule les douze mois réels — jamais une extrapolation d'un seul mois", () => {
    const s = state([emp("e1")], allPeriods(), twelve("e1"));
    const st = buildIrAnnual(s, FIRM, 2025);
    const un = computePayslip({
      year: 2025, month: 1, regime: "SMIG", hireDate: "2020-01-01", dependents: 0,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier: 0, transport: 0, salissure: 0, otherGross: 0,
    });
    expect(st.rows[0].moisPayes).toBe(12);
    expect(st.rows[0].irRetenuAnnuel).toBeCloseTo(un.ir * 12, 1);
  });

  it("un mois exceptionnel ne se propage pas aux onze autres — c'est tout l'enjeu", () => {
    // Prime de 20 000 DH en décembre : une extrapolation « décembre x 12 » serait très fausse.
    const slips = [...Array.from({ length: 11 }, (_, i) => slip("e1", i + 1)), slip("e1", 12, { otherGross: 20000 })];
    const s = state([emp("e1")], allPeriods(), slips);
    const st = buildIrAnnual(s, FIRM, 2025);
    const dec = slips[11].result!;
    expect(st.rows[0].irRetenuAnnuel).toBeLessThan(dec.ir * 12);
    expect(st.rows[0].brutAnnuel).toBeCloseTo(slips.reduce((t, x) => t + x.result!.salaireBrut, 0), 2);
  });

  it("ignore les autres exercices et les autres sociétés", () => {
    const s = state([emp("e1")], [period(1), { id: "px", firm_id: "f1", year: 2024, month: 1, status: "validated" }], [
      slip("e1", 1),
      { ...slip("e1", 1), id: "autre", period_id: "px" },
    ]);
    expect(buildIrAnnual(s, FIRM, 2025).rows[0].moisPayes).toBe(1);
    expect(buildIrAnnual(s, FIRM, 2023).rows).toHaveLength(0);
  });

  it("n'inscrit pas un salarié jamais payé — il n'a rien à déclarer", () => {
    const s = state([emp("e1"), emp("e2")], [period(1)], [slip("e1", 1)]);
    const st = buildIrAnnual(s, FIRM, 2025);
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0].employee_id).toBe("e1");
  });
});

describe("état annuel IR — cohérence des colonnes", () => {
  const s = state([emp("e1", { dependents: 2 })], allPeriods(), twelve("e1"));
  const st = buildIrAnnual(s, FIRM, 2025);
  const r = st.rows[0];

  it("brut imposable = brut − exonérations", () => {
    expect(Math.round((r.brutAnnuel - r.exonerationsAnnuelles) * 100) / 100).toBe(r.brutImposableAnnuel);
  });

  it("déductions = frais professionnels + CNSS + AMO", () => {
    expect(Math.round((r.fraisProAnnuels + r.cnssAnnuel + r.amoAnnuel) * 100) / 100).toBe(r.deductionsAnnuelles);
  });

  it("net imposable = brut imposable − déductions", () => {
    expect(r.netImposableAnnuel).toBeCloseTo(r.brutImposableAnnuel - r.deductionsAnnuelles, 1);
  });

  it("IR retenu = IR brut − charges de famille", () => {
    expect(r.irRetenuAnnuel).toBeCloseTo(r.irBrutAnnuel - r.chargesFamilleAnnuelles, 1);
  });

  it("les totaux sont la somme exacte des lignes", () => {
    const s2 = state([emp("e1"), emp("e2")], allPeriods(), [...twelve("e1"), ...twelve("e2")]);
    const st2 = buildIrAnnual(s2, FIRM, 2025);
    expect(st2.totals.count).toBe(2);
    expect(st2.totals.irRetenuAnnuel).toBeCloseTo(st2.rows.reduce((t, x) => t + x.irRetenuAnnuel, 0), 2);
    expect(st2.totals.brutAnnuel).toBeCloseTo(st2.rows.reduce((t, x) => t + x.brutAnnuel, 0), 2);
  });

  it("le net perçu déduit les avances retenues", () => {
    const avecAvance = state([emp("e1")], [period(1)], [slip("e1", 1, { advances: 500 })]);
    const sans = state([emp("e1")], [period(1)], [slip("e1", 1)]);
    const a = buildIrAnnual(avecAvance, FIRM, 2025).rows[0].netPercuAnnuel;
    const b = buildIrAnnual(sans, FIRM, 2025).rows[0].netPercuAnnuel;
    expect(Math.round((b - a) * 100) / 100).toBe(500);
  });
});

describe("état annuel IR — couverture de l'exercice", () => {
  it("annonce un exercice complet quand les douze mois sont validés", () => {
    const st = buildIrAnnual(state([emp("e1")], allPeriods(), twelve("e1")), FIRM, 2025);
    expect(st.monthsMissing).toEqual([]);
    expect(irAnnualCoverageLine(st)).toContain("Exercice complet");
  });

  it("signale les mois manquants plutôt que de compléter en silence", () => {
    const s = state([emp("e1")], [period(1), period(2), period(3)], [slip("e1", 1), slip("e1", 2), slip("e1", 3)]);
    const st = buildIrAnnual(s, FIRM, 2025);
    expect(st.monthsCovered).toEqual([1, 2, 3]);
    expect(st.monthsMissing).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(irAnnualCoverageLine(st)).toContain("ÉTAT PARTIEL");
    expect(irAnnualCoverageLine(st)).toContain("04, 05, 06");
  });

  it("ne compte pas comme couverte une période sans aucun bulletin validé", () => {
    const s = state([emp("e1")], [period(1), period(2)], [slip("e1", 1)]);
    expect(buildIrAnnual(s, FIRM, 2025).monthsCovered).toEqual([1]);
  });

  it("le dit clairement quand l'exercice est vide", () => {
    const st = buildIrAnnual(state([emp("e1")], [], []), FIRM, 2025);
    expect(st.rows).toHaveLength(0);
    expect(irAnnualCoverageLine(st)).toContain("Aucun mois validé");
  });
});

describe("état annuel IR — contrôles bloquants au dépôt", () => {
  it("compte les salariés sans n° CNSS et sans CIN", () => {
    const s = state(
      [emp("e1"), emp("e2", { cnss_number: undefined }), emp("e3", { cin: undefined, cnss_number: "  " })],
      [period(1)],
      [slip("e1", 1), slip("e2", 1), slip("e3", 1)],
    );
    const st = buildIrAnnual(s, FIRM, 2025);
    expect(st.missingCnss).toBe(2); // e2 absent, e3 blanc
    expect(st.missingCin).toBe(1);
  });
});

describe("état annuel IR — ordre des lignes", () => {
  it("trie par matricule quand il existe, sinon par nom", () => {
    const s = state(
      [emp("e1", { matricule: "0010" }), emp("e2", { matricule: "0002" }), emp("e3", { matricule: "" , last_name: "Aaa" })],
      [period(1)],
      [slip("e1", 1), slip("e2", 1), slip("e3", 1)],
    );
    const st = buildIrAnnual(s, FIRM, 2025);
    expect(st.rows.map((r) => r.matricule)).toEqual(["0002", "0010", ""]);
    expect(st.rows.map((r) => r.order)).toEqual([1, 2, 3]);
  });
});
