/**
 * Construction des écritures comptables d'UNE période à partir de ses bulletins réels — en tenant
 * compte du MODE DE PAIEMENT PAR SALARIÉ (certains en espèces → Caisse 5161, d'autres par banque →
 * Banque 5141) et des retenues d'avances (→ 3431). Fonctions PURES, partagées par le volet Écritures
 * (affichage/génération) et par l'actualisation des périodes déjà validées (store) — une seule source
 * de vérité pour la ventilation de trésorerie.
 */
import type { Employee, Firm, PayslipInput, PaymentMode } from "@/data/types";
import { round2, type PayrollResult } from "./payroll-engine";
import { DEFAULT_ACCOUNTS } from "./accounting-accounts";
import {
  buildPayrollEntry, buildSettlementEntries, sumResults,
  type JournalEntry, type JournalLine, type PayrollTotals, type SettlementSplit,
} from "./payroll-accounting";

/** Un bulletin réel de la période (saisie + résultat figé + salarié). */
export interface PeriodSlip {
  employee_id: string;
  input: PayslipInput;
  result: PayrollResult;
}

/** Mode de paiement effectif d'un salarié : le sien, sinon celui de la société, sinon `virement`. */
export function resolvePaymentMode(emp: Employee | undefined, firm: Firm): PaymentMode {
  return emp?.payment_mode ?? firm.payroll_payment_mode ?? "virement";
}

/**
 * Ventile le net de la période entre groupe ESPÈCES (caisse) et groupe BANQUE selon le mode de CHAQUE
 * salarié, en séparant net à payer et retenue d'avance (l'avance d'un salarié est bornée à son net).
 */
export function periodSplit(slips: PeriodSlip[], employees: Employee[], firm: Firm): SettlementSplit {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const split: SettlementSplit = { netCash: 0, advanceCash: 0, netBank: 0, advanceBank: 0 };
  for (const sl of slips) {
    const net = Math.max(0, sl.result.netAPayer);
    const adv = round2(Math.min(Math.max(0, sl.input.advances ?? 0), net));
    if (resolvePaymentMode(empById.get(sl.employee_id), firm) === "especes") {
      split.netCash = round2(split.netCash + net);
      split.advanceCash = round2(split.advanceCash + adv);
    } else {
      split.netBank = round2(split.netBank + net);
      split.advanceBank = round2(split.advanceBank + adv);
    }
  }
  return split;
}

/** Écritures OD (paie) + règlement(s) (trésorerie ventilée par salarié) d'une période. PURE. */
export function buildPeriodEntries(
  slips: PeriodSlip[],
  employees: Employee[],
  firm: Firm,
  year: number,
  month: number,
): { paie: JournalEntry; reglements: JournalEntry[]; totals: PayrollTotals; split: SettlementSplit } {
  const totals = sumResults(slips.map((s) => s.result));
  const split = periodSplit(slips, employees, firm);
  const opts = { tfpInCnss: false, paymentMode: firm.payroll_payment_mode, split } as const;
  return {
    totals,
    split,
    paie: buildPayrollEntry(totals, DEFAULT_ACCOUNTS, year, month, opts),
    reglements: buildSettlementEntries(totals, DEFAULT_ACCOUNTS, year, month, opts),
  };
}

const round2b = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Solde net (débit − crédit) par compte sur un jeu d'écritures. */
function netByAccount(entries: JournalEntry[]): Map<string, { label: string; net: number }> {
  const m = new Map<string, { label: string; net: number }>();
  for (const e of entries) {
    for (const l of e.lines) {
      const cur = m.get(l.account);
      if (cur) cur.net = round2b(cur.net + (l.debit - l.credit));
      else m.set(l.account, { label: l.label, net: round2b(l.debit - l.credit) });
    }
  }
  return m;
}

/**
 * OD de RECLASSEMENT (journal OD) transformant l'écriture FIGÉE (`oldEntries`) en l'écriture
 * CORRIGÉE (`newEntries`) — pour une période déjà DÉCLARÉE/RAPPROCHÉE, où l'on NE réécrit PAS
 * l'instantané mais où l'on passe une écriture de régularisation DATÉE (recommandation expert-
 * comptable). Les lignes sont les DELTAS par compte (nouveau − ancien) : la somme des deltas est
 * nulle (les deux jeux sont équilibrés) → l'OD est équilibrée. Renvoie `null` si aucun écart (rien
 * à reclasser). Les MONTANTS globaux (charges, dettes, résultat) restent inchangés : on ne fait que
 * déplacer des soldes entre comptes. PURE (la date est passée en paramètre).
 */
export function buildReclassementEntry(
  oldEntries: JournalEntry[],
  newEntries: JournalEntry[],
  date: string,
  reference: string,
): JournalEntry | null {
  const newNet = netByAccount(newEntries);
  const oldNet = netByAccount(oldEntries);
  const accounts = new Set<string>([...newNet.keys(), ...oldNet.keys()]);
  const lines: JournalLine[] = [];
  for (const account of accounts) {
    const label = newNet.get(account)?.label ?? oldNet.get(account)?.label ?? account;
    const delta = round2b((newNet.get(account)?.net ?? 0) - (oldNet.get(account)?.net ?? 0));
    if (Math.abs(delta) < 0.005) continue;
    lines.push(delta > 0
      ? { account, label: `Reclassement — ${label}`, debit: delta, credit: 0 }
      : { account, label: `Reclassement — ${label}`, debit: 0, credit: round2b(-delta) });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.account.localeCompare(b.account));
  const totalDebit = round2b(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2b(lines.reduce((s, l) => s + l.credit, 0));
  return {
    journal: "OD",
    date,
    reference,
    description: "OD de reclassement — comptes corrigés (TFP 61678, avances 3431, ventilation 5161/5141). Montants globaux inchangés.",
    lines,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}
