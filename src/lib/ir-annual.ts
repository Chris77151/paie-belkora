/**
 * État annuel de l'IR sur salaires — déclaration des traitements et salaires (CGI art. 79).
 *
 * Moteur PUR : agrège les BULLETINS RÉELLEMENT VALIDÉS de l'année, mois par mois et salarié par
 * salarié. Aucune extrapolation, aucun recalcul — les montants figés du bulletin font foi, ce
 * sont les mêmes que le livre de paie, les écritures et la BDS.
 *
 * Ce point n'est pas cosmétique. L'écran précédent affichait « IR du mois x 12 » en le
 * présentant comme un état annuel : sur une année où l'effectif bouge, où une prime tombe en
 * décembre ou où un salarié entre en cours d'année, cette extrapolation est FAUSSE, et
 * l'écart se retrouve tel quel dans la déclaration déposée. Un état annuel se construit des
 * douze mois réels, ou il ne se construit pas.
 *
 * Les mois NON validés sont ignorés et signalés (`monthsMissing`) : mieux vaut un état
 * incomplet qui le dit qu'un état complet qui invente.
 */
import type { AppState, Employee, Firm } from "@/data/types";
import { round2 } from "./payroll-engine";

/** Une ligne de l'état : un salarié, cumulé sur l'année. */
export interface IrAnnualRow {
  /** N° d'ordre dans l'état (numérotation continue). */
  order: number;
  employee_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  cin: string;
  cnss: string;
  adresse: string;
  situationFamille: string;
  /** Personnes à charge retenues (dernier bulletin de l'année : la situation de fin d'exercice). */
  personnesACharge: number;
  /** Nombre de bulletins validés dans l'année (mois payés). */
  moisPayes: number;
  joursTravailles: number;

  brutAnnuel: number;
  /** Indemnités exonérées cumulées = Σ (brut − assiette). */
  exonerationsAnnuelles: number;
  brutImposableAnnuel: number;
  fraisProAnnuels: number;
  cnssAnnuel: number;
  amoAnnuel: number;
  /** Total des déductions sur le brut imposable (frais pro + CNSS + AMO). */
  deductionsAnnuelles: number;
  netImposableAnnuel: number;
  /** IR avant imputation des charges de famille. */
  irBrutAnnuel: number;
  chargesFamilleAnnuelles: number;
  /** IR effectivement retenu à la source — le montant déclaré. */
  irRetenuAnnuel: number;
  netPercuAnnuel: number;
}

export interface IrAnnualTotals {
  count: number;
  moisPayes: number;
  joursTravailles: number;
  brutAnnuel: number;
  exonerationsAnnuelles: number;
  brutImposableAnnuel: number;
  fraisProAnnuels: number;
  cnssAnnuel: number;
  amoAnnuel: number;
  deductionsAnnuelles: number;
  netImposableAnnuel: number;
  irBrutAnnuel: number;
  chargesFamilleAnnuelles: number;
  irRetenuAnnuel: number;
  netPercuAnnuel: number;
}

export interface IrAnnualState {
  firm: Firm;
  year: number;
  rows: IrAnnualRow[];
  totals: IrAnnualTotals;
  /** Mois de l'année dont la paie est validée (1-12, croissant). */
  monthsCovered: number[];
  /** Mois sans paie validée — l'état est alors partiel, et le dit. */
  monthsMissing: number[];
  /** Salariés payés dans l'année sans numéro CNSS (bloquant au dépôt). */
  missingCnss: number;
  /** Salariés payés dans l'année sans CIN. */
  missingCin: number;
}

/** Clé de tri : matricule numérique si possible, sinon nom — même règle que le livre de paie. */
function sortKey(e: Employee | undefined, fallback: string): string {
  if (!e) return `￿${fallback}`;
  const m = (e.matricule ?? "").trim();
  return m ? m.padStart(12, "0") : `${e.last_name} ${e.first_name}`.toLowerCase();
}

const emptyTotals = (): IrAnnualTotals => ({
  count: 0, moisPayes: 0, joursTravailles: 0,
  brutAnnuel: 0, exonerationsAnnuelles: 0, brutImposableAnnuel: 0, fraisProAnnuels: 0,
  cnssAnnuel: 0, amoAnnuel: 0, deductionsAnnuelles: 0, netImposableAnnuel: 0,
  irBrutAnnuel: 0, chargesFamilleAnnuelles: 0, irRetenuAnnuel: 0, netPercuAnnuel: 0,
});

/**
 * Construit l'état annuel de l'IR d'une société pour `year`.
 *
 * PURE : lit l'état applicatif, n'écrit rien, ne consulte pas l'horloge. Un salarié n'apparaît
 * que s'il a au moins un bulletin VALIDÉ dans l'année — un salarié inscrit mais jamais payé n'a
 * rien à déclarer.
 */
export function buildIrAnnual(s: AppState, firm: Firm, year: number): IrAnnualState {
  const periods = s.periods
    .filter((p) => p.firm_id === firm.id && p.year === year)
    .sort((a, b) => a.month - b.month);

  const empById = new Map(s.employees.filter((e) => e.firm_id === firm.id).map((e) => [e.id, e]));

  /** Cumul par salarié. `lastMonth` retient le mois le plus récent, pour la situation de fin d'exercice. */
  interface Acc {
    e?: Employee;
    /** Mois du dernier bulletin — situe la fin d'exercice du salarié. */
    lastMonth: number;
    moisPayes: number;
    joursTravailles: number;
    brutAnnuel: number;
    exonerationsAnnuelles: number;
    brutImposableAnnuel: number;
    fraisProAnnuels: number;
    cnssAnnuel: number;
    amoAnnuel: number;
    netImposableAnnuel: number;
    irBrutAnnuel: number;
    chargesFamilleAnnuelles: number;
    irRetenuAnnuel: number;
    netPercuAnnuel: number;
  }
  const byEmp = new Map<string, Acc>();
  const monthsCovered: number[] = [];

  for (const per of periods) {
    const slips = (s.payslips ?? []).filter((sl) => sl.period_id === per.id && sl.result != null);
    if (slips.length === 0) continue;
    monthsCovered.push(per.month);

    for (const sl of slips) {
      const r = sl.result!; // montants FIGÉS du bulletin validé
      const inp = sl.input;
      const cur = byEmp.get(sl.employee_id) ?? {
        e: empById.get(sl.employee_id),
        lastMonth: 0, moisPayes: 0, joursTravailles: 0,
        brutAnnuel: 0, exonerationsAnnuelles: 0, brutImposableAnnuel: 0, fraisProAnnuels: 0,
        cnssAnnuel: 0, amoAnnuel: 0, netImposableAnnuel: 0,
        irBrutAnnuel: 0, chargesFamilleAnnuelles: 0, irRetenuAnnuel: 0, netPercuAnnuel: 0,
      };

      cur.moisPayes += 1;
      cur.joursTravailles += inp.days_worked ?? 0;
      cur.brutAnnuel += r.salaireBrut;
      // Exonérations = écart brut / assiette, dérivé du bulletin figé (jamais recalculé).
      cur.exonerationsAnnuelles += Math.max(0, r.salaireBrut - r.sbi);
      cur.brutImposableAnnuel += r.sbi;
      cur.fraisProAnnuels += r.fraisPro;
      cur.cnssAnnuel += r.cnssSalarie;
      cur.amoAnnuel += r.amoSalarie;
      cur.netImposableAnnuel += r.sni;
      cur.irBrutAnnuel += r.irBrut;
      cur.chargesFamilleAnnuelles += r.chargesFamille;
      cur.irRetenuAnnuel += r.ir;
      // Net réellement perçu : les avances retenues sur le mois en sont déduites.
      cur.netPercuAnnuel += r.netAPayer - Math.max(0, inp.advances ?? 0);

      if (per.month > cur.lastMonth) cur.lastMonth = per.month;
      byEmp.set(sl.employee_id, cur);
    }
  }

  const rows: IrAnnualRow[] = [...byEmp.entries()]
    .sort(([ida, a], [idb, b]) => sortKey(a.e, ida).localeCompare(sortKey(b.e, idb)))
    .map(([id, a], i) => ({
      order: i + 1,
      employee_id: id,
      matricule: a.e?.matricule ?? "",
      nom: a.e?.last_name ?? "",
      prenom: a.e?.first_name ?? "",
      cin: a.e?.cin ?? "",
      cnss: a.e?.cnss_number ?? "",
      adresse: a.e?.address ?? "",
      situationFamille: a.e?.marital_status ?? "",
      personnesACharge: a.e?.dependents ?? 0,
      moisPayes: a.moisPayes,
      joursTravailles: round2(a.joursTravailles),
      brutAnnuel: round2(a.brutAnnuel),
      exonerationsAnnuelles: round2(a.exonerationsAnnuelles),
      brutImposableAnnuel: round2(a.brutImposableAnnuel),
      fraisProAnnuels: round2(a.fraisProAnnuels),
      cnssAnnuel: round2(a.cnssAnnuel),
      amoAnnuel: round2(a.amoAnnuel),
      deductionsAnnuelles: round2(a.fraisProAnnuels + a.cnssAnnuel + a.amoAnnuel),
      netImposableAnnuel: round2(a.netImposableAnnuel),
      irBrutAnnuel: round2(a.irBrutAnnuel),
      chargesFamilleAnnuelles: round2(a.chargesFamilleAnnuelles),
      irRetenuAnnuel: round2(a.irRetenuAnnuel),
      netPercuAnnuel: round2(a.netPercuAnnuel),
    }));

  const totals = rows.reduce<IrAnnualTotals>((t, r) => ({
    count: t.count + 1,
    moisPayes: t.moisPayes + r.moisPayes,
    joursTravailles: round2(t.joursTravailles + r.joursTravailles),
    brutAnnuel: round2(t.brutAnnuel + r.brutAnnuel),
    exonerationsAnnuelles: round2(t.exonerationsAnnuelles + r.exonerationsAnnuelles),
    brutImposableAnnuel: round2(t.brutImposableAnnuel + r.brutImposableAnnuel),
    fraisProAnnuels: round2(t.fraisProAnnuels + r.fraisProAnnuels),
    cnssAnnuel: round2(t.cnssAnnuel + r.cnssAnnuel),
    amoAnnuel: round2(t.amoAnnuel + r.amoAnnuel),
    deductionsAnnuelles: round2(t.deductionsAnnuelles + r.deductionsAnnuelles),
    netImposableAnnuel: round2(t.netImposableAnnuel + r.netImposableAnnuel),
    irBrutAnnuel: round2(t.irBrutAnnuel + r.irBrutAnnuel),
    chargesFamilleAnnuelles: round2(t.chargesFamilleAnnuelles + r.chargesFamilleAnnuelles),
    irRetenuAnnuel: round2(t.irRetenuAnnuel + r.irRetenuAnnuel),
    netPercuAnnuel: round2(t.netPercuAnnuel + r.netPercuAnnuel),
  }), emptyTotals());

  const covered = [...new Set(monthsCovered)].sort((a, b) => a - b);
  const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !covered.includes(m));

  return {
    firm, year, rows, totals,
    monthsCovered: covered,
    monthsMissing: missing,
    missingCnss: rows.filter((r) => !r.cnss.trim()).length,
    missingCin: rows.filter((r) => !r.cin.trim()).length,
  };
}

/**
 * Réserve portée sur tout export. Un état annuel produit par l'application PRÉPARE la
 * déclaration ; c'est le dépôt sur SIMPL-IR qui fait foi.
 */
export const IR_ANNUAL_DISCLAIMER =
  "État établi à partir des seuls bulletins VALIDÉS de l'exercice — aucune extrapolation. "
  + "Déclaration annuelle des traitements et salaires (CGI art. 79), à déposer avant le 1er mars "
  + "de l'année suivante. Le dépôt sur SIMPL-IR fait foi ; ce document le prépare et ne s'y "
  + "substitue pas.";

/** Phrase d'arrêté : elle fige le nombre de lignes et la couverture réelle de l'exercice. */
export function irAnnualCoverageLine(st: IrAnnualState): string {
  if (st.monthsMissing.length === 0) return "Exercice complet : les 12 mois de l'année sont validés.";
  if (st.monthsCovered.length === 0) return "Aucun mois validé sur cet exercice : l'état est vide.";
  const mois = st.monthsMissing.map((m) => String(m).padStart(2, "0")).join(", ");
  return `ÉTAT PARTIEL — ${st.monthsCovered.length} mois validés sur 12. Mois manquants : ${mois}.`;
}
