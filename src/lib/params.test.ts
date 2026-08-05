import { describe, it, expect } from "vitest";
import { getParams, AVAILABLE_YEARS } from "./params";
import { computePayslip, amoActiveAt } from "./payroll-engine";

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

describe("getParams — modèle « date d'effet » (cohérence DAMANCOM)", () => {
  it("choisit le barème dont l'année d'effet est la plus récente ≤ année demandée", () => {
    expect(getParams(2001).year).toBe(2000); // avant 2002
    expect(getParams(2003).year).toBe(2002);
    expect(getParams(2005).year).toBe(2004);
    expect(getParams(2007).year).toBe(2006);
    expect(getParams(2013).year).toBe(2011);
    expect(getParams(2016).year).toBe(2015);
    expect(getParams(2021).year).toBe(2020);
    expect(getParams(2024).year).toBe(2023);
  });

  it("une année antérieure au plus ancien barème retombe sur 2000", () => {
    expect(getParams(1995).year).toBe(2000);
  });

  it("plafond CNSS : 5 000 avant 2002, 6 000 à partir de 2002 (charnière DAMANCOM)", () => {
    expect(getParams(2000).cnssCeiling).toBe(5000);
    expect(getParams(2001).cnssCeiling).toBe(5000);
    expect(getParams(2002).cnssCeiling).toBe(6000);
    expect(getParams(2026).cnssCeiling).toBe(6000);
  });

  it("taux prestations sociales salarial : 3,26 % → 4,29 % (2002) → 4,48 % (IPE, 2015)", () => {
    expect(getParams(2000).cnssEmployeeRate).toBe(0.0326);
    expect(getParams(2002).cnssEmployeeRate).toBe(0.0429);
    expect(getParams(2014).cnssEmployeeRate).toBe(0.0429);
    expect(getParams(2015).cnssEmployeeRate).toBe(0.0448);
    expect(getParams(2026).cnssEmployeeRate).toBe(0.0448);
  });

  it("AMO : inexistante avant le 01/03/2006, active ensuite", () => {
    expect(getParams(2005).amoEmployeeRate).toBe(0);
    expect(getParams(2005).amoEmployerRate).toBe(0);
    expect(getParams(2006).amoEmployeeRate).toBe(0.0226);
    expect(getParams(2006).amoEmployerRate).toBe(0.0411);
  });

  it("date d'effet AMO au MOIS près (01/03/2006) — DAMANCOM ne comptait pas l'AMO avant", () => {
    const p2006 = getParams(2006);
    expect(amoActiveAt(p2006, 2006, 1)).toBe(false); // janvier 2006 : pas d'AMO
    expect(amoActiveAt(p2006, 2006, 2)).toBe(false); // février 2006 : pas d'AMO
    expect(amoActiveAt(p2006, 2006, 3)).toBe(true); // mars 2006 : AMO en vigueur
    expect(amoActiveAt(getParams(2026), 2026, 6)).toBe(true); // sans date d'effet : AMO active
  });

  it("le moteur neutralise réellement l'AMO en janvier-février 2006", () => {
    const base = {
      regime: "SMIG" as const, hireDate: "2005-01-01", dependents: 0,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier: 0, transport: 0, salissure: 0, otherGross: 0,
    };
    const fev = computePayslip({ ...base, year: 2006, month: 2 });
    const mars = computePayslip({ ...base, year: 2006, month: 3 });
    expect(fev.amoSalarie).toBe(0);
    expect(fev.amoPatronal).toBe(0);
    expect(mars.amoSalarie).toBeGreaterThan(0);
    expect(mars.amoPatronal).toBeGreaterThan(0);
  });

  it("heures légales : 208 h avant le Code du travail (2004), 191 h ensuite", () => {
    expect(getParams(2003).legalMonthlyHours).toBe(208);
    expect(getParams(2004).legalMonthlyHours).toBe(191);
    expect(getParams(2026).legalMonthlyHours).toBe(191);
  });

  it("barèmes IR : IGR pré-2010 (top 44 %), LF 2010 (top 38 %), LF 2025 (top 37 %)", () => {
    expect(getParams(2008).irBrackets.at(-1)!.rate).toBe(0.44);
    expect(getParams(2010).irBrackets.at(-1)!.rate).toBe(0.38);
    expect(getParams(2024).irBrackets.at(-1)!.rate).toBe(0.38);
    expect(getParams(2025).irBrackets.at(-1)!.rate).toBe(0.37);
  });

  it("frais professionnels : 20 % (flat) avant LF 2023, puis 35 %/25 %", () => {
    expect(getParams(2022).fraisProLowRate).toBe(0.2);
    expect(getParams(2022).fraisProHighCapAnnual).toBe(30000);
    expect(getParams(2023).fraisProLowRate).toBe(0.35);
    expect(getParams(2023).fraisProLowThresholdAnnual).toBe(78000);
  });
});

describe("cohérence interne des détails CNSS/AMO (le moteur agrège le DÉTAIL, pas l'agrégat)", () => {
  it("court terme + IPE + long terme = taux patronal CNSS pour chaque barème", () => {
    for (const y of AVAILABLE_YEARS) {
      const p = getParams(y);
      const sum = round4(p.cnssEmployerCourtTermeRate + p.cnssEmployerIpeRate + p.cnssEmployerLongTermeRate);
      expect(sum, `année ${y}`).toBe(round4(p.cnssEmployerRate));
    }
  });
  it("AMO base + solidarité = taux patronal AMO pour chaque barème", () => {
    for (const y of AVAILABLE_YEARS) {
      const p = getParams(y);
      const sum = round4(p.amoEmployerBaseRate + p.amoEmployerSolidariteRate);
      expect(sum, `année ${y}`).toBe(round4(p.amoEmployerRate));
    }
  });
});
