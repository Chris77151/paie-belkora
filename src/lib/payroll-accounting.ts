/**
 * Moteur d'écritures comptables de paie — PCGE marocain. Fonctions PURES, testées.
 * Produit l'écriture de paie (journal OD) et l'écriture de règlement, toujours équilibrées.
 */
import { round2, type PayrollResult } from "./payroll-engine";
import type { PayrollAccounts } from "./accounting-accounts";
import { ACCOUNT_LABELS } from "./accounting-accounts";
import type { PaymentMode } from "@/data/types";

/** Libellé lisible d'un mode de règlement des salaires. */
export function paymentModeLabel(mode: PaymentMode): string {
  return mode === "especes" ? "espèces" : mode === "cheque" ? "chèque" : "virement";
}

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

/** Dernier jour du mois au format ISO « aaaa-mm-jj », SANS décalage de fuseau (jamais via
 *  toISOString, qui reculerait d'un jour en UTC+ et daterait l'écriture au 30 au lieu du 31). */
function endOfMonthIso(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate(); // month 1-12 → dernier jour du mois
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

const D = (account: string, label: string, debit: number): JournalLine => ({ account, label, debit: round2(debit), credit: 0 });
const C = (account: string, label: string, credit: number): JournalLine => ({ account, label, debit: 0, credit: round2(credit) });

/** Options de génération des écritures de paie. */
export interface PayrollEntryOptions {
  /**
   * Où créditer la TFP. DÉFAUT `false` : la TFP (TAXE, pas une cotisation) est isolée dans le
   * compte d'État **4457**, conforme au référentiel (`accounting-accounts.ts` : « au crédit 4457,
   * pas 4441 »). `true` la crédite sur le bordereau CNSS (compte 4441), fidèle au recouvrement réel
   * par la CNSS pour l'OFPPT — à activer explicitement si l'on préfère cette présentation. Le compte
   * de CHARGE 61671 est présent dans les deux cas.
   */
  tfpInCnss?: boolean;
  /**
   * Mode de règlement des salaires nets, qui pilote le compte de TRÉSORERIE de l'écriture de
   * règlement : `virement`/`cheque` → Banque (5141) ; `especes` → Caisse (5161). Les organismes
   * (CNSS, IR, TFP) restent toujours réglés par banque. DÉFAUT `virement` (comportement historique :
   * tout le règlement passe par 5141). N'a aucun effet sur l'écriture de paie (OD).
   */
  paymentMode?: PaymentMode;
  /**
   * Total des RETENUES d'avances/acomptes sur salaire de la période (DH). Au RÈGLEMENT, ce montant
   * est crédité en **3431** « Personnel — avances et acomptes » (extinction de la créance) et le net
   * réellement décaissé (trésorerie) est diminué d'autant. DÉFAUT 0 (aucune retenue → écriture
   * inchangée). N'affecte pas l'écriture de paie OD (le net 4432 y reste le net à payer).
   */
  advances?: number;
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
  const tfpInCnss = opts.tfpInCnss ?? false;
  const date = endOfMonthIso(year, month); // fin de mois (sans décalage de fuseau)
  const ref = `PAIE-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  // 4441 = CNSS + AMO + AF (sal. + patr.). Par défaut la TFP en est EXCLUE (isolée en 4457, État) ;
  // elle n'y est ajoutée que si tfpInCnss = true (présentation « recouvrement CNSS/OFPPT »).
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
      D(accounts.tfp, L.tfp, totals.tfp), // charge 61678 (toujours)
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
  const tfpInCnss = opts.tfpInCnss ?? false;
  const mode = opts.paymentMode ?? "virement";
  const date = endOfMonthIso(year, month);
  const ref = `REGL-${year}-${String(month).padStart(2, "0")}`;
  const L = ACCOUNT_LABELS;
  const modeLabel = paymentModeLabel(mode);
  const organismesBase = totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af;
  const cnssTotal = round2(organismesBase + (tfpInCnss ? totals.tfp : 0));
  const tfpEtat = round2(tfpInCnss ? 0 : totals.tfp);
  // Organismes + État (CNSS/TFP/IR) : toujours réglés par BANQUE (télépaiement DAMANCOM / DGI).
  const organismes = round2(cnssTotal + tfpEtat + totals.ir);
  const net = totals.netAPayer;
  // Retenue d'avance/acompte : bornée au net, créditée en 3431 (extinction de la créance). Le net
  // réellement DÉCAISSÉ en trésorerie est diminué d'autant.
  const advances = round2(Math.min(Math.max(0, opts.advances ?? 0), net));
  const netDisbursed = round2(net - advances);
  const advanceLine: JournalLine[] = advances > 0
    ? [C(accounts.avancesPersonnel, `${L.avancesPersonnel} (retenue sur salaire)`, advances)]
    : [];
  // Salaires nets décaissés : trésorerie pilotée par le MODE de paiement (5141 banque, 5161 caisse).
  const especes = mode === "especes";
  // En espèces, deux lignes de trésorerie (5161 salaires + 5141 organismes) ; sinon tout par banque.
  const credits: JournalLine[] = especes
    ? [
        C(accounts.caisse, `${L.caisse} (salaires ${modeLabel})`, netDisbursed),
        C(accounts.banque, `${L.banque} (CNSS + IR)`, organismes),
      ]
    : [C(accounts.banque, L.banque, round2(netDisbursed + organismes))];
  return finalize({
    journal: "BQ",
    date,
    reference: ref,
    description: `Règlement paie ${year}-${String(month).padStart(2, "0")} — salaires par ${modeLabel}`,
    lines: [
      D(accounts.remunerationsDues, `${L.remunerationsDues} (salaires ${modeLabel})`, net),
      D(accounts.cnssOrganisme, `${L.cnssOrganisme} (bordereau CNSS${tfpInCnss ? " + TFP" : ""})`, cnssTotal),
      D(accounts.etatTfp, `${L.etatTfp} (OFPPT)`, tfpEtat),
      D(accounts.etatIr, `${L.etatIr} (versement IR)`, totals.ir),
      ...advanceLine,
      ...credits,
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
