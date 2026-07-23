import { describe, it, expect } from "vitest";
import { buildFormulaReport } from "./formula-report";
import { computePayslip } from "./payroll-engine";
import { AVAILABLE_YEARS } from "./params";

describe("formula-report — trace des formules réelles", () => {
  const year = AVAILABLE_YEARS[0];

  it("produit des hypothèses et des groupes de formules non vides", () => {
    const r = buildFormulaReport(year);
    expect(r.year).toBe(year);
    expect(r.hypotheses.length).toBeGreaterThan(0);
    expect(r.groups.length).toBeGreaterThanOrEqual(8);
    for (const g of r.groups) expect(g.lines.length).toBeGreaterThan(0);
  });

  it("est déterministe (même sortie à chaque appel)", () => {
    expect(JSON.stringify(buildFormulaReport(year))).toBe(JSON.stringify(buildFormulaReport(year)));
  });

  it("le résultat affiché du net correspond EXACTEMENT au moteur réel (aucune invention)", () => {
    // Reconstruit l'exemple identique et compare le net formaté à la ligne du rapport.
    const engine = computePayslip({
      year, month: 6, regime: "SMIG", hireDate: `${year - 7}-01-01`, dependents: 2,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 8, hoursOt50: 0, hoursOt100: 0,
      panier: 0, transport: 500, salissure: 0, otherGross: 0, transportOutsideUrban: false,
    });
    const netLine = buildFormulaReport(year).groups.find((g) => g.id === "net")!.lines[0];
    const expected = `${engine.netAPayer.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
    expect(netLine.result).toBe(expected);
  });
});
