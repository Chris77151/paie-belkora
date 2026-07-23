/**
 * Moteur de self-check « Stabilisation & Calculs » — DÉTERMINISTE et PUR (sans effet de bord).
 *
 * Alimente le volet super-admin du même nom. Deux familles de contrôles :
 *   - CALCUL   : cohérence du référentiel `params.ts` (SOURCE UNIQUE des taux) et invariants des
 *                bulletins réellement calculés (net ≤ brut, CNSS plafonnée, IR ≥ 0, identité du net,
 *                équilibre débit=crédit des écritures de paie).
 *   - INTÉGRITÉ: cohérence des données de l'AppState (orphelins, société active valide, doublons…).
 *
 * RÈGLE : zéro invention, zéro faux positif. Un finding n'est émis que s'il est PROUVÉ par les
 * données ou le référentiel. Les corrections de CODE relèvent du skill `audit-stabilisation-app`
 * (agent) ; seules les anomalies de DONNÉES marquées `repairable` sont réparables in-app.
 */
import type { AppState } from "@/data/types";
import { getParams, AVAILABLE_YEARS, type PayrollParams } from "./params";
import { sumResults, buildPayrollEntry } from "./payroll-accounting";
import { DEFAULT_ACCOUNTS } from "./accounting-accounts";

export type StabilityAxis = "calcul" | "integrite";
export type StabilitySeverity = "critique" | "eleve" | "moyen" | "info";

export interface StabilityFinding {
  /** Identifiant stable (déduplication / suivi). */
  id: string;
  axis: StabilityAxis;
  severity: StabilitySeverity;
  title: string;
  /** Détail chiffré du problème (attendu vs obtenu, entités concernées). */
  detail: string;
  /** Réparable in-app (fix idempotent sur l'AppState via le store) ? Sinon → correction de code. */
  repairable: boolean;
  recommendation: string;
}

export interface StabilityReport {
  findings: StabilityFinding[];
  counts: Record<StabilitySeverity, number>;
  repairableCount: number;
  /** Score de santé 0-100 (100 = aucun finding). */
  score: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n);
const inUnitRange = (r: number) => finite(r) && r > 0 && r <= 1;

/* ------------------------------------------------------------------ contrôles CALCUL : référentiel params ------------------------------------------------------------------ */

function checkParams(year: number, p: PayrollParams, out: StabilityFinding[]) {
  const tag = `params-${year}`;

  // Barème IR : bornes strictement croissantes, taux croissants, dernière borne = Infinity.
  const b = p.irBrackets;
  let bracketsOk = b.length > 0 && b[b.length - 1].upTo === Infinity;
  for (let i = 1; i < b.length; i++) {
    if (!(b[i].upTo > b[i - 1].upTo) || b[i].rate < b[i - 1].rate) bracketsOk = false;
  }
  if (!bracketsOk) {
    out.push({
      id: `${tag}-ir`,
      axis: "calcul",
      severity: "critique",
      title: `Barème IR ${year} incohérent`,
      detail: `Les tranches IR doivent avoir des bornes (upTo) strictement croissantes, des taux non décroissants et se terminer par Infinity. Barème actuel : ${b.map((x) => `${x.upTo === Infinity ? "∞" : x.upTo}@${x.rate}`).join(" · ")}.`,
      repairable: false,
      recommendation: "Corriger les tranches IR dans src/lib/params.ts (correction de code — skill audit-stabilisation-app).",
    });
  }

  // Taux dans (0,1].
  const rates: [string, number][] = [
    ["cnssEmployeeRate", p.cnssEmployeeRate],
    ["amoEmployeeRate", p.amoEmployeeRate],
    ["cnssEmployerRate", p.cnssEmployerRate],
    ["familyAllocRate", p.familyAllocRate],
    ["amoEmployerRate", p.amoEmployerRate],
    ["tfpRate", p.tfpRate],
    ["fraisProLowRate", p.fraisProLowRate],
    ["fraisProHighRate", p.fraisProHighRate],
    ["stc.cddEndRate", p.stc.cddEndRate],
  ];
  const badRates = rates.filter(([, r]) => !inUnitRange(r));
  if (badRates.length) {
    out.push({
      id: `${tag}-rates`,
      axis: "calcul",
      severity: "eleve",
      title: `Taux hors bornes plausibles (${year})`,
      detail: `Taux attendus dans ]0 ; 1] : ${badRates.map(([k, r]) => `${k}=${r}`).join(", ")}.`,
      repairable: false,
      recommendation: "Vérifier ces taux dans src/lib/params.ts au regard du README (correction de code).",
    });
  }

  // Bases positives.
  const bases: [string, number][] = [
    ["smigHourly", p.smigHourly],
    ["legalMonthlyHours", p.legalMonthlyHours],
    ["smagDaily", p.smagDaily],
    ["cnssCeiling", p.cnssCeiling],
  ];
  const badBases = bases.filter(([, v]) => !(finite(v) && v > 0));
  if (badBases.length) {
    out.push({
      id: `${tag}-bases`,
      axis: "calcul",
      severity: "eleve",
      title: `Base réglementaire nulle ou invalide (${year})`,
      detail: `Valeurs strictement positives attendues : ${badBases.map(([k, v]) => `${k}=${v}`).join(", ")}.`,
      repairable: false,
      recommendation: "Corriger ces bases dans src/lib/params.ts (correction de code).",
    });
  }

  // Prime d'ancienneté : seuils et taux croissants.
  const sen = p.seniority;
  let senOk = true;
  for (let i = 1; i < sen.length; i++) {
    if (!(sen[i].years > sen[i - 1].years) || sen[i].rate < sen[i - 1].rate) senOk = false;
  }
  if (!senOk) {
    out.push({
      id: `${tag}-seniority`,
      axis: "calcul",
      severity: "moyen",
      title: `Prime d'ancienneté ${year} non monotone`,
      detail: `Les paliers d'ancienneté doivent croître en années ET en taux. Actuel : ${sen.map((x) => `${x.years}a@${x.rate}`).join(" · ")}.`,
      repairable: false,
      recommendation: "Réordonner les paliers d'ancienneté dans src/lib/params.ts (correction de code).",
    });
  }
}

/* ------------------------------------------------------------------ contrôles CALCUL : bulletins réels ------------------------------------------------------------------ */

function checkPayslips(s: AppState, out: StabilityFinding[]) {
  const periodById = new Map(s.periods.map((pd) => [pd.id, pd]));

  for (const slip of s.payslips) {
    const r = slip.result;
    if (!r) continue; // non calculé : rien à vérifier
    const period = periodById.get(slip.period_id);
    const year = period?.year ?? AVAILABLE_YEARS[0];
    const p = getParams(year);
    const who = `bulletin ${slip.id.slice(0, 10)}`;

    // Aucun montant NaN / Infini.
    const nums: [string, number][] = [
      ["salaireBrut", r.salaireBrut], ["cnssSalarie", r.cnssSalarie], ["amoSalarie", r.amoSalarie],
      ["ir", r.ir], ["netAPayer", r.netAPayer],
    ];
    const nan = nums.filter(([, v]) => !finite(v));
    if (nan.length) {
      out.push({
        id: `slip-${slip.id}-nan`, axis: "calcul", severity: "critique",
        title: `Montant non numérique (${who})`,
        detail: `Champs invalides (NaN/∞) : ${nan.map(([k]) => k).join(", ")}. Le bulletin doit être recalculé.`,
        repairable: false,
        recommendation: "Recalculer ce bulletin ; si le défaut persiste, corriger le moteur (skill).",
      });
      continue;
    }

    // Invariants universels du bulletin.
    if (r.netAPayer < 0) {
      out.push({
        id: `slip-${slip.id}-neg`, axis: "calcul", severity: "critique",
        title: `Net à payer négatif (${who})`,
        detail: `netAPayer = ${r.netAPayer} DH. Un net négatif révèle un défaut de calcul.`,
        repairable: false,
        recommendation: "Vérifier retenues et IR dans le moteur (skill).",
      });
    }
    if (r.netAPayer > round2(r.salaireBrut) + 0.02) {
      out.push({
        id: `slip-${slip.id}-netgtbrut`, axis: "calcul", severity: "critique",
        title: `Net supérieur au brut (${who})`,
        detail: `netAPayer = ${r.netAPayer} DH > salaireBrut = ${r.salaireBrut} DH. Impossible (net = brut − CNSS − AMO − IR).`,
        repairable: false,
        recommendation: "Défaut de calcul : corriger le moteur de paie (skill).",
      });
    }
    const cnssCap = round2(p.cnssCeiling * p.cnssEmployeeRate);
    if (r.cnssSalarie > cnssCap + 0.02) {
      out.push({
        id: `slip-${slip.id}-cnsscap`, axis: "calcul", severity: "eleve",
        title: `CNSS salariale au-delà du plafond (${who})`,
        detail: `cnssSalarie = ${r.cnssSalarie} DH > plafond ${cnssCap} DH (= ${p.cnssCeiling} × ${p.cnssEmployeeRate}). La CNSS doit être plafonnée.`,
        repairable: false,
        recommendation: "Vérifier le plafonnement CNSS (Math.min(sbi, cnssCeiling)) dans le moteur (skill).",
      });
    }
    if (r.ir < 0) {
      out.push({
        id: `slip-${slip.id}-irneg`, axis: "calcul", severity: "eleve",
        title: `IR négatif (${who})`,
        detail: `ir = ${r.ir} DH. L'IR net ne peut être négatif.`,
        repairable: false,
        recommendation: "Vérifier le calcul IR (barème + déductions) dans le moteur (skill).",
      });
    }
    // Identité du net : net = brut − CNSS − AMO − IR.
    const expected = round2(r.salaireBrut - r.cnssSalarie - r.amoSalarie - r.ir);
    if (Math.abs(expected - round2(r.netAPayer)) > 0.02) {
      out.push({
        id: `slip-${slip.id}-identity`, axis: "calcul", severity: "eleve",
        title: `Identité du net rompue (${who})`,
        detail: `Attendu net = brut − CNSS − AMO − IR = ${expected} DH ; obtenu ${r.netAPayer} DH.`,
        repairable: false,
        recommendation: "Aligner netAPayer sur la formule dans le moteur (skill).",
      });
    }
  }
}

/* ------------------------------------------------------------------ contrôles CALCUL : équilibre des écritures ------------------------------------------------------------------ */

function checkAccountingBalance(s: AppState, out: StabilityFinding[]) {
  const LOCKED = new Set(["validated", "declared", "paid"]);
  for (const period of s.periods) {
    if (!LOCKED.has(period.status)) continue;
    const results = s.payslips
      .filter((sl) => sl.period_id === period.id && sl.result)
      .map((sl) => sl.result!);
    if (!results.length) continue;
    const entry = buildPayrollEntry(sumResults(results), DEFAULT_ACCOUNTS, period.year, period.month);
    if (!entry.balanced) {
      out.push({
        id: `balance-${period.id}`, axis: "calcul", severity: "critique",
        title: `Écriture de paie déséquilibrée (${period.year}-${String(period.month).padStart(2, "0")})`,
        detail: `Débit ${entry.totalDebit} DH ≠ Crédit ${entry.totalCredit} DH sur la période figée. Toute OD de paie doit être équilibrée.`,
        repairable: false,
        recommendation: "Recalculer les bulletins de la période ; si persistant, corriger l'écriture (skill).",
      });
    }
  }
}

/* ------------------------------------------------------------------ contrôles INTÉGRITÉ (données réparables) ------------------------------------------------------------------ */

function checkIntegrity(s: AppState, out: StabilityFinding[]) {
  const empIds = new Set(s.employees.map((e) => e.id));
  const firmIds = new Set(s.firms.map((f) => f.id));
  const periodIds = new Set(s.periods.map((p) => p.id));

  const orphanSlips = s.payslips.filter((p) => !empIds.has(p.employee_id) || !periodIds.has(p.period_id));
  if (orphanSlips.length) {
    out.push({
      id: "orphan-payslips", axis: "integrite", severity: "moyen",
      title: `${orphanSlips.length} bulletin(s) orphelin(s)`,
      detail: `Bulletins rattachés à un salarié ou une période inexistants : ils faussent les totaux et l'audit.`,
      repairable: true,
      recommendation: "« Corriger » supprime ces bulletins orphelins (idempotent).",
    });
  }

  const orphanLeaves = (s.leaves ?? []).filter((l) => !empIds.has(l.employee_id));
  if (orphanLeaves.length) {
    out.push({
      id: "orphan-leaves", axis: "integrite", severity: "moyen",
      title: `${orphanLeaves.length} congé(s) orphelin(s)`,
      detail: `Congés rattachés à un salarié inexistant.`,
      repairable: true,
      recommendation: "« Corriger » supprime ces congés orphelins.",
    });
  }

  const orphanAcc = (s.workAccidents ?? []).filter((a) => !empIds.has(a.employee_id));
  if (orphanAcc.length) {
    out.push({
      id: "orphan-accidents", axis: "integrite", severity: "moyen",
      title: `${orphanAcc.length} accident(s) du travail orphelin(s)`,
      detail: `Accidents rattachés à un salarié inexistant.`,
      repairable: true,
      recommendation: "« Corriger » supprime ces accidents orphelins.",
    });
  }

  if (!firmIds.has(s.currentFirmId)) {
    out.push({
      id: "invalid-current-firm", axis: "integrite", severity: "eleve",
      title: "Société active invalide",
      detail: `currentFirmId = « ${s.currentFirmId} » ne correspond à aucune société : l'app peut afficher un état vide ou planter.`,
      repairable: true,
      recommendation: "« Corriger » recale la société active sur la première société existante.",
    });
  }

  const employeesWithBadFirm = s.employees.filter((e) => !firmIds.has(e.firm_id));
  if (employeesWithBadFirm.length) {
    out.push({
      id: "employees-bad-firm", axis: "integrite", severity: "eleve",
      title: `${employeesWithBadFirm.length} salarié(s) sans société valide`,
      detail: `Salariés dont firm_id ne pointe sur aucune société : ${employeesWithBadFirm.map((e) => `${e.first_name} ${e.last_name}`).slice(0, 5).join(", ")}${employeesWithBadFirm.length > 5 ? "…" : ""}.`,
      repairable: false,
      recommendation: "Réaffecter ces salariés à une société existante (données) — non supprimés automatiquement pour éviter toute perte.",
    });
  }

  // Doublons de matricule au sein d'une même société.
  const seen = new Map<string, number>();
  for (const e of s.employees) {
    if (!e.matricule?.trim()) continue;
    const key = `${e.firm_id}::${e.matricule.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  if (dups.length) {
    out.push({
      id: "duplicate-matricule", axis: "integrite", severity: "moyen",
      title: `${dups.length} matricule(s) en doublon`,
      detail: `Des salariés partagent le même matricule dans une société, ce qui casse l'appariement (import Odoo, bulletins).`,
      repairable: false,
      recommendation: "Attribuer un matricule unique par salarié (données).",
    });
  }

  const hasSuper = (s.users ?? []).some((u) => u.is_super || u.role === "super_admin");
  if (!hasSuper) {
    out.push({
      id: "no-super-admin", axis: "integrite", severity: "critique",
      title: "Aucun super administrateur",
      detail: `Aucun compte super_admin actif : risque de verrouillage total de l'administration.`,
      repairable: false,
      recommendation: "Le super administrateur racine est réinjecté au chargement (migrate) ; vérifier src/data/seed.ts (skill).",
    });
  }
}

/* ------------------------------------------------------------------ API ------------------------------------------------------------------ */

/** Exécute tous les self-checks déterministes sur l'état courant. PURE (aucun effet de bord). */
export function runStabilityChecks(s: AppState): StabilityFinding[] {
  const out: StabilityFinding[] = [];
  for (const year of AVAILABLE_YEARS) checkParams(year, getParams(year), out);
  checkPayslips(s, out);
  checkAccountingBalance(s, out);
  checkIntegrity(s, out);
  return out;
}

const WEIGHT: Record<StabilitySeverity, number> = { critique: 30, eleve: 12, moyen: 5, info: 1 };

/** Construit le rapport (compte par gravité + score de santé). */
export function buildReport(findings: StabilityFinding[]): StabilityReport {
  const counts: Record<StabilitySeverity, number> = { critique: 0, eleve: 0, moyen: 0, info: 0 };
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity] += 1;
    penalty += WEIGHT[f.severity];
  }
  return {
    findings,
    counts,
    repairableCount: findings.filter((f) => f.repairable).length,
    score: Math.max(0, 100 - penalty),
  };
}
