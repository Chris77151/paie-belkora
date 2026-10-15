/**
 * Import de la fiche d'émargement N° 12/EM-2026-10-MIYA (Sidi Yahya).
 *
 * SOURCE UNIQUE : `c:\Users\Hp\Downloads\Fiche_Emargement_MIYA_Sidi-Yahya_20-09-2026_03-10-2026.pdf`
 *   - MIYA BELKORA DESIGN SARL AU — Chantier « Travaux exterieur - Sidi Yahya », lieu Sidi Yahya.
 *   - Quinzaine du 20/09/2026 au 03/10/2026, paiement en espèces le 05/10/2026.
 *   - 33 salariés payés, total 21 842,00 DH (vérifié : somme des NET REMIS).
 *   - 13 lignes à « Néant — aucun jour pointé » (AUCUN versement, non importées en paie).
 *   - Colonne CIN de la fiche VIERGE (à compléter à la main) → aucun CIN renseigné ici.
 *   - « H / F » est le CODE de paie journalier (Cat.), pas un sexe déclaré → repris tel quel en note.
 *
 * HYPOTHÈSES EXPLICITES (pas de pièces) :
 *   - Mois d'enregistrement 10/2026 (fiche numérotée « -10- », payée le 05/10/2026).
 *   - Date d'embauche = 20/09/2026 (1er jour de la quinzaine, journaliers) ; contrat CDD.
 *   - Taux horaire = préremplissage SMIG du régime (comme la création manuelle) — le MONTANT
 *     RÉEL payé vit dans le versement, jamais dans ce taux.
 *
 * Idempotent : rejoué sans doublon (salarié apparié par nom normalisé + société, versement
 * par id déterministe). Un salarié déjà immatriculé CNSS est IGNORÉ (paie normale, étanchéité).
 */
import type { AppState, Employee } from "@/data/types";
import { getParams } from "./params";
import { buildPayment, type NonDeclarePayment } from "./non-declares";

export const FICHE_REF = "12/EM-2026-10-MIYA";
export const FICHE_FIRM_ID = "firm_miya";
export const FICHE_YEAR = 2026;
// OCTOBRE : fiche numérotée « -10- », payée le 05/10/2026 (quinzaine 20/09–03/10).
export const FICHE_MONTH = 10;
export const FICHE_SITE = "Sidi Yahya";
export const FICHE_CHANTIER = "Travaux exterieur - Sidi Yahya";
export const FICHE_PAID_AT = "2026-10-05";

interface FicheRow {
  /** Nom & prénom EXACTEMENT comme sur la fiche (trimé, orthographe conservée). */
  name: string;
  /** Code de paie journalier de la fiche (H / F). */
  cat: string;
  jours: number;
  montantDu: number;
}

/** Les 33 lignes PAYÉES de la fiche — montants = colonne « NET REMIS » (avances toutes à « — »). */
export const FICHE_PAID_ROWS: FicheRow[] = [
  { name: "hassan neaija", cat: "H", jours: 12, montantDu: 1620 },
  { name: "benacher derouich", cat: "H", jours: 11, montantDu: 1485 },
  { name: "abdessalam fliou", cat: "H", jours: 14, montantDu: 1890 },
  { name: "mohamed hailam", cat: "H", jours: 9, montantDu: 1215 },
  { name: "bader salaoua", cat: "H", jours: 1, montantDu: 125 },
  { name: "hamza bsoura", cat: "H", jours: 1, montantDu: 125 },
  { name: "soufiane kadiri", cat: "H", jours: 1, montantDu: 125 },
  { name: "soufiane hmidchat", cat: "H", jours: 2, montantDu: 250 },
  { name: "ayoub maiti", cat: "H", jours: 1, montantDu: 125 },
  { name: "abdennbi BOUKHRIS", cat: "H", jours: 2, montantDu: 250 },
  { name: "otman gomar", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "jilali swafa", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "said amari", cat: "H", jours: 6.8, montantDu: 916 },
  { name: "ahmed bsoura", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "mohamed bourzama", cat: "H", jours: 6.8, montantDu: 916 },
  { name: "rachid deKni", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "OTMANE LAMINE", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "FAHED JAOUI", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "mohamed sekkrati", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "yacine aoua", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "anas mis", cat: "H", jours: 6.8, montantDu: 900 },
  { name: "mohamed fatouhi", cat: "H", jours: 6.8, montantDu: 850 },
  { name: "abdessalam heshash", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "ikram samadi", cat: "F", jours: 6.4, montantDu: 800 },
  { name: "mehjouba attaqi", cat: "F", jours: 4.8, montantDu: 600 },
  { name: "ikram aborahim", cat: "F", jours: 6.4, montantDu: 850 },
  { name: "NAJAT LEMSIEAH", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "zouhair hagouch", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "abderazzak lezrag", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "houcien touri", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "FOUAD TAHIRI", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "LEKBIR MEHJOUB", cat: "H", jours: 1.6, montantDu: 200 },
  { name: "abdelmotalib salih", cat: "H", jours: 1.6, montantDu: 200 },
];

/** Les 13 lignes à « Néant — aucun jour pointé » : noms lus, AUCUN versement créé. */
export const FICHE_NEANT_NAMES = [
  "driss shaimat", "aymen shaimat", "ahmed shaimat", "anas goumara", "ammar aouichate",
  "abdelouahed shaimat", "mohamed soifa", "bilal ammari", "younes el kadiri", "tarek mremda",
  "oussama shaimat", "JAWAD BSOURA", "jilali bourzama",
];

export const FICHE_TOTAL = 21842;

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
const empKey = (firmId: string, name: string): string => `${firmId}::${norm(name)}`;

export interface FicheImportSummary {
  employeesAdded: number;
  employeesReused: number;
  paymentsAdded: number;
  paymentsSkippedDeclared: number;
  totalNet: number;
}

/**
 * Applique l'import sur l'état (MUTATION, comme les autres backfills du store).
 * Retourne le résumé chiffré. Réexécutable sans doublon.
 */
export function ensureFicheEmargementSidiYahya(s: AppState): FicheImportSummary {
  const summary: FicheImportSummary = {
    employeesAdded: 0, employeesReused: 0, paymentsAdded: 0, paymentsSkippedDeclared: 0, totalNet: 0,
  };
  const employees: Employee[] = (s.employees = s.employees ?? []);
  // Correction mois 09→10/2026 : les versements de septembre de cette fiche sont
  // SUPPRIMÉS avant réimport en octobre (zéro doublon entre les deux mois).
  s.nonDeclarePayments = (s.nonDeclarePayments ?? []).filter(
    (x) => !(x.created_by === `import-fiche-${FICHE_REF}` && x.month === 9 && x.year === FICHE_YEAR),
  );
  const payments: NonDeclarePayment[] = s.nonDeclarePayments;
  // Garde-fou : sans l'entité MIYA, aucun rattachement possible — on n'importe rien.
  if (!(s.firms ?? []).some((f) => f.id === FICHE_FIRM_ID)) return summary;

  const p = getParams(FICHE_YEAR);
  // Préremplissage SMIG du régime (comme la création manuelle) — le montant réel
  // payé vit dans le versement, jamais dans ce taux.
  const hourlyRate = p.smigHourly;

  const byKey = new Map(employees.filter((e) => e.firm_id === FICHE_FIRM_ID).map((e) => [empKey(e.firm_id, `${e.first_name} ${e.last_name}`), e]));
  const paymentIds = new Set(payments.map((x) => x.id));

  FICHE_PAID_ROWS.forEach((row, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const tokens = row.name.trim().split(/\s+/);
    const firstName = tokens[0] ?? row.name;
    const lastName = tokens.slice(1).join(" ") || "—";
    const key = empKey(FICHE_FIRM_ID, row.name);

    let emp = byKey.get(key);
    if (!emp) {
      emp = {
        id: `emp-nd-sy-${nn}`,
        firm_id: FICHE_FIRM_ID,
        matricule: `ND-SY-${nn}`,
        first_name: firstName,
        last_name: lastName,
        // CIN : colonne vierge sur la fiche → non renseigné (jamais inventé).
        hire_date: "2026-09-20",
        contract_type: "CDD",
        position: "Ouvrier",
        site: FICHE_SITE,
        base_hourly_rate: hourlyRate,
        monthly_hours: p.legalMonthlyHours,
        dependents: 0,
        is_active: true,
      } as Employee;
      employees.push(emp);
      byKey.set(key, emp);
      summary.employeesAdded += 1;
    } else {
      summary.employeesReused += 1;
    }

    // Déjà immatriculé entre-temps → paie normale, pas de versement interne.
    if ((emp.cnss_number ?? "").trim()) {
      summary.paymentsSkippedDeclared += 1;
      return;
    }

    const payId = `ndp-sy-2026-10-${nn}`;
    if (paymentIds.has(payId)) return;
    const pay: NonDeclarePayment = buildPayment({
      id: payId,
      firm_id: FICHE_FIRM_ID,
      employee_id: emp.id,
      year: FICHE_YEAR,
      month: FICHE_MONTH,
      jours: row.jours,
      brut_verse: row.montantDu,
      avance_deduite: 0, // colonne « Avances » à « — » sur toute la fiche
      mode: "especes",
      note: `Fiche ${FICHE_REF} — quinzaine 20/09/2026–03/10/2026 (payé le 05/10/2026, enregistré en 10/2026) — Cat. ${row.cat} — ${FICHE_SITE} / ${FICHE_CHANTIER}`,
      created_at: `${FICHE_PAID_AT}T00:00:00.000Z`,
      created_by: `import-fiche-${FICHE_REF}`,
    });
    payments.push(pay);
    paymentIds.add(payId);
    summary.paymentsAdded += 1;
    summary.totalNet = Math.round((summary.totalNet + pay.net_verse + Number.EPSILON) * 100) / 100;
  });

  return summary;
}
