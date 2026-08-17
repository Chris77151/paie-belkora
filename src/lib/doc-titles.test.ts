import { describe, it, expect } from "vitest";
import { DOC_TITLES } from "./doc-titles";
import { buildPayslipHtml, type PayslipView } from "./payslip";
import { computePayslip } from "./payroll-engine";
import { defaultInput } from "./payroll-helpers";
import type { Employee, Firm, PayrollPeriod } from "@/data/types";

describe("doc-titles — centralisation des titres de documents", () => {
  it("expose les titres attendus, une seule fois", () => {
    expect(DOC_TITLES.bulletin).toBe("BULLETIN DE PAIE");
    expect(DOC_TITLES.ecritures).toBe("Écritures comptables de paie");
    expect(DOC_TITLES.bordereauCnss).toBe("Bordereau de déclaration CNSS");
    expect(DOC_TITLES.livrePaie).toBe("Livre de paie");
    expect(DOC_TITLES.registreMouvements).toBe("Registre des mouvements de main-d'œuvre");
  });

  it("le bulletin RÉEL utilise le titre centralisé (HTML)", () => {
    const firm: Firm = { id: "f", name: "MBD", regime: "SMIG" };
    const employee: Employee = {
      id: "e", firm_id: "f", first_name: "A", last_name: "B",
      hire_date: "2023-01-01", contract_type: "CDI", base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
    };
    const period: PayrollPeriod = { id: "p", firm_id: "f", year: 2026, month: 6, status: "draft" };
    const result = computePayslip({
      year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 0,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier: 0, transport: 0, salissure: 0, otherGross: 0,
    });
    const v: PayslipView = { firm, employee, period, result, input: defaultInput(employee) };
    expect(buildPayslipHtml(v)).toContain(DOC_TITLES.bulletin);
  });
});
