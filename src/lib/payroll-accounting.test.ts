import { describe, it, expect } from "vitest";
import { computePayslip, type PayrollInput } from "./payroll-engine";
import { buildPayrollEntry, buildSettlementEntries, sumResults, checkPayrollEntryInvariants } from "./payroll-accounting";
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
  it("crédit 4441 DÉCOMPOSÉ (lignes CNSS / AMO / AF), total 898,96 (TFP EXCLUE — isolée en 4457)", () => {
    const lines4441 = entry.lines.filter((x) => x.account === "4441");
    expect(lines4441.length).toBeGreaterThanOrEqual(2); // au moins CNSS + AMO en lignes séparées
    expect(lines4441.some((l) => /CNSS/.test(l.label))).toBe(true);
    expect(lines4441.some((l) => /AMO/.test(l.label))).toBe(true);
    const total = round2Local(lines4441.reduce((s, l) => s + l.credit, 0));
    expect(total).toBe(898.96); // somme des lignes 4441
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
  it("crédit 4441 (lignes CNSS/AMO/AF/TFP) total 953,80 (TFP incluse) et aucune ligne 4457", () => {
    const total = round2Local(entry.lines.filter((x) => x.account === "4441").reduce((s, l) => s + l.credit, 0));
    expect(total).toBe(953.8); // 898,96 + 54,84 (TFP)
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

describe("Écriture(s) de règlement", () => {
  const totals = sumResults([computePayslip(aboubi)]);

  it("sans split : UN article Banque équilibré qui solde 5141 (net + CNSS + IR)", () => {
    const entries = buildSettlementEntries(totals, DEFAULT_ACCOUNTS, 2026, 7);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.balanced).toBe(true);
    expect(entry.journal).toBe("BQ");
    expect(entry.lines.find((x) => x.account === "5141")?.credit).toBe(5089.32);
    expect(entry.lines.some((x) => x.account === "5161")).toBe(false); // aucune caisse
  });

  it("retenue d'avance : créditée en 3431, net décaissé (5141) diminué d'autant, article équilibré", () => {
    const [e] = buildSettlementEntries(totals, DEFAULT_ACCOUNTS, 2026, 7, { advances: 500 });
    expect(e.balanced).toBe(true);
    const av = e.lines.find((x) => x.account === "3431");
    const bank = e.lines.find((x) => x.account === "5141");
    expect(av?.credit).toBe(500);
    expect(bank?.credit).toBe(round2Local(5089.32 - 500));
    expect(round2Local((bank?.credit ?? 0) + (av?.credit ?? 0))).toBe(5089.32);
    // Sans avance : aucune ligne 3431.
    const [e0] = buildSettlementEntries(totals, DEFAULT_ACCOUNTS, 2026, 7, { advances: 0 });
    expect(e0.lines.some((x) => x.account === "3431")).toBe(false);
  });

  it("TFP : compte de charge 61678 (et non 61671 « droits d'enregistrement »)", () => {
    const paie = buildPayrollEntry(sumResults([computePayslip({ ...aboubi, panier: 0, transport: 0, salissure: 0, otherGross: 0 })]), DEFAULT_ACCOUNTS, 2026, 7);
    expect(DEFAULT_ACCOUNTS.tfp).toBe("61678");
    expect(paie.lines.some((l) => l.account === "61671")).toBe(false);
  });

  it("paiement MIXTE : DEUX articles (Caisse 5161 pour le net espèces + Banque 5141 pour net banque + organismes)", () => {
    const net = totals.netAPayer;
    const netCash = round2Local(net * 0.4); // 40 % des salariés payés en espèces (ex.)
    const netBank = round2Local(net - netCash);
    const entries = buildSettlementEntries(totals, DEFAULT_ACCOUNTS, 2026, 7, {
      split: { netCash, advanceCash: 0, netBank, advanceBank: 0 },
    });
    expect(entries).toHaveLength(2);
    const caisseArticle = entries.find((e) => e.journal === "CA")!;
    const banqueArticle = entries.find((e) => e.journal === "BQ")!;
    expect(caisseArticle.balanced).toBe(true);
    expect(banqueArticle.balanced).toBe(true);
    // Caisse : crédit 5161 = net espèces ; Banque : crédit 5141 = net banque + organismes.
    expect(caisseArticle.lines.find((x) => x.account === "5161")?.credit).toBe(netCash);
    expect(banqueArticle.lines.some((x) => x.account === "5161")).toBe(false); // pas de caisse dans l'article banque
    const bank = banqueArticle.lines.find((x) => x.account === "5141")!;
    // total décaissé banque + caisse = même total que le règlement 100 % banque (5089.32).
    expect(round2Local(bank.credit + netCash)).toBe(5089.32);
    expect(bank.credit).toBe(round2Local(5089.32 - netCash));
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
