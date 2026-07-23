/**
 * Rapport des FORMULES DE CALCUL RÉELLES — volet « Stabilisation & Calculs ».
 *
 * Ne décrit AUCUNE formule « à la main » : on exécute le VRAI moteur `computePayslip` (le même
 * que celui des bulletins) sur un salarié représentatif construit pour la démonstration, puis on
 * restitue chaque étape avec sa formule (opérations et taux réels de params.ts) ET son résultat
 * chiffré tel que renvoyé par le moteur. Ainsi le rapport reflète EXACTEMENT ce que l'application
 * calcule ; toute évolution du moteur/params se répercute automatiquement ici.
 *
 * Module PUR (aucun effet de bord, aucune dépendance au store) → testable.
 */
import { computePayslip, type PayrollInput, type PayrollResult } from "./payroll-engine";
import { getParams, type PayrollParams } from "./params";

export interface FormulaLine {
  /** Intitulé de l'étape. */
  label: string;
  /** Formule réelle avec les taux/plafonds de params.ts et les valeurs de l'exemple. */
  formula: string;
  /** Résultat chiffré renvoyé par le moteur. */
  result: string;
}
export interface FormulaGroup {
  id: string;
  title: string;
  lines: FormulaLine[];
}
export interface FormulaReport {
  year: number;
  /** Hypothèses de l'exemple (entrée du moteur). */
  hypotheses: { label: string; value: string }[];
  groups: FormulaGroup[];
}

const dh = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
const pct = (r: number) => `${(r * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** Salarié représentatif servant UNIQUEMENT à exécuter le moteur pour la démonstration. */
function sampleInput(year: number): PayrollInput {
  return {
    year,
    month: 6,
    regime: "SMIG",
    hireDate: `${year - 7}-01-01`, // ~7 ans d'ancienneté
    dependents: 2,
    hourlyRate: 30, // DH/h (au-dessus du SMIG)
    daysWorked: 26,
    hoursNormal: 191,
    hoursOt25: 8, // heures sup. jour ouvrable
    hoursOt50: 0,
    hoursOt100: 0,
    panier: 0,
    transport: 500,
    salissure: 0,
    otherGross: 0,
    transportOutsideUrban: false,
  };
}

/**
 * Construit le rapport des formules réelles pour une année (exécute le vrai moteur).
 * Les intitulés/formules décrivent les opérations EXACTES de `computePayslip` (payroll-engine.ts).
 */
export function buildFormulaReport(year: number): FormulaReport {
  const p: PayrollParams = getParams(year);
  const i = sampleInput(year);
  const r: PayrollResult = computePayslip(i);

  const hypotheses = [
    { label: "Année (paramètres)", value: String(year) },
    { label: "Taux horaire", value: dh(i.hourlyRate) + "/h" },
    { label: "Heures mensuelles (mois complet)", value: `${i.hoursNormal} h` },
    { label: "Jours travaillés", value: `${i.daysWorked} / ${p.standardMonthlyDays}` },
    { label: "Heures sup. (jour, +" + pct(p.overtime.day) + ")", value: `${i.hoursOt25} h` },
    { label: "Ancienneté", value: `${r.seniorityYears} an(s) → ${pct(r.seniorityRate)}` },
    { label: "Personnes à charge", value: String(i.dependents) },
    { label: "Transport (indemnité)", value: dh(i.transport) },
  ];

  const groups: FormulaGroup[] = [
    {
      id: "base",
      title: "1 · Salaire de base & heures supplémentaires",
      lines: [
        {
          label: "Salaire de base (proratisé)",
          formula: `heures × taux × min(jours/${p.standardMonthlyDays} ; 1) = ${i.hoursNormal} × ${dh(i.hourlyRate)} × ${(Math.min(i.daysWorked / p.standardMonthlyDays, 1)).toLocaleString("fr-FR", { maximumFractionDigits: 4 })}`,
          result: dh(r.salaireBase),
        },
        {
          label: `Heures sup. +${pct(p.overtime.day)}`,
          formula: `heures × taux × (1 + ${pct(p.overtime.day)}) = ${i.hoursOt25} × ${dh(i.hourlyRate)} × ${1 + p.overtime.day}`,
          result: dh(r.overtimeDetail.ot25),
        },
        {
          label: "Total heures supplémentaires",
          formula: `ot(+${pct(p.overtime.day)}) + ot(+${pct(p.overtime.restDay)}) + ot(+${pct(p.overtime.restNight)})`,
          result: dh(r.overtime),
        },
      ],
    },
    {
      id: "anciennete",
      title: "2 · Prime d'ancienneté (art. 350-352)",
      lines: [
        {
          label: `Taux selon ancienneté (${r.seniorityYears} an(s))`,
          formula: `barème paliers ${p.seniority.map((x) => `${x.years}a→${pct(x.rate)}`).join(" · ")}`,
          result: pct(r.seniorityRate),
        },
        {
          label: "Prime d'ancienneté",
          formula: `(base + heures sup.) × taux = (${dh(r.salaireBase)} + ${dh(r.overtime)}) × ${pct(r.seniorityRate)}`,
          result: dh(r.primeAnciennete),
        },
      ],
    },
    {
      id: "indemnites",
      title: "3 · Indemnités — part exonérée / imposable",
      lines: [
        {
          label: "Plafond transport exonéré",
          formula: i.transportOutsideUrban
            ? `hors périmètre urbain = ${dh(p.transportOutsideUrbanCap)}`
            : `intra-urbain = ${dh(p.transportIntraUrbanCap)}`,
          result: dh(r.transportExonere),
        },
        {
          label: "Plafond panier exonéré",
          formula: `${p.panierPerDayCapFactor} × SMIG horaire × jours = ${p.panierPerDayCapFactor} × ${dh(p.smigHourly)} × ${i.daysWorked}`,
          result: dh(r.panierExonere),
        },
        {
          label: "Indemnités imposables (réintégrées au SBI)",
          formula: `indemnités brutes − exonérées`,
          result: dh(r.indemnitesImposables),
        },
      ],
    },
    {
      id: "brut",
      title: "4 · Salaire brut & SBI (salaire brut imposable)",
      lines: [
        {
          label: "Salaire brut",
          formula: `base + heures sup. + prime anc. + indemnités + autres = ${dh(r.salaireBase)} + ${dh(r.overtime)} + ${dh(r.primeAnciennete)} + …`,
          result: dh(r.salaireBrut),
        },
        {
          label: "SBI",
          formula: `brut − indemnités exonérées = ${dh(r.salaireBrut)} − ${dh(r.indemnitesExonerees)}`,
          result: dh(r.sbi),
        },
      ],
    },
    {
      id: "cotisations",
      title: "5 · Cotisations salariales (assiette = SBI)",
      lines: [
        {
          label: `CNSS salariale (${pct(p.cnssEmployeeRate)}, plafonnée)`,
          formula: `min(SBI ; plafond ${dh(p.cnssCeiling)}) × ${pct(p.cnssEmployeeRate)} = min(${dh(r.sbi)} ; ${dh(p.cnssCeiling)}) × ${pct(p.cnssEmployeeRate)}`,
          result: dh(r.cnssSalarie),
        },
        {
          label: `AMO salariale (${pct(p.amoEmployeeRate)}, déplafonnée)`,
          formula: `SBI × ${pct(p.amoEmployeeRate)} = ${dh(r.sbi)} × ${pct(p.amoEmployeeRate)}`,
          result: dh(r.amoSalarie),
        },
      ],
    },
    {
      id: "fraispro",
      title: "6 · Frais professionnels (CGI art. 59-I-A)",
      lines: [
        {
          label: `Taux appliqué (${pct(r.fraisProRate)})`,
          formula: `SBI annuel ≤ ${dh(p.fraisProLowThresholdAnnual)} → ${pct(p.fraisProLowRate)} ; sinon ${pct(p.fraisProHighRate)} plafonné ${dh(p.fraisProHighCapAnnual)}/an`,
          result: pct(r.fraisProRate),
        },
        {
          label: "Frais professionnels (mensuels)",
          formula: `SBI × taux (écrêté au plafond mensuel le cas échéant)`,
          result: dh(r.fraisPro),
        },
      ],
    },
    {
      id: "ir",
      title: "7 · Impôt sur le revenu (barème LF)",
      lines: [
        {
          label: "SNI (salaire net imposable)",
          formula: `SBI − frais pro − CNSS − AMO = ${dh(r.sbi)} − ${dh(r.fraisPro)} − ${dh(r.cnssSalarie)} − ${dh(r.amoSalarie)}`,
          result: dh(r.sni),
        },
        {
          label: "IR brut (barème annuel / 12)",
          formula: `barème(SNI × 12) / 12 — tranches ${p.irBrackets.map((b) => (b.upTo === Infinity ? `∞@${pct(b.rate)}` : `${b.upTo}@${pct(b.rate)}`)).join(" · ")}`,
          result: dh(r.irBrut),
        },
        {
          label: `Déduction charges de famille (${dh(p.familyDeductionMonthly)} × pers., max ${p.familyDeductionMaxPersons})`,
          formula: `${dh(p.familyDeductionMonthly)} × ${i.dependents}`,
          result: dh(r.chargesFamille),
        },
        {
          label: "IR net",
          formula: `max(0 ; IR brut − charges famille) = max(0 ; ${dh(r.irBrut)} − ${dh(r.chargesFamille)})`,
          result: dh(r.ir),
        },
      ],
    },
    {
      id: "net",
      title: "8 · Net à payer",
      lines: [
        {
          label: "Net à payer",
          formula: `brut − CNSS − AMO − IR = ${dh(r.salaireBrut)} − ${dh(r.cnssSalarie)} − ${dh(r.amoSalarie)} − ${dh(r.ir)}`,
          result: dh(r.netAPayer),
        },
      ],
    },
    {
      id: "patronal",
      title: "9 · Charges patronales & coût employeur",
      lines: [
        {
          label: `CNSS patronale (${pct(p.cnssEmployerRate)}, plafonnée)`,
          formula: `court terme ${pct(p.cnssEmployerCourtTermeRate)} + IPE ${pct(p.cnssEmployerIpeRate)} + long terme ${pct(p.cnssEmployerLongTermeRate)} sur min(SBI ; plafond)`,
          result: dh(r.cnssPatronal),
        },
        {
          label: `Allocations familiales (${pct(p.familyAllocRate)})`,
          formula: `SBI × ${pct(p.familyAllocRate)}`,
          result: dh(r.af),
        },
        {
          label: `AMO patronale (${pct(p.amoEmployerRate)})`,
          formula: `SBI × (${pct(p.amoEmployerBaseRate)} + ${pct(p.amoEmployerSolidariteRate)})`,
          result: dh(r.amoPatronal),
        },
        {
          label: `TFP (${pct(p.tfpRate)})`,
          formula: `SBI × ${pct(p.tfpRate)}`,
          result: dh(r.tfp),
        },
        {
          label: "Coût total employeur",
          formula: `brut + charges patronales = ${dh(r.salaireBrut)} + ${dh(r.chargesPatronales)}`,
          result: dh(r.coutTotalEmployeur),
        },
      ],
    },
  ];

  return { year, hypotheses, groups };
}
