import { describe, expect, it } from "vitest";
import { computeFor, defaultInput, indemnityYtd } from "./payroll-helpers";
import type { AppState, Employee, Firm, PayrollPeriod, Payslip } from "@/data/types";

/**
 * Chaîne complète d'une indemnité à plafond ANNUEL : saisie → calcul → bulletin figé → cumul
 * relu le mois suivant. C'est le maillon qui empêche d'exonérer trois fois la même gratification
 * dans l'année.
 */

const FIRM: Firm = { id: "f1", name: "MBD", regime: "SMIG" };
const EMP: Employee = {
  id: "e1", firm_id: "f1", first_name: "A", last_name: "B",
  hire_date: "2024-01-01", contract_type: "CDI",
  base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
};

const period = (month: number): PayrollPeriod => ({ id: `p${month}`, firm_id: "f1", year: 2026, month, status: "validated" });

/** Bulletin figé d'un mois, calculé avec le cumul réellement disponible à ce moment-là. */
function freeze(s: AppState, month: number, gratification: number): Payslip {
  const input = { ...defaultInput(EMP), indemnites: { gratification_sociale: gratification } };
  return {
    id: `s${month}`, period_id: `p${month}`, employee_id: "e1", input,
    result: computeFor(EMP, FIRM, 2026, month, input, indemnityYtd(s, "e1", 2026, month)),
  };
}

describe("cumul annuel des exonérations", () => {
  it("relit les exonérations des bulletins validés ANTÉRIEURS de la même année", () => {
    const s: AppState = { firms: [FIRM], employees: [EMP], periods: [period(1)], payslips: [], leaves: [], currentFirmId: "f1" };
    s.payslips.push(freeze(s, 1, 4000));
    const ytd = indemnityYtd(s, "e1", 2026, 2);
    expect(ytd.cnss?.gratification_sociale).toBe(4000);
    expect(ytd.ir?.gratification_sociale).toBe(2500);
  });

  it("n'exonère jamais au-delà du plafond ANNUEL, même réparti sur plusieurs mois", () => {
    const s: AppState = { firms: [FIRM], employees: [EMP], periods: [], payslips: [], leaves: [], currentFirmId: "f1" };
    for (const m of [1, 2, 3]) {
      s.periods.push(period(m));
      s.payslips.push(freeze(s, m, 4000));
    }
    const exoCnss = s.payslips.reduce((t, sl) => t + (sl.result!.indemnitesExonereesCnss ?? 0), 0);
    const exoIr = s.payslips.reduce((t, sl) => t + sl.result!.indemnitesExonerees, 0);
    // 3 x 4 000 versés : 5 000 exonérés côté CNSS, 2 500 côté IR — pas un dirham de plus.
    expect(exoCnss).toBe(5000);
    expect(exoIr).toBe(2500);
  });

  it("ignore les mois postérieurs, les autres années et les bulletins non figés", () => {
    const s: AppState = {
      firms: [FIRM], employees: [EMP], leaves: [], currentFirmId: "f1",
      periods: [period(1), period(5), { id: "old", firm_id: "f1", year: 2025, month: 3, status: "validated" }],
      payslips: [],
    };
    s.payslips.push(freeze(s, 1, 1000));
    s.payslips.push({ ...freeze(s, 5, 1000), id: "s5" });
    s.payslips.push({ ...freeze(s, 1, 1000), id: "old", period_id: "old" });
    s.payslips.push({ id: "draft", period_id: "p1", employee_id: "e1", input: defaultInput(EMP), result: null });
    expect(indemnityYtd(s, "e1", 2026, 3).cnss?.gratification_sociale).toBe(1000);
  });

  it("repart de zéro au 1er janvier", () => {
    const s: AppState = { firms: [FIRM], employees: [EMP], periods: [period(11)], payslips: [], leaves: [], currentFirmId: "f1" };
    s.payslips.push(freeze(s, 11, 5000));
    expect(indemnityYtd(s, "e1", 2027, 1)).toEqual({ ir: {}, cnss: {} });
  });
});

describe("chaîne jusqu'aux états — chaque état lit la BONNE assiette", () => {
  it("l'assiette sociale sert la déclaration CNSS, l'assiette fiscale sert l'IR", () => {
    const input = { ...defaultInput(EMP), indemnites: { gratification_sociale: 4000 } };
    const r = computeFor(EMP, FIRM, 2026, 3, input);
    // Assiette sociale plus BASSE que l'assiette fiscale : 1 500 DH exonérés côté CNSS mais pas IR.
    expect(Math.round((r.sbi - r.assietteCnss) * 100) / 100).toBe(1500);
    // Le détail patronal (affiché au bulletin et repris par la BDS) suit l'assiette sociale.
    expect(r.employerDetail.sbiBase).toBe(r.assietteCnss);
  });
});
