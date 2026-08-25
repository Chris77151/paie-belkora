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
  it("crédit 4441 = CNSS+AMO+AF 898,96 (TFP EXCLUE — isolée en 4457 par défaut)", () => {
    const l = entry.lines.find((x) => x.account === "4441");
    expect(l?.credit).toBe(898.96);
  });
  it("crédit 4457 = TFP 54,84 par défaut (compte d'État distinct, conforme au référentiel)", () => {
    expect(entry.lines.find((x) => x.account === "4457")?.credit).toBe(54.84);
  });
  it("ligne IR à 0 est éliminée", () => {
    expect(entry.lines.find((x) => x.account === "44525")).toBeUndefined();
  });
});

describe("Écriture de paie — TFP sur bordereau CNSS (option tfpInCnss=true)", () => {
  const totals = sumResults([computePayslip(aboubi)]);
  const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { tfpInCnss: true });

  it("reste équilibrée", () => {
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(5089.32);
  });
  it("crédit 4441 = 953,80 (TFP incluse) et aucune ligne 4457", () => {
    expect(entry.lines.find((x) => x.account === "4441")?.credit).toBe(953.8); // 898,96 + 54,84
    expect(entry.lines.find((x) => x.account === "4457")).toBeUndefined();
  });
});

describe("Invariants d'écriture (contrôle bloquant)", () => {
  const totals = sumResults([computePayslip(aboubi)]);

  it("les 3 invariants passent en mode par défaut (TFP isolée en 4457)", () => {
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7);
    const inv = checkPayrollEntryInvariants(entry, totals, DEFAULT_ACCOUNTS);
    expect(inv.ok).toBe(true);
    expect(inv.results.map((r) => r.code)).toEqual(["equilibre", "organismes", "remunerations"]);
    for (const r of inv.results) expect(Math.abs(r.delta)).toBeLessThan(0.01);
  });

  it("les 3 invariants passent aussi avec TFP en 4441 (option tfpInCnss=true)", () => {
    const entry = buildPayrollEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { tfpInCnss: true });
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

  it("virement/chèque = comportement identique (tout par banque 5141, pas de caisse)", () => {
    const vir = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { paymentMode: "virement" });
    const chq = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { paymentMode: "cheque" });
    for (const e of [vir, chq]) {
      expect(e.balanced).toBe(true);
      expect(e.lines.find((x) => x.account === "5141")?.credit).toBe(5089.32);
      expect(e.lines.some((x) => x.account === "5161")).toBe(false); // aucune caisse
    }
  });

  it("retenue d'avance : créditée en 3431, net décaissé (5141) diminué d'autant, écriture équilibrée", () => {
    const e = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { advances: 500 });
    expect(e.balanced).toBe(true);
    const av = e.lines.find((x) => x.account === "3431");
    const bank = e.lines.find((x) => x.account === "5141");
    expect(av?.credit).toBe(500);                 // avance créditée en 3431
    expect(bank?.credit).toBe(round2Local(5089.32 - 500)); // net décaissé diminué de l'avance
    // Le TOTAL décaissé (banque + 3431) reste égal au règlement sans avance.
    expect(round2Local((bank?.credit ?? 0) + (av?.credit ?? 0))).toBe(5089.32);
    // Sans avance : aucune ligne 3431.
    const e0 = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { advances: 0 });
    expect(e0.lines.some((x) => x.account === "3431")).toBe(false);
  });

  it("TFP : compte de charge 61678 (et non 61671 « droits d'enregistrement »)", () => {
    const paie = buildPayrollEntry(sumResults([computePayslip({ ...aboubi, panier: 0, transport: 0, salissure: 0, otherGross: 0 })]), DEFAULT_ACCOUNTS, 2026, 7);
    // Le compte de charge TFP est 61678 ; 61671 ne doit jamais porter la TFP.
    expect(DEFAULT_ACCOUNTS.tfp).toBe("61678");
    expect(paie.lines.some((l) => l.account === "61671")).toBe(false);
  });

  it("espèces : les salaires nets sont crédités en CAISSE (5161), les organismes/IR restent en banque (5141)", () => {
    const cash = buildSettlementEntry(totals, DEFAULT_ACCOUNTS, 2026, 7, { paymentMode: "especes" });
    expect(cash.balanced).toBe(true);
    const caisse = cash.lines.find((x) => x.account === "5161");
    const bank = cash.lines.find((x) => x.account === "5141");
    expect(caisse?.credit).toBe(totals.netAPayer); // net en espèces
    // banque = tout sauf le net (CNSS + AMO + AF + IR ; TFP isolée en 4457, hors banque ici)
    const organismes = round2Local(caisse!.credit + (bank?.credit ?? 0));
    expect(round2Local(organismes)).toBe(5089.32); // même total décaissé que par virement
    expect(round2Local((bank?.credit ?? 0))).toBe(round2Local(5089.32 - totals.netAPayer));
  });
});

const round2Local = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
