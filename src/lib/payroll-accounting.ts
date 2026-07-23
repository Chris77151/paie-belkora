/**
 * Moteur d'écritures comptables de paie — PCGE marocain. Fonctions PURES, testées.
 * Produit l'écriture de paie (journal OD) et l'écriture de règlement, toujours équilibrées.
 */
import { round2, type PayrollResult } from "./payroll-engine";
import type { PayrollAccounts } from "./accounting-accounts";
import { ACCOUNT_LABELS } from "./accounting-accounts";

export interface JournalLine {
  account: string;
  label: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  journal: string; // ex. "OD" (opérations diverses) / "BQ" (banque)
  date: string; // ISO
  reference: string; // ex. "PAIE-2026-07"
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/** Agrégats d'une période à partir des bulletins calculés. */
export interface PayrollTotals {
  salaireBrut: number;
  cnssSalarie: number;
  amoSalarie: number;
  ir: number;
  netAPayer: number;
  cnssPatronal: number;
  amoPatronal: number;
  af: number;
  tfp: number;
  headcount: number;
}

export function sumResults(results: PayrollResult[]): PayrollTotals {
  const t: PayrollTotals = {
    salaireBrut: 0, cnssSalarie: 0, amoSalarie: 0, ir: 0, netAPayer: 0,
    cnssPatronal: 0, amoPatronal: 0, af: 0, tfp: 0, headcount: results.length,
  };
  for (const r of results) {
    t.salaireBrut = round2(t.salaireBrut + r.salaireBrut);
    t.cnssSalarie = round2(t.cnssSalarie + r.cnssSalarie);
    t.amoSalarie = round2(t.amoSalarie + r.amoSalarie);
    t.ir = round2(t.ir + r.ir);
    t.netAPayer = round2(t.netAPayer + r.netAPayer);
    t.cnssPatronal = round2(t.cnssPatronal + r.cnssPatronal);
    t.amoPatronal = round2(t.amoPatronal + r.amoPatronal);
    t.af = round2(t.af + r.af);
    t.tfp = round2(t.tfp + r.tfp);
  }
  return t;
}

function finalize(entry: Omit<JournalEntry, "totalDebit" | "totalCredit" | "balanced">): JournalEntry {
  const lines = entry.lines.filter((l) => l.debit !== 0 || l.credit !== 0);
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { ...entry, lines, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

const D = (account: string, label: string, debit: number): JournalLine => ({ account, label, debit: round2(debit), credit: 0 });
const C = (account: string, label: string, credit: number): JournalLine => ({ account, label, debit: 0, credit: round2(credit) });

/** Options de génération des écritures de paie. */
export interface PayrollEntryOptions {
  /**
   * TFP créditée sur le bordereau CNSS (compte 4441) — DÉFAUT `true`, fidèle au recouvrement réel
   * par la CNSS pour le compte de l'OFPPT. Si `false`, la TFP est isolée en 4457 (État – taxes).
   * Le compte de CHARGE 61671 est présent dans les deux cas.
   */
  tfpInCnss?: boolean;
}

/**
 * Écriture de paie (journal OD) — constatation de la charge et des dettes.
 * N'AGRÈGE que les montants réels des bulletins (via `totals`) : ne recalcule jamais un taux.
 */
export function buildPayrollEntry(
  totals: PayrollTotals,
  accounts: PayrollAccounts,
  year: number,
  month: number,
  opts: PayrollEntryOptions = {},
): JournalEntry {
  const tfpInCnss = opts.tfpInCnss ?? true;
  const date = new Date(year, month, 0).toISOString().slice(0, 10); // fin de mois
  const ref = `PAIE-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  // 4441 = CNSS + AMO + AF (sal. + patr.) ; + TFP par défaut (recouvrement CNSS/OFPPT).
  const organismesBase = totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af;
  const cnssTotal = round2(organismesBase + (tfpInCnss ? totals.tfp : 0));
  return finalize({
    journal: "OD",
    date,
    reference: ref,
    description: `Paie ${ref} — ${totals.headcount} salarié(s)`,
    lines: [
      D(accounts.remunerations, L.remunerations, totals.salaireBrut),
      D(accounts.cnssPatronal, L.cnssPatronal, totals.cnssPatronal),
      D(accounts.amoPatronal, L.amoPatronal, totals.amoPatronal),
      D(accounts.allocationsFamiliales, L.allocationsFamiliales, totals.af),
      D(accounts.tfp, L.tfp, totals.tfp), // charge 61671 (toujours)
      C(accounts.remunerationsDues, L.remunerationsDues, totals.netAPayer),
      C(accounts.cnssOrganisme, L.cnssOrganisme, cnssTotal),
      C(accounts.etatTfp, L.etatTfp, tfpInCnss ? 0 : totals.tfp), // 4457 seulement si TFP isolée (ligne à 0 éliminée)
      C(accounts.etatIr, L.etatIr, totals.ir),
    ],
  });
}

/** Écriture de règlement (journal banque) — décaissements. */
export function buildSettlementEntry(
  totals: PayrollTotals,
  accounts: PayrollAccounts,
  year: number,
  month: number,
  opts: PayrollEntryOptions = {},
): JournalEntry {
  const tfpInCnss = opts.tfpInCnss ?? true;
  const date = new Date(year, month, 0).toISOString().slice(0, 10);
  const ref = `REGL-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  const organismesBase = totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af;
  const cnssTotal = round2(organismesBase + (tfpInCnss ? totals.tfp : 0));
  // CNSS (→CNSS, TFP incluse par défaut) et IR (→DGI) sont des versements distincts.
  const total = round2(totals.netAPayer + cnssTotal + (tfpInCnss ? 0 : totals.tfp) + totals.ir);
  return finalize({
    journal: "BQ",
    date,
    reference: ref,
    description: `Règlement paie ${year}-${String(month).padStart(2, "0")}`,
    lines: [
      D(accounts.remunerationsDues, `${L.remunerationsDues} (virement salaires)`, totals.netAPayer),
      D(accounts.cnssOrganisme, `${L.cnssOrganisme} (bordereau CNSS${tfpInCnss ? " + TFP" : ""})`, cnssTotal),
      D(accounts.etatTfp, `${L.etatTfp} (OFPPT)`, tfpInCnss ? 0 : totals.tfp),
      D(accounts.etatIr, `${L.etatIr} (versement IR)`, totals.ir),
      C(accounts.banque, L.banque, total),
    ],
  });
}

/* ------------------------------------------------------------------ invariants (contrôle bloquant) ------------------------------------------------------------------ */

export interface InvariantResult {
  code: string;
  label: string;
  ok: boolean;
  /** Montant attendu (dérivé des bulletins). */
  expected: number;
  /** Montant obtenu dans l'écriture. */
  actual: number;
  /** actual − expected (0 attendu). */
  delta: number;
}
export interface InvariantCheck {
  ok: boolean;
  results: InvariantResult[];
}

const creditOf = (e: JournalEntry, account: string) =>
  e.lines.filter((l) => l.account === account).reduce((s, l) => s + l.credit, 0);
const debitOf = (e: JournalEntry, account: string) =>
  e.lines.filter((l) => l.account === account).reduce((s, l) => s + l.debit, 0);

/**
 * Contrôle d'invariants de l'écriture de paie, exécuté À CHAQUE génération (bloquant) :
 *  (a) équilibre débit = crédit ;
 *  (b) organismes sociaux (4441 + 4457) = Σ cotisations des bulletins (CNSS+AMO+AF+TFP, parts sal.+patr.) ;
 *  (c) rémunérations 6171 = 4432 (net) + retenues salariales (CNSS+AMO) + IR.
 * Tolérance : 0,01 DH (le centime). PURE, sans effet de bord.
 */
export function checkPayrollEntryInvariants(
  entry: JournalEntry,
  totals: PayrollTotals,
  accounts: PayrollAccounts,
): InvariantCheck {
  const results: InvariantResult[] = [];
  const push = (code: string, label: string, expected: number, actual: number) => {
    const e = round2(expected);
    const a = round2(actual);
    results.push({ code, label, expected: e, actual: a, delta: round2(a - e), ok: Math.abs(a - e) < 0.01 });
  };

  push("equilibre", "Équilibre débit = crédit", entry.totalDebit, entry.totalCredit);

  const organismes = creditOf(entry, accounts.cnssOrganisme) + creditOf(entry, accounts.etatTfp);
  const cotisations =
    totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af + totals.tfp;
  push("organismes", "Organismes sociaux (4441+4457) = Σ cotisations bulletins", cotisations, organismes);

  const brut = debitOf(entry, accounts.remunerations);
  const attendu = creditOf(entry, accounts.remunerationsDues) + totals.cnssSalarie + totals.amoSalarie + totals.ir;
  push("remunerations", "6171 = 4432 (net) + retenues salariales + IR", attendu, brut);

  return { ok: results.every((r) => r.ok), results };
}
