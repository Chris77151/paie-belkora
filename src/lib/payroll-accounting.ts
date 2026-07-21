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

/** Écriture de paie (journal OD) — constatation de la charge et des dettes. */
export function buildPayrollEntry(
  totals: PayrollTotals,
  accounts: PayrollAccounts,
  year: number,
  month: number,
): JournalEntry {
  const date = new Date(year, month, 0).toISOString().slice(0, 10); // fin de mois
  const ref = `PAIE-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  // 4441 CNSS = CNSS + AMO + AF (sal. + patr.) — la TFP est une TAXE, elle va en 4457.
  const cnssTotal = round2(
    totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af,
  );
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
      D(accounts.tfp, L.tfp, totals.tfp),
      C(accounts.remunerationsDues, L.remunerationsDues, totals.netAPayer),
      C(accounts.cnssOrganisme, L.cnssOrganisme, cnssTotal),
      C(accounts.etatTfp, L.etatTfp, totals.tfp),
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
): JournalEntry {
  const date = new Date(year, month, 0).toISOString().slice(0, 10);
  const ref = `REGL-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  const cnssTotal = round2(
    totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af,
  );
  // CNSS (→CNSS), TFP (→CNSS/OFPPT) et IR (→DGI) sont des versements distincts.
  const total = round2(totals.netAPayer + cnssTotal + totals.tfp + totals.ir);
  return finalize({
    journal: "BQ",
    date,
    reference: ref,
    description: `Règlement paie ${year}-${String(month).padStart(2, "0")}`,
    lines: [
      D(accounts.remunerationsDues, `${L.remunerationsDues} (virement salaires)`, totals.netAPayer),
      D(accounts.cnssOrganisme, `${L.cnssOrganisme} (bordereau CNSS)`, cnssTotal),
      D(accounts.etatTfp, `${L.etatTfp} (OFPPT)`, totals.tfp),
      D(accounts.etatIr, `${L.etatIr} (versement IR)`, totals.ir),
      C(accounts.banque, L.banque, total),
    ],
  });
}
