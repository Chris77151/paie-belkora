/**
 * Import de la fiche d'émargement N° 12/EM-2026-10 (Pépinière, Sidi Yahya).
 *
 * SOURCE UNIQUE : `c:\Users\Hp\Downloads\Fiche_Emargement_Pepiniere_20-09-2026_03-10-2026.pdf`
 *   - PEPINIERE BELKORA (CPU — Ahmed BELKORA), CNSS 9829609.
 *   - Chantier « Travaux exterieur - Sidi Yahya », lieu Sidi Yahya.
 *   - Quinzaine du 20/09/2026 au 03/10/2026, paiement en espèces le 05/10/2026.
 *   - 50 OUVRIERS payés : net total 41 748,00 DH
 *       = 4 862,50 (OUVRIERS D) + 15 043,50 (OUVRIERS N.D) + 21 842,00 (OUVRIERS SIDI YAHYA) ✓.
 *     Seule avance : Aziz chlima (dû 1 825 − avance 1 500 = net 325).
 *   - 13 lignes à « Néant — aucun jour pointé » (AUCUN versement, non importées en paie).
 *   - Colonne CIN VIERGE → aucun CIN renseigné. « H / F » = code de paie (Cat.).
 *   - Sections D / N.D reprises en note, NON interprétées.
 *
 * Les 50 lignes payées reprennent EXACTEMENT les deux autres fiches de la même
 * quinzaine (mêmes noms, jours, montants) : les données sont donc factorisées
 * depuis `import-fiche-chakir.ts` (17) et `import-fiche-sidi-yahya.ts` (33),
 * seule la référence de fiche et l'entité changent.
 *
 * HYPOTHÈSES EXPLICITES : mois 09/2026 ; embauche 20/09/2026, CDD ; taux prérempli
 * SMIG (le réel payé vit dans le versement). Entité seed `firm_pep`, gardée si absente.
 *
 * Idempotent : rejoué sans doublon ; ignore les déjà immatriculés CNSS (paie normale).
 */
import type { AppState, Employee } from "@/data/types";
import { getParams } from "./params";
import { buildPayment, type NonDeclarePayment } from "./non-declares";
import { CHAKIR_PAID_ROWS } from "./import-fiche-chakir";
import { FICHE_PAID_ROWS as MIYA_PAID_ROWS } from "./import-fiche-sidi-yahya";

export const PEP_FICHE_REF = "12/EM-2026-10";
export const PEP_FIRM_ID = "firm_pep";
export const PEP_YEAR = 2026;
// OCTOBRE : fiche numérotée « -10 », payée le 05/10/2026 (quinzaine 20/09–03/10).
export const PEP_MONTH = 10;
export const PEP_SITE = "Sidi Yahya";
export const PEP_CHANTIER = "Travaux exterieur - Sidi Yahya";
export const PEP_PAID_AT = "2026-10-05";

interface PepRow {
  name: string;
  cat: string;
  section: string;
  jours: number;
  montantDu: number;
  avance: number;
}

/** 50 lignes payées : 17 CHAKIR (D + N.D) puis 33 MIYA (SIDI YAHYA). */
export const PEP_PAID_ROWS: PepRow[] = [
  ...CHAKIR_PAID_ROWS.map((r) => ({
    name: r.name, cat: r.cat, section: r.section,
    jours: r.jours, montantDu: r.montantDu, avance: r.avance,
  })),
  ...MIYA_PAID_ROWS.map((r) => ({
    name: r.name, cat: r.cat, section: "OUVRIERS SIDI YAHYA",
    jours: r.jours, montantDu: r.montantDu, avance: 0,
  })),
];

export const PEP_NET_TOTAL = 41748;
export const PEP_BRUT_TOTAL = 43248;

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface PepImportSummary {
  firmMissing: boolean;
  employeesAdded: number;
  employeesReused: number;
  paymentsAdded: number;
  paymentsSkippedDeclared: number;
  totalNet: number;
}

/** Applique l'import sur l'état (MUTATION idempotente, comme les autres backfills). */
export function ensureFicheEmargementPepiniere(s: AppState): PepImportSummary {
  const summary: PepImportSummary = {
    firmMissing: false, employeesAdded: 0, employeesReused: 0,
    paymentsAdded: 0, paymentsSkippedDeclared: 0, totalNet: 0,
  };
  const employees: Employee[] = (s.employees = s.employees ?? []);
  // Correction mois 09→10/2026 : purge des versements de septembre avant réimport.
  s.nonDeclarePayments = (s.nonDeclarePayments ?? []).filter(
    (x) => !(x.created_by === `import-fiche-${PEP_FICHE_REF}` && x.month === 9 && x.year === PEP_YEAR),
  );
  const payments: NonDeclarePayment[] = s.nonDeclarePayments;

  if (!(s.firms ?? []).some((f) => f.id === PEP_FIRM_ID)) {
    summary.firmMissing = true; // entité absente : on n'importe rien, sans rien inventer
    return summary;
  }

  const p = getParams(PEP_YEAR);
  const hourlyRate = p.smigHourly; // préremplissage SMIG, comme la création manuelle
  const keyOf = (name: string): string => `${PEP_FIRM_ID}::${norm(name)}`;

  const byKey = new Map(
    employees.filter((e) => e.firm_id === PEP_FIRM_ID).map((e) => [keyOf(`${e.first_name} ${e.last_name}`), e]),
  );
  const paymentIds = new Set(payments.map((x) => x.id));

  PEP_PAID_ROWS.forEach((row, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const tokens = row.name.trim().split(/\s+/);
    const firstName = tokens[0] ?? row.name;
    const lastName = tokens.slice(1).join(" ") || "—";

    let emp = byKey.get(keyOf(row.name));
    if (!emp) {
      emp = {
        id: `emp-nd-pep-${nn}`,
        firm_id: PEP_FIRM_ID,
        matricule: `ND-PEP-${nn}`,
        first_name: firstName,
        last_name: lastName,
        // CIN : colonne vierge sur la fiche → non renseigné (jamais inventé).
        hire_date: "2026-09-20",
        contract_type: "CDD",
        position: "Ouvrier",
        site: PEP_SITE,
        base_hourly_rate: hourlyRate,
        monthly_hours: p.legalMonthlyHours,
        dependents: 0,
        is_active: true,
      } as Employee;
      employees.push(emp);
      byKey.set(keyOf(row.name), emp);
      summary.employeesAdded += 1;
    } else {
      summary.employeesReused += 1;
    }

    if ((emp.cnss_number ?? "").trim()) {
      summary.paymentsSkippedDeclared += 1; // déjà immatriculé → paie normale
      return;
    }

    const payId = `ndp-pep-2026-10-${nn}`;
    if (paymentIds.has(payId)) return;
    const pay = buildPayment({
      id: payId,
      firm_id: PEP_FIRM_ID,
      employee_id: emp.id,
      year: PEP_YEAR,
      month: PEP_MONTH,
      jours: row.jours,
      brut_verse: row.montantDu,
      avance_deduite: row.avance,
      mode: "especes",
      note: `Fiche ${PEP_FICHE_REF} — ${row.section} — quinzaine 20/09/2026–03/10/2026 (payé le 05/10/2026, enregistré en 10/2026) — Cat. ${row.cat} — ${PEP_SITE} / ${PEP_CHANTIER}`,
      created_at: `${PEP_PAID_AT}T00:00:00.000Z`,
      created_by: `import-fiche-${PEP_FICHE_REF}`,
    });
    payments.push(pay);
    paymentIds.add(payId);
    summary.paymentsAdded += 1;
    summary.totalNet = Math.round((summary.totalNet + pay.net_verse + Number.EPSILON) * 100) / 100;
  });

  return summary;
}
