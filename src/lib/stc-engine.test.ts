import { describe, it, expect } from "vitest";
import {
  computeStc,
  licenciementHours,
  preavisBracket,
  seniorityYearsFraction,
  type StcInput,
} from "./stc-engine";
import { getParams } from "./params";

const p = getParams(2026);

const base = (over: Partial<StcInput> = {}): StcInput => ({
  year: 2026,
  reason: "licenciement",
  category: "non_cadre",
  monthlyGrossRef: 3800,
  hireDate: "2019-03-01",
  endDate: "2026-07-31",
  daysWorkedLastMonth: 26,
  workingDaysLastMonth: 26,
  accruedLeaveDays: 12,
  preavisDispensed: true,
  dependents: 0,
  ...over,
});

describe("bases de calcul", () => {
  it("ancienneté en années avec fraction", () => {
    const y = seniorityYearsFraction("2019-03-01", "2026-07-31");
    expect(y).toBeGreaterThan(7.4);
    expect(y).toBeLessThan(7.5);
  });
  it("ancienneté nulle si dates invalides ou négatives", () => {
    expect(seniorityYearsFraction("2026-07-31", "2019-03-01")).toBe(0);
    expect(seniorityYearsFraction("", "2026-01-01")).toBe(0);
  });
});

describe("barème de préavis (art. 43)", () => {
  it("non-cadre : 8 j / 1 mois / 2 mois", () => {
    expect(preavisBracket(0.5, p.stc.preavis.nonCadre).days).toBe(8);
    expect(preavisBracket(3, p.stc.preavis.nonCadre).months).toBe(1);
    expect(preavisBracket(7, p.stc.preavis.nonCadre).months).toBe(2);
  });
  it("cadre : 1 / 2 / 3 mois", () => {
    expect(preavisBracket(0.5, p.stc.preavis.cadre).months).toBe(1);
    expect(preavisBracket(3, p.stc.preavis.cadre).months).toBe(2);
    expect(preavisBracket(7, p.stc.preavis.cadre).months).toBe(3);
  });
});

describe("indemnité de licenciement — heures (art. 53)", () => {
  it("5 ans pile = 480 h", () => expect(licenciementHours(5, p)).toBe(480));
  it("7,42 ans = 96×5 + 144×2,42 = 828,48 h", () => {
    expect(licenciementHours(7.42, p)).toBeCloseTo(828.48, 2);
  });
  it("12 ans = 96×5 + 144×5 + 192×2 = 1584 h", () => {
    expect(licenciementHours(12, p)).toBe(96 * 5 + 144 * 5 + 192 * 2);
  });
  it("20 ans = 96×5+144×5+192×5+240×5 = 3360 h", () => {
    expect(licenciementHours(20, p)).toBe((96 + 144 + 192 + 240) * 5);
  });
});

describe("STC — licenciement non-cadre, ~7,42 ans, préavis dispensé", () => {
  const r = computeStc(base());
  it("taux horaire et journalier de référence", () => {
    expect(r.hourlyRate).toBeCloseTo(19.9, 2); // 3800/191
    expect(r.dailyRate).toBeCloseTo(146.15, 2); // 3800/26
  });
  it("salaire du mois plein = 3800", () => {
    expect(r.lines.find((l) => l.key === "salaire_mois")?.gross).toBe(3800);
  });
  it("indemnité de congés payés = 12 × 146,15 = 1753,80 (taux arrondi ligne par ligne)", () => {
    expect(r.lines.find((l) => l.key === "conges_payes")?.gross).toBeCloseTo(1753.8, 2);
  });
  it("préavis non-cadre > 5 ans = 2 mois = 7600", () => {
    expect(r.lines.find((l) => l.key === "preavis")?.gross).toBe(7600);
  });
  it("indemnité de licenciement présente et EXONÉRÉE", () => {
    const lic = r.lines.find((l) => l.key === "licenciement");
    expect(lic).toBeTruthy();
    expect(lic!.taxable).toBe(false);
    expect(lic!.gross).toBeGreaterThan(16000);
  });
  it("part exonérée = indemnité de licenciement", () => {
    const lic = r.lines.find((l) => l.key === "licenciement")!;
    expect(r.exonereTotal).toBeCloseTo(lic.gross, 2);
  });
  it("part imposable = salaire + prime + congés + préavis", () => {
    const taxable = r.lines.filter((l) => l.taxable).reduce((a, l) => a + l.gross, 0);
    expect(r.taxableTotal).toBeCloseTo(taxable, 2);
  });
  it("CNSS salariale plafonnée à 6000 × 4,48 %", () => {
    expect(r.cnssSalarie).toBeCloseTo(6000 * 0.0448, 2); // taxable > 6000
  });
  it("NET = brut − CNSS − AMO − IR − autres", () => {
    const expected =
      r.grossTotal - r.cnssSalarie - r.amoSalarie - r.ir - r.otherDeductions;
    expect(r.netAPayer).toBeCloseTo(expected, 2);
  });
});

describe("STC — faute grave : ni préavis ni indemnité de licenciement", () => {
  const r = computeStc(base({ reason: "faute_grave" }));
  it("pas de ligne préavis", () => {
    expect(r.lines.find((l) => l.key === "preavis")).toBeUndefined();
  });
  it("pas de ligne indemnité de licenciement", () => {
    expect(r.lines.find((l) => l.key === "licenciement")).toBeUndefined();
  });
  it("part exonérée nulle", () => expect(r.exonereTotal).toBe(0));
  it("ne garde que salaire + congés (+ prime éventuelle)", () => {
    expect(r.lines.find((l) => l.key === "salaire_mois")).toBeTruthy();
    expect(r.lines.find((l) => l.key === "conges_payes")).toBeTruthy();
  });
});

describe("STC — démission : pas d'indemnité de licenciement ni de préavis employeur", () => {
  const r = computeStc(base({ reason: "demission" }));
  it("pas d'indemnité de licenciement", () => {
    expect(r.lines.find((l) => l.key === "licenciement")).toBeUndefined();
  });
  it("pas de préavis à la charge de l'employeur", () => {
    expect(r.lines.find((l) => l.key === "preavis")).toBeUndefined();
  });
});

describe("STC — fin de CDD : indemnité 7 %", () => {
  const r = computeStc(base({ reason: "fin_cdd", cddTotalGross: 45600, preavisDispensed: false }));
  it("indemnité de fin de CDD = 7 % × 45600 = 3192", () => {
    expect(r.lines.find((l) => l.key === "fin_cdd")?.gross).toBeCloseTo(3192, 2);
  });
});

describe("STC — licenciement abusif : dommages art. 41 exonérés + plafond", () => {
  it("1,5 mois/an, exonérés", () => {
    const r = computeStc(base({ abusive: true }));
    const di = r.lines.find((l) => l.key === "dommages_interets");
    expect(di).toBeTruthy();
    expect(di!.taxable).toBe(false);
    expect(di!.gross).toBeCloseTo(1.5 * 7.416 * 3800, -2);
  });
  it("plafonné à 36 mois pour très longue ancienneté", () => {
    const r = computeStc(base({ abusive: true, hireDate: "1980-01-01", endDate: "2026-01-01" }));
    const di = r.lines.find((l) => l.key === "dommages_interets")!;
    expect(di.gross).toBeCloseTo(36 * 3800, 2);
  });
});

describe("STC — ancienneté < 6 mois : pas d'indemnité de licenciement", () => {
  const r = computeStc(base({ hireDate: "2026-05-01", endDate: "2026-07-31" }));
  it("aucune indemnité de licenciement", () => {
    expect(r.lines.find((l) => l.key === "licenciement")).toBeUndefined();
  });
  it("une note explique l'exclusion", () => {
    expect(r.notes.some((n) => n.includes("6 mois"))).toBe(true);
  });
});
