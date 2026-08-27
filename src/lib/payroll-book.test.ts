import { describe, expect, it } from "vitest";
import type { AppState, Employee, Firm, Payslip, PayslipInput, PayrollPeriod } from "@/data/types";
import { computePayslip } from "./payroll-engine";
import { buildPayrollBook, payrollBookYears } from "./payroll-book";
import { buildPayrollBookPdf, payrollBookFileName } from "./payroll-book-export";

const firm = { id: "f1", name: "MBD", regime: "SMIG" } as unknown as Firm;

const emp = (o: Partial<Employee>): Employee => ({
  id: "e1", firm_id: "f1", first_name: "Ahmed", last_name: "Alaoui",
  hire_date: "2022-01-01", contract_type: "CDI", base_hourly_rate: 20,
  monthly_hours: 191, dependents: 0, is_active: true, ...o,
});

const input = (o: Partial<PayslipInput> = {}): PayslipInput => ({
  days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
  panier: 0, transport: 0, salissure: 0, other_gross: 0, ...o,
});

function slip(id: string, period_id: string, employee_id: string, e: Employee, inp: PayslipInput, validated = true): Payslip {
  const result = validated
    ? computePayslip({
        year: 2026, month: 7, regime: "SMIG", hireDate: e.hire_date, dependents: e.dependents,
        hourlyRate: e.base_hourly_rate, daysWorked: inp.days_worked, hoursNormal: inp.hours_normal,
        hoursOt25: inp.hours_ot_25, hoursOt50: inp.hours_ot_50, hoursOt100: inp.hours_ot_100,
        panier: inp.panier, transport: inp.transport, salissure: inp.salissure, otherGross: inp.other_gross,
      })
    : null;
  return { id, period_id, employee_id, input: inp, result };
}

const period = (id: string, year: number, month: number): PayrollPeriod =>
  ({ id, firm_id: "f1", year, month, status: "validated" }) as unknown as PayrollPeriod;

function state(over: Partial<AppState> = {}): AppState {
  const e1 = emp({ id: "e1", matricule: "002", first_name: "Ahmed", last_name: "Alaoui", position: "Ouvrier" });
  const e2 = emp({ id: "e2", matricule: "001", first_name: "Sara", last_name: "Bennani", position: "Cheffe" });
  const per = period("per7", 2026, 7);
  return {
    firms: [firm],
    employees: [e1, e2],
    periods: [per],
    payslips: [slip("s1", "per7", "e1", e1, input()), slip("s2", "per7", "e2", e2, input({ hours_ot_25: 10 }))],
    current_firm_id: "f1",
    ...over,
  } as unknown as AppState;
}

describe("payroll-book — livre de paie", () => {
  it("agrège une ligne par bulletin validé, triée par matricule", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    expect(b.rows).toHaveLength(2);
    // e2 (matricule 001) avant e1 (002)
    expect(b.rows[0].name).toBe("Sara Bennani");
    expect(b.rows[1].name).toBe("Ahmed Alaoui");
    expect(b.rows[0].order).toBe(1);
    expect(b.rows[1].order).toBe(2);
  });

  it("période « mm/aaaa » et report des heures depuis l'input", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    const sara = b.rows[0];
    expect(sara.period).toBe("07/2026");
    expect(sara.hoursOt25).toBe(10);
    expect(sara.totalHours).toBe(201); // 191 + 10
  });

  it("primes/indemnités = brut − base − ancienneté, et total retenues = CNSS+AMO+IR", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    for (const r of b.rows) {
      expect(r.primesIndemnites).toBeCloseTo(r.salaireBrut - r.salaireBase - r.primeAnciennete, 2);
      expect(r.totalRetenues).toBeCloseTo(r.cnssSalarie + r.amoSalarie + r.ir, 2);
    }
  });

  it("pont brut→imposable (colonnes officielles) : imposable = brut − à déduire + à ajouter", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    for (const r of b.rows) {
      // Identité du registre : le salaire imposable se déduit du brut par les deux colonnes.
      expect(r.sbi).toBeCloseTo(r.salaireBrut - r.imposableADeduire + r.imposableAAjouter, 2);
      // Un seul des deux ajustements est renseigné (jamais les deux à la fois).
      expect(Math.min(r.imposableADeduire, r.imposableAAjouter)).toBe(0);
    }
    expect(b.totals.imposableADeduire).toBeCloseTo(
      b.rows.reduce((a, r) => a + r.imposableADeduire, 0), 2);
    expect(b.totals.imposableAAjouter).toBeCloseTo(
      b.rows.reduce((a, r) => a + r.imposableAAjouter, 0), 2);
  });

  it("colonnes officielles complètes : entrée en service, nombre de déductions, frais professionnels", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    for (const r of b.rows) {
      // Identité du registre officiel désormais portée par le livre.
      expect(r.hireDate).toBe("2022-01-01");
      expect(typeof r.dependents).toBe("number");
      // Frais professionnels : abattement fiscal réel (> 0 sur un salaire imposable non nul), avec son taux.
      expect(r.fraisPro).toBeGreaterThan(0);
      expect(r.fraisProRate).toBeGreaterThan(0);
    }
    expect(b.totals.fraisPro).toBeCloseTo(b.rows.reduce((a, r) => a + r.fraisPro, 0), 2);
  });

  it("les totaux somment les lignes (net, brut, retenues)", () => {
    const b = buildPayrollBook(state(), firm, 2026, 7);
    const sumNet = b.rows.reduce((a, r) => a + r.netAPayer, 0);
    expect(b.totals.netAPayer).toBeCloseTo(sumNet, 2);
    expect(b.totals.count).toBe(2);
  });

  it("avances : net à payer final = salaire net − avances (colonnes officielles)", () => {
    const s = state();
    // Bulletin d'Ahmed (e1) avec 500 DH d'avances.
    (s.payslips as Payslip[])[0] = slip("s1", "per7", "e1", (s.employees as Employee[])[0], input({ advances: 500 }));
    const b = buildPayrollBook(s, firm, 2026, 7);
    const ahmed = b.rows.find((r) => r.name === "Ahmed Alaoui")!;
    expect(ahmed.avances).toBe(500);
    expect(ahmed.netFinal).toBeCloseTo(ahmed.netAPayer - 500, 2);
    // Sans avances, net final = salaire net.
    const sara = b.rows.find((r) => r.name === "Sara Bennani")!;
    expect(sara.avances).toBe(0);
    expect(sara.netFinal).toBeCloseTo(sara.netAPayer, 2);
    // Totaux cohérents.
    expect(b.totals.avances).toBe(500);
    expect(b.totals.netFinal).toBeCloseTo(b.totals.netAPayer - 500, 2);
  });

  it("exclut les bulletins non validés (result null)", () => {
    const e3 = emp({ id: "e3", matricule: "003" });
    const s = state();
    (s.employees as Employee[]).push(e3);
    (s.payslips as Payslip[]).push(slip("s3", "per7", "e3", e3, input(), false));
    const b = buildPayrollBook(s, firm, 2026, 7);
    expect(b.rows).toHaveLength(2); // le 3e (non validé) est écarté
  });

  it("filtre par mois, et couvre toute l'année si month = null", () => {
    const s = state();
    (s.periods as PayrollPeriod[]).push(period("per8", 2026, 8));
    const e1 = (s.employees as Employee[])[0];
    (s.payslips as Payslip[]).push(slip("s4", "per8", "e1", e1, input()));
    expect(buildPayrollBook(s, firm, 2026, 8).rows).toHaveLength(1);
    expect(buildPayrollBook(s, firm, 2026, null).rows).toHaveLength(3); // 2 (juillet) + 1 (août)
  });

  it("payrollBookYears liste les années présentes, décroissantes", () => {
    const s = state();
    (s.periods as PayrollPeriod[]).push(period("per25", 2025, 12));
    expect(payrollBookYears(s, "f1")).toEqual([2026, 2025]);
  });

  it("export PDF : paysage A4, non vide, sans débordement de colonnes", async () => {
    const warnings: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { warnings.push(a.map(String).join(" ")); };
    try {
      const b = buildPayrollBook(state(), firm, 2026, null);
      const doc = await buildPayrollBookPdf(b);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
      expect(payrollBookFileName(b, "pdf")).toBe("Livre_Paie_f1_2026.pdf");
    } finally {
      console.error = orig;
    }
    expect(warnings.join(" ")).not.toContain("could not fit");
  });
});
