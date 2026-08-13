/**
 * Livre de paie légal (art. 371 du Code du Travail) — moteur PUR, testé.
 *
 * Agrège les bulletins RÉELLEMENT figés d'une société (Payslip.result != null) au format du
 * registre officiel : une ligne par bulletin, triée par période puis par salarié. AUCUN recalcul —
 * les montants proviennent des bulletins validés (mêmes chiffres que la paie, les écritures et la
 * BDS). Les heures et jours viennent de `Payslip.input` ; les montants de `Payslip.result`.
 *
 * Le livre de paie doit être tenu par établissement, conforme au modèle réglementaire, et conservé
 * au moins deux ans (art. 371-373). Ce volet le PRODUIT à partir des données de paie ; il ne
 * dispense pas de la conservation légale.
 */
import type { AppState, Employee, Firm } from "@/data/types";
import { round2 } from "./payroll-engine";

/** Une ligne du livre de paie (un bulletin d'un salarié pour une période). */
export interface PayrollBookRow {
  /** N° d'ordre continu dans le périmètre affiché. */
  order: number;
  /** Référence du bulletin : matricule si présent, sinon identifiant salarié. */
  bulletin: string;
  matricule: string;
  /** Période « mm/aaaa ». */
  period: string;
  year: number;
  month: number;
  name: string;
  emploi: string;
  birthDate?: string;
  hireDate: string;
  cnss?: string;
  maritalStatus?: string;
  /** Personnes à charge (colonne « Déduction » — charges de famille). */
  dependents: number;
  /* --- période payée (heures et jours) --- */
  hoursNormal: number;
  hoursOt25: number;
  hoursOt50: number;
  hoursOt100: number;
  daysWorked: number;
  totalHours: number;
  /* --- rémunération --- */
  salaireBase: number;
  primeAnciennete: number;
  seniorityRate: number;
  /** « À ajouter » : primes et indemnités = brut − base − ancienneté. */
  primesIndemnites: number;
  salaireBrut: number;
  sbi: number;
  /* --- retenues salariales --- */
  cnssSalarie: number;
  amoSalarie: number;
  ir: number;
  totalRetenues: number;
  /** Salaire net à payer = brut − total des retenues (avant avances). */
  netAPayer: number;
  /** Avances / acomptes déjà versés (colonne « AVANCES » du registre officiel). */
  avances: number;
  /** Net à payer final = salaire net − avances (dernière colonne du registre). */
  netFinal: number;
}

export interface PayrollBookTotals {
  count: number;
  daysWorked: number;
  totalHours: number;
  salaireBase: number;
  primeAnciennete: number;
  primesIndemnites: number;
  salaireBrut: number;
  sbi: number;
  cnssSalarie: number;
  amoSalarie: number;
  ir: number;
  totalRetenues: number;
  netAPayer: number;
  avances: number;
  netFinal: number;
}

export interface PayrollBook {
  firm: Firm;
  year: number;
  /** Mois filtré, ou null pour toute l'année. */
  month: number | null;
  rows: PayrollBookRow[];
  totals: PayrollBookTotals;
}

const two = (n: number) => String(n).padStart(2, "0");

/** Clé de tri d'un salarié : matricule numérique si possible, sinon nom. */
function sortKey(e: Employee | undefined): string {
  if (!e) return "￿";
  const m = (e.matricule ?? "").trim();
  if (m) return m.padStart(12, "0");
  return `${e.last_name} ${e.first_name}`.toLowerCase();
}

/**
 * Construit le livre de paie d'une société pour une année (et un mois optionnel).
 * `month = null` → toute l'année (le « livre » continu). PURE : lit l'état, n'écrit rien.
 */
export function buildPayrollBook(
  s: AppState,
  firm: Firm,
  year: number,
  month: number | null = null,
): PayrollBook {
  const periods = s.periods
    .filter((p) => p.firm_id === firm.id && p.year === year && (month == null || p.month === month))
    .sort((a, b) => a.month - b.month);

  const empById = new Map(s.employees.filter((e) => e.firm_id === firm.id).map((e) => [e.id, e]));

  const rows: PayrollBookRow[] = [];
  let order = 0;

  for (const per of periods) {
    const slips = (s.payslips ?? [])
      .filter((sl) => sl.period_id === per.id && sl.result != null)
      .map((sl) => ({ sl, e: empById.get(sl.employee_id) }))
      .sort((a, b) => sortKey(a.e).localeCompare(sortKey(b.e)));

    for (const { sl, e } of slips) {
      const r = sl.result!;
      const inp = sl.input;
      order += 1;
      const totalHours = round2(inp.hours_normal + inp.hours_ot_25 + inp.hours_ot_50 + inp.hours_ot_100);
      // « À ajouter » (primes + heures supp. + indemnités) = brut − base − ancienneté.
      const primesIndemnites = round2(r.salaireBrut - r.salaireBase - r.primeAnciennete);
      const totalRetenues = round2(r.cnssSalarie + r.amoSalarie + r.ir);
      const avances = round2(Math.max(0, inp.advances ?? 0));
      const netFinal = round2(r.netAPayer - avances);
      rows.push({
        order,
        bulletin: (e?.matricule ?? sl.employee_id).trim(),
        matricule: e?.matricule ?? "",
        period: `${two(per.month)}/${per.year}`,
        year: per.year,
        month: per.month,
        name: e ? `${e.first_name} ${e.last_name}` : "(salarié supprimé)",
        emploi: e?.position ?? "",
        birthDate: e?.birth_date,
        hireDate: e?.hire_date ?? "",
        cnss: e?.cnss_number,
        maritalStatus: e?.marital_status,
        dependents: e?.dependents ?? 0,
        hoursNormal: inp.hours_normal,
        hoursOt25: inp.hours_ot_25,
        hoursOt50: inp.hours_ot_50,
        hoursOt100: inp.hours_ot_100,
        daysWorked: inp.days_worked,
        totalHours,
        salaireBase: r.salaireBase,
        primeAnciennete: r.primeAnciennete,
        seniorityRate: r.seniorityRate,
        primesIndemnites,
        salaireBrut: r.salaireBrut,
        sbi: r.sbi,
        cnssSalarie: r.cnssSalarie,
        amoSalarie: r.amoSalarie,
        ir: r.ir,
        totalRetenues,
        netAPayer: r.netAPayer,
        avances,
        netFinal,
      });
    }
  }

  const totals = rows.reduce<PayrollBookTotals>(
    (acc, r) => {
      acc.count += 1;
      acc.daysWorked = round2(acc.daysWorked + r.daysWorked);
      acc.totalHours = round2(acc.totalHours + r.totalHours);
      acc.salaireBase = round2(acc.salaireBase + r.salaireBase);
      acc.primeAnciennete = round2(acc.primeAnciennete + r.primeAnciennete);
      acc.primesIndemnites = round2(acc.primesIndemnites + r.primesIndemnites);
      acc.salaireBrut = round2(acc.salaireBrut + r.salaireBrut);
      acc.sbi = round2(acc.sbi + r.sbi);
      acc.cnssSalarie = round2(acc.cnssSalarie + r.cnssSalarie);
      acc.amoSalarie = round2(acc.amoSalarie + r.amoSalarie);
      acc.ir = round2(acc.ir + r.ir);
      acc.totalRetenues = round2(acc.totalRetenues + r.totalRetenues);
      acc.netAPayer = round2(acc.netAPayer + r.netAPayer);
      acc.avances = round2(acc.avances + r.avances);
      acc.netFinal = round2(acc.netFinal + r.netFinal);
      return acc;
    },
    {
      count: 0, daysWorked: 0, totalHours: 0, salaireBase: 0, primeAnciennete: 0,
      primesIndemnites: 0, salaireBrut: 0, sbi: 0, cnssSalarie: 0, amoSalarie: 0,
      ir: 0, totalRetenues: 0, netAPayer: 0, avances: 0, netFinal: 0,
    },
  );

  return { firm, year, month, rows, totals };
}

/** Années présentes dans les périodes d'une société (pour le sélecteur), décroissantes. */
export function payrollBookYears(s: AppState, firmId: string): number[] {
  const years = new Set<number>();
  for (const p of s.periods) if (p.firm_id === firmId) years.add(p.year);
  return [...years].sort((a, b) => b - a);
}
