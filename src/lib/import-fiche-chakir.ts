/**
 * Import de la fiche d'émargement N° 12/EM-2026-10-CHAKIR (Kénitra).
 *
 * SOURCE UNIQUE : `c:\Users\Hp\Downloads\Fiche_Emargement_CHAKIR_20-09-2026_03-10-2026.pdf`
 *   - BELKORA CHAKIR (CPU — Chakir BELKORA), CNSS 5776458 (ICE/IF/RC vierges, pointillés).
 *   - Chantier NON RENSEIGNÉ (pointillés) — lieu de paiement : Kénitra.
 *   - Quinzaine du 20/09/2026 au 03/10/2026, paiement en espèces le 05/10/2026.
 *   - 17 OUVRIERS payés : net total 19 906,00 DH (brut 21 406 − avance 1 500).
 *     Seule avance de la fiche : Aziz chlima (dû 1 825 − avance 1 500 = net 325).
 *   - 2 lignes NON SALARIALES exclues (pas des personnes) : « 3attach » 2 492 DH
 *     et « transport zdehg » 2 400 DH (total 4 892 DH → à suivre en charges, pas en paie).
 *   - Total fiche 24 798,00 DH = 19 906 (ouvriers) + 4 892 (transport/attach) ✓.
 *   - Colonne CIN VIERGE → aucun CIN renseigné. « H / F » = code de paie (Cat.).
 *   - Sections « OUVRIERS D » / « OUVRIERS N.D » reprises en note, NON interprétées.
 *
 * HYPOTHÈSES EXPLICITES : mois 10/2026 (fiche « -10- », payée le 05/10/2026) ;
 * embauche 20/09/2026, CDD ; taux prérempli SMIG (le réel payé vit dans le versement).
 *
 * Idempotent : rejoué sans doublon ; ignore les déjà immatriculés CNSS (paie normale).
 */
import type { AppState, Employee } from "@/data/types";
import { getParams } from "./params";
import { buildPayment, type NonDeclarePayment } from "./non-declares";

export const CHAKIR_FICHE_REF = "12/EM-2026-10-CHAKIR";
export const CHAKIR_YEAR = 2026;
// OCTOBRE : fiche numérotée « -10- », payée le 05/10/2026 (quinzaine 20/09–03/10).
export const CHAKIR_MONTH = 10;
export const CHAKIR_SITE = "Kénitra";
export const CHAKIR_PAID_AT = "2026-10-05";

interface ChakirRow {
  /** Nom EXACTEMENT comme sur la fiche (orthographe conservée). */
  name: string;
  cat: string;
  /** Section de la fiche (D / N.D), non interprétée. */
  section: string;
  jours: number;
  montantDu: number;
  avance: number;
}

/** Les 17 OUVRIERS payés — montant dû / avance / net = colonnes de la fiche. */
export const CHAKIR_PAID_ROWS: ChakirRow[] = [
  { name: "RACHID CHALH", cat: "H", section: "OUVRIERS D", jours: 12.3, montantDu: 1537.5, avance: 0 },
  { name: "Brahim gni", cat: "H", section: "OUVRIERS D", jours: 13.2, montantDu: 1750, avance: 0 },
  { name: "Brahim Swafa", cat: "H", section: "OUVRIERS D", jours: 10, montantDu: 1250, avance: 0 },
  { name: "Aziz chlima", cat: "H", section: "OUVRIERS D", jours: 13.8, montantDu: 1825, avance: 1500 },
  { name: "ALLAL ARDOUCH", cat: "H", section: "OUVRIERS N.D", jours: 11, montantDu: 1375, avance: 0 },
  { name: "Abderrahman sehraoui", cat: "H", section: "OUVRIERS N.D", jours: 12, montantDu: 1500, avance: 0 },
  { name: "Brahim samih", cat: "H", section: "OUVRIERS N.D", jours: 12.7, montantDu: 1587.5, avance: 0 },
  { name: "Hassna swafa", cat: "F", section: "OUVRIERS N.D", jours: 12, montantDu: 960, avance: 0 },
  { name: "Fatima laamamra", cat: "F", section: "OUVRIERS N.D", jours: 12, montantDu: 960, avance: 0 },
  { name: "salima ben salem", cat: "F", section: "OUVRIERS N.D", jours: 9, montantDu: 720, avance: 0 },
  { name: "Bader fares", cat: "H", section: "OUVRIERS N.D", jours: 12.2, montantDu: 1525, avance: 0 },
  { name: "Mohamed el abdi", cat: "H", section: "OUVRIERS N.D", jours: 3, montantDu: 375, avance: 0 },
  { name: "Karim fayth", cat: "H", section: "OUVRIERS N.D", jours: 12.6, montantDu: 1575, avance: 0 },
  { name: "jilali kharim", cat: "H", section: "OUVRIERS N.D", jours: 11, montantDu: 1375, avance: 0 },
  { name: "Miloud Elbahri", cat: "H", section: "OUVRIERS N.D", jours: 14.2, montantDu: 1841, avance: 0 },
  { name: "anas benjedid", cat: "H", section: "OUVRIERS N.D", jours: 5, montantDu: 625, avance: 0 },
  { name: "othman kour", cat: "H", section: "OUVRIERS N.D", jours: 5, montantDu: 625, avance: 0 },
];

/** Lignes NON salariales de la fiche — EXCLUES de la paie (à suivre en charges). */
export const CHAKIR_NON_SALARIAL = [
  { label: "3attach", jours: 356, montant: 2492 },
  { label: "transport zdehg", jours: 2400, montant: 2400 },
];

export const CHAKIR_NET_TOTAL = 19906;
export const CHAKIR_BRUT_TOTAL = 21406;

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface ChakirImportSummary {
  firmId: string | null;
  firmCreated: boolean;
  employeesAdded: number;
  employeesReused: number;
  paymentsAdded: number;
  paymentsSkippedDeclared: number;
  totalNet: number;
}

/** Résout l'entité CHAKIR par nom (contient « chakir »), ou null si absente. */
export function resolveChakirFirmId(s: AppState): string | null {
  const found = (s.firms ?? []).find((f) => norm(f.name).includes("chakir"));
  return found?.id ?? null;
}

/**
 * Crée l'entité BELKORA CHAKIR depuis les mentions EXACTES de la fiche
 * (CPU, siège, CNSS 5776458 — ICE/IF/RC vierges sur la fiche, donc absents).
 * Régime SMIG par défaut (ouvriers de chantier, HYPOTHÈSE à confirmer en Paramètres).
 * Idempotente : ne crée qu'une fois.
 */
export function ensureChakirFirm(s: AppState): { id: string; created: boolean } {
  const existing = resolveChakirFirmId(s);
  if (existing) return { id: existing, created: false };
  const firm = {
    id: "firm_chakir",
    name: "BELKORA CHAKIR",
    legal_form: "Personne physique",
    city: "Kénitra",
    address: "Douar El Hancha, Groupe Ftihat, Sidi Taïbi, Kénitra",
    cnss_affiliation: "5776458",
    regime: "SMIG",
    signatory_name: "Chakir BELKORA",
    signatory_role: "Gérant",
  } as AppState["firms"][number];
  s.firms = [...(s.firms ?? []), firm];
  return { id: firm.id, created: true };
}

/** Applique l'import sur l'état (MUTATION idempotente, comme les autres backfills). */
export function ensureFicheEmargementChakir(s: AppState): ChakirImportSummary {
  const summary: ChakirImportSummary = {
    firmId: null, firmCreated: false, employeesAdded: 0, employeesReused: 0,
    paymentsAdded: 0, paymentsSkippedDeclared: 0, totalNet: 0,
  };
  const employees: Employee[] = (s.employees = s.employees ?? []);
  // Correction mois 09→10/2026 : purge des versements de septembre avant réimport.
  s.nonDeclarePayments = (s.nonDeclarePayments ?? []).filter(
    (x) => !(x.created_by === `import-fiche-${CHAKIR_FICHE_REF}` && x.month === 9 && x.year === CHAKIR_YEAR),
  );
  const payments: NonDeclarePayment[] = s.nonDeclarePayments;

  // Entité : réutilisée si elle existe (saisie utilisateur), sinon créée
  // depuis les mentions exactes de la fiche.
  const { id: firmId, created: firmCreated } = ensureChakirFirm(s);
  summary.firmId = firmId;
  summary.firmCreated = firmCreated;

  const p = getParams(CHAKIR_YEAR);
  const hourlyRate = p.smigHourly; // préremplissage SMIG, comme la création manuelle
  const keyOf = (name: string): string => `${firmId}::${norm(name)}`;

  const byKey = new Map(
    employees.filter((e) => e.firm_id === firmId).map((e) => [keyOf(`${e.first_name} ${e.last_name}`), e]),
  );
  const paymentIds = new Set(payments.map((x) => x.id));

  CHAKIR_PAID_ROWS.forEach((row, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const tokens = row.name.trim().split(/\s+/);
    const firstName = tokens[0] ?? row.name;
    const lastName = tokens.slice(1).join(" ") || "—";

    let emp = byKey.get(keyOf(row.name));
    if (!emp) {
      emp = {
        id: `emp-nd-ch-${nn}`,
        firm_id: firmId,
        matricule: `ND-CH-${nn}`,
        first_name: firstName,
        last_name: lastName,
        // CIN : colonne vierge sur la fiche → non renseigné (jamais inventé).
        hire_date: "2026-09-20",
        contract_type: "CDD",
        position: "Ouvrier",
        site: CHAKIR_SITE,
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

    const payId = `ndp-ch-2026-10-${nn}`;
    if (paymentIds.has(payId)) return;
    const pay = buildPayment({
      id: payId,
      firm_id: firmId,
      employee_id: emp.id,
      year: CHAKIR_YEAR,
      month: CHAKIR_MONTH,
      jours: row.jours,
      brut_verse: row.montantDu,
      avance_deduite: row.avance,
      mode: "especes",
      note: `Fiche ${CHAKIR_FICHE_REF} — ${row.section} — quinzaine 20/09/2026–03/10/2026 (payé le 05/10/2026, enregistré en 10/2026) — Cat. ${row.cat} — ${CHAKIR_SITE} (chantier non renseigné sur la fiche)`,
      created_at: `${CHAKIR_PAID_AT}T00:00:00.000Z`,
      created_by: `import-fiche-${CHAKIR_FICHE_REF}`,
    });
    payments.push(pay);
    paymentIds.add(payId);
    summary.paymentsAdded += 1;
    summary.totalNet = Math.round((summary.totalNet + pay.net_verse + Number.EPSILON) * 100) / 100;
  });

  return summary;
}
