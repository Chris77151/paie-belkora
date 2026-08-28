/**
 * État de RÈGLEMENT des salaires d'une période — moteur PUR, testé.
 *
 * Liste les salariés DÉCLARÉS de la période (ceux ayant un bulletin figé, `Payslip.result != null`)
 * avec, pour chacun, son MODE DE RÈGLEMENT (virement / chèque / espèces) et le montant réellement
 * décaissé (net à payer − retenue d'avance). Fournit aussi le SOLDE PAR MODE de règlement (total et
 * effectif par virement, chèque, espèces) et le compte de trésorerie associé (banque 5141 /
 * caisse 5161). AUCUN recalcul des montants : ils proviennent des bulletins validés.
 *
 * Le mode retenu par salarié suit `resolvePaymentMode` : le sien (`Employee.payment_mode`), sinon
 * celui de la société (`Firm.payroll_payment_mode`), sinon `virement`.
 */
import type { AppState, Firm, PaymentMode } from "@/data/types";
import { round2 } from "./payroll-engine";
import { resolvePaymentMode } from "./payroll-period-accounting";
import { paymentModeLabel } from "./payroll-accounting";

/** Ordre d'affichage des modes de règlement. */
export const PAYMENT_MODES: PaymentMode[] = ["virement", "cheque", "especes"];

/** Compte de trésorerie d'un mode : espèces → Caisse 5161 ; virement/chèque → Banque 5141. */
export function settlementAccount(mode: PaymentMode): string {
  return mode === "especes" ? "5161" : "5141";
}

/** Une ligne de l'état de règlement (un salarié déclaré de la période). */
export interface SettlementRow {
  order: number;
  matricule: string;
  name: string;
  cnss?: string;
  /** RIB (utile pour un règlement par virement). */
  bankRib?: string;
  /** Net à payer du bulletin (avant retenue d'avance). */
  net: number;
  /** Retenue d'avance / acompte du mois (bornée au net). */
  advances: number;
  /** Montant réellement à régler = net − avances. */
  netToPay: number;
  mode: PaymentMode;
  modeLabel: string;
  /** Compte de trésorerie (5141 banque / 5161 caisse). */
  account: string;
}

/** Total et effectif pour un mode de règlement. */
export interface SettlementModeTotal {
  mode: PaymentMode;
  label: string;
  account: string;
  count: number;
  net: number;
  advances: number;
  netToPay: number;
}

export interface SettlementReport {
  firm: Firm;
  year: number;
  month: number;
  rows: SettlementRow[];
  /** Solde par mode de règlement (uniquement les modes réellement utilisés). */
  byMode: SettlementModeTotal[];
  total: { count: number; net: number; advances: number; netToPay: number };
}

/** Clé de tri d'une ligne : matricule numérique si possible, sinon nom. */
function sortKey(matricule: string, name: string): string {
  const m = matricule.trim();
  return m ? m.padStart(12, "0") : name.toLowerCase();
}

/**
 * Construit l'état de règlement d'une société pour une période (année + mois). PURE : lit l'état,
 * n'écrit rien. Liste les salariés ayant un bulletin figé, ventilés par mode de règlement.
 */
export function buildSettlementReport(s: AppState, firm: Firm, year: number, month: number): SettlementReport {
  const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
  const empById = new Map(s.employees.filter((e) => e.firm_id === firm.id).map((e) => [e.id, e]));

  const slips = period
    ? (s.payslips ?? [])
        .filter((sl) => sl.period_id === period.id && sl.result != null)
        .map((sl) => ({ sl, e: empById.get(sl.employee_id) }))
        .sort((a, b) =>
          sortKey(a.e?.matricule ?? "", a.e ? `${a.e.first_name} ${a.e.last_name}` : "").localeCompare(
            sortKey(b.e?.matricule ?? "", b.e ? `${b.e.first_name} ${b.e.last_name}` : ""),
          ),
        )
    : [];

  const rows: SettlementRow[] = [];
  let order = 0;
  for (const { sl, e } of slips) {
    const r = sl.result!;
    const net = round2(Math.max(0, r.netAPayer));
    const advances = round2(Math.min(Math.max(0, sl.input.advances ?? 0), net));
    const netToPay = round2(net - advances);
    const mode = resolvePaymentMode(e, firm);
    order += 1;
    rows.push({
      order,
      matricule: e?.matricule ?? "",
      name: e ? `${e.first_name} ${e.last_name}` : "(salarié supprimé)",
      cnss: e?.cnss_number,
      bankRib: e?.bank_rib,
      net,
      advances,
      netToPay,
      mode,
      modeLabel: paymentModeLabel(mode),
      account: settlementAccount(mode),
    });
  }

  const byMode: SettlementModeTotal[] = PAYMENT_MODES.map((mode) => {
    const rs = rows.filter((r) => r.mode === mode);
    return {
      mode,
      label: paymentModeLabel(mode),
      account: settlementAccount(mode),
      count: rs.length,
      net: round2(rs.reduce((a, r) => a + r.net, 0)),
      advances: round2(rs.reduce((a, r) => a + r.advances, 0)),
      netToPay: round2(rs.reduce((a, r) => a + r.netToPay, 0)),
    };
  }).filter((m) => m.count > 0);

  const total = {
    count: rows.length,
    net: round2(rows.reduce((a, r) => a + r.net, 0)),
    advances: round2(rows.reduce((a, r) => a + r.advances, 0)),
    netToPay: round2(rows.reduce((a, r) => a + r.netToPay, 0)),
  };

  return { firm, year, month, rows, byMode, total };
}
