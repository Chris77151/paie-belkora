import { describe, it, expect } from "vitest";
import { computePayslip, type PayrollInput } from "./payroll-engine";
import { buildPayrollEntry, buildSettlementEntry, sumResults, checkPayrollEntryInvariants } from "./payroll-accounting";
import { DEFAULT_ACCOUNTS } from "./accounting-accounts";

const aboubi: PayrollInput = {
  year: 2026, month: 7, regime: "SMIG", hireDate: "2026-07-04", dependents: 0,
  hourlyRate: 17.92, daysWorked: 26, hoursNormal: 191,
  hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
  panier: 806, transport: 130, salissure: 3.3, otherGross: 4.5,
};

describe("Écriture de paie (journal OD)", () => {
  const totals = sumResults([computePayslip(aboubi)]);
  const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);

  it("est équilibrée (débit = crédit)", () => {
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(entry.totalCredit);
  });
  it("total = coût employeur 5 089,32", () => {
    expect(entry.totalDebit).toBe(5089.32);
  });
  it("débit 6171 = brut 4 366,52", () => {
    const l = entry.lines.find((x) => x.account === "6171");
    expect(l?.debit).toBe(4366.52);
  });
  it("crédit 4432 = net 4 135,52", () => {
    const l = entry.lines.find((x) => x.account === "4432");
    expect(l?.credit).toBe(4135.52);
  });
  it("crédit 4441 = CNSS+AMO+AF+TFP 953,80 (TFP incluse par défaut)", () => {
    const l = entry.lines.find((x) => x.account === "4441");
    expect(l?.credit).toBe(953.8); // 898,96 + 54,84
  });
  it("aucune ligne 4457 par défaut (TFP recouvrée par la CNSS)", () => {
    expect(entry.lines.find((x) => x.account === "4457")).toBeUndefined();
  });
  it("ligne IR à 0 est éliminée", () => {
    expect(entry.lines.find((x) => x.account === "44525")).toBeUndefined();
  });
});

describe("Écriture de paie — TFP isolée (option tfpInCnss=false)", () => {
  const totals = sumResults([computePayslip(aboubi)]);
  const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { tfpInCnss: false });

  it("reste équilibrée", () => {
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(5089.32);
  });
  it("crédit 4441 = 898,96 (hors TFP) et 4457 = 54,84", () => {
    expect(entry.lines.find((x) => x.account === "4441")?.credit).toBe(898.96);
    expect(entry.lines.find((x) => x.account === "4457")?.credit).toBe(54.84);
  });
});

describe("Invariants d'écriture (contrôle bloquant)", () => {
  const totals = sumResults([computePayslip(aboubi)]);

  it("les 3 invariants passent en mode par défaut (TFP en 4441)", () => {
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
    const inv = checkPayrollEntryInvariants(entry, totals, DEFAULT_ACCOUNTS);
    expect(inv.ok).toBe(true);
    expect(inv.results.map((r) => r.code)).toEqual(["equilibre", "organismes", "remunerations"]);
    for (const r of inv.results) expect(Math.abs(r.delta)).toBeLessThan(0.01);
  });

  it("les 3 invariants passent aussi en TFP isolée (4441+4457)", () => {
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { tfpInCnss: false });
    expect(checkPayrollEntryInvariants(entry, totals, DEFAULT_ACCOUNTS).ok).toBe(true);
  });

  it("détecte un écart si l'écriture diverge des bulletins (organismes falsifiés)", () => {
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
    const tampered = { ...totals, cnssPatronal: round(totals.cnssPatronal + 100) };
    const inv = checkPayrollEntryInvariants(entry, tampered, DEFAULT_ACCOUNTS);
    expect(inv.ok).toBe(false);
    expect(inv.results.find((r) => r.code === "organismes")?.ok).toBe(false);
  });
});

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe("Alignement BDS — salarié exonéré CNSS", () => {
  const droitCommun = computePayslip({ ...aboubi, hourlyRate: 30 });
  const stagiaire = computePayslip({ ...aboubi, hourlyRate: 30, cnssExemption: "totale" });

  it("un stagiaire (exonération totale) ne contribue pas au 4441", () => {
    const totals = sumResults([stagiaire]);
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
    // Aucune cotisation sociale -> pas de ligne 4441.
    expect(entry.lines.find((x) => x.account === "4441")).toBeUndefined();
    expect(entry.balanced).toBe(true);
    expect(checkPayrollEntryInvariants(entry, totals, DEFAULT_ACCOUNTS).ok).toBe(true);
  });

  it("l'assiette 4441 exclut le stagiaire dans un groupe mixte (droit commun + stage)", () => {
    const soloEntry = buildPayrollEntry(sumResults([droitCommun]), DEFAULT_ACCOUNTS, 2026, 7);
    const mixEntry = buildPayrollEntry(sumResults([droitCommun, stagiaire]), DEFAULT_ACCOUNTS, 2026, 7);
    const c4441 = (e: typeof soloEntry) => e.lines.find((x) => x.account === "4441")?.credit ?? 0;
    // Le 4441 du groupe mixte = celui du seul salarié de droit commun (le stagiaire ajoute 0).
    expect(c4441(mixEntry)).toBe(c4441(soloEntry));
  });
});

describe("Écriture de règlement (journal BQ)", () => {
  const totals = sumResults([computePayslip(aboubi)]);
  const entry = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
  it("est équilibrée et solde la banque (net + CNSS + IR)", () => {
    expect(entry.balanced).toBe(true);
    const bank = entry.lines.find((x) => x.account === "5141");
    expect(bank?.credit).toBe(5089.32); // net + CNSS total + IR(0)
  });
});

describe("Agrégation multi-salariés", () => {
  it("somme correctement 3 bulletins et reste équilibrée", () => {
    const rs = [computePayslip(aboubi), computePayslip(aboubi), computePayslip(aboubi)];
    const totals = sumResults(rs);
    expect(totals.headcount).toBe(3);
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(5089.32 * 3);
  });
});
