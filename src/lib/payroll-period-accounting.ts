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
  type JournalEntry, type PayrollTotals, type SettlementSplit,
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
