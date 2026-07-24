import { describe, it, expect } from "vitest";
import { buildPayslipHtml, buildPayslipLatex, type PayslipView } from "./payslip";
import { computePayslip } from "./payroll-engine";
import { defaultInput } from "./payroll-helpers";
import type { Employee, Firm, PayrollPeriod } from "@/data/types";

const firm: Firm = { id: "f", name: "MBD", regime: "SMIG" };
const employee: Employee = {
  id: "e", firm_id: "f", first_name: "A", last_name: "B",
  hire_date: "2023-01-01", contract_type: "CDI",
  base_hourly_rate: 30, monthly_hours: 191, dependents: 1, is_active: true,
};
const period: PayrollPeriod = { id: "p", firm_id: "f", year: 2026, month: 6, status: "draft" };

const result = computePayslip({
  year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 1,
  hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
  panier: 0, transport: 0, salissure: 0, otherGross: 0,
});

const view = (showEmployerSection?: boolean): PayslipView => ({
  firm, employee, period, result, input: defaultInput(employee), showEmployerSection,
});

const EMPLOYER_MARKER = "Partie réservée à l'employeur";

describe("bulletin — « Partie réservée à l'employeur » optionnelle", () => {
  it("HTML : incluse par défaut (aucune régression)", () => {
    expect(buildPayslipHtml(view())).toContain(EMPLOYER_MARKER);
    expect(buildPayslipHtml(view(true))).toContain(EMPLOYER_MARKER);
  });

  it("HTML : masquée si showEmployerSection = false", () => {
    expect(buildPayslipHtml(view(false))).not.toContain(EMPLOYER_MARKER);
  });

  it("LaTeX : bloc « Charges patronales » inclus par défaut, masqué si désactivé", () => {
    expect(buildPayslipLatex(view())).toContain("Charges patronales");
    expect(buildPayslipLatex(view(false))).not.toContain("Charges patronales");
  });

  it("HTML : le bloc de bas de page reste ancré en bas (avec ET sans section employeur)", () => {
    for (const show of [true, false]) {
      const html = buildPayslipHtml(view(show));
      // Le bloc final est isolé et poussé en bas (flex + margin-top:auto sur une hauteur mini).
      expect(html).toContain('<div class="bottom">');
      expect(html).toContain(".bottom{margin-top:auto}");
      expect(html).toContain("flex-direction:column");
      expect(html).toContain("min-height:1040px"); // hauteur mini à l'écran
      expect(html).toContain("min-height:262mm");  // hauteur mini à l'impression
      // Le décompte et les mentions restent présents dans les deux cas.
      expect(html).toContain("Décompte monétaire");
      expect(html).toContain("Arrêté à la somme de");
    }
  });

  it("LaTeX : le bloc final est poussé en bas de page (\\vfill) dans les deux cas", () => {
    expect(buildPayslipLatex(view(true))).toContain("\\vfill");
    expect(buildPayslipLatex(view(false))).toContain("\\vfill");
  });

  it("le CALCUL est inchangé : le net et les charges patronales restent identiques", () => {
    // Masquer la section n'affecte que l'affichage, jamais les montants calculés.
    expect(result.chargesPatronales).toBeGreaterThan(0);
    const withSection = buildPayslipHtml(view(true));
    const without = buildPayslipHtml(view(false));
    const net = result.netAPayer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");
    expect(withSection).toContain(net);
    expect(without).toContain(net);
  });
});
