/**
 * Journal des documents générés — logique PURE (agrégation KPI, plafonnement).
 *
 * Aucun effet de bord, aucune dépendance au DOM ni à l'horloge : le « maintenant » est
 * INJECTÉ pour que les KPI soient déterministes et testables. La capture réelle (id +
 * horodatage) vit dans le store ; l'affichage vit dans la page « Journal des documents ».
 */
import type { DocGenEvent } from "@/data/types";

/** Taille maximale du journal : au-delà, les entrées les plus anciennes sont oubliées. */
export const MAX_DOC_EVENTS = 2000;

/**
 * Borne le journal en conservant les entrées les plus RÉCENTES. On suppose l'ordre d'entrée
 * chronologique (ajout en fin) : on garde donc la queue.
 */
export function capDocEvents(events: DocGenEvent[], max = MAX_DOC_EVENTS): DocGenEvent[] {
  return events.length <= max ? events : events.slice(events.length - max);
}

/** Clé mois « AAAA-MM » d'un horodatage ISO (les événements sont stockés en ISO/UTC). */
export function monthKey(iso: string): string {
  return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : "";
}

export interface MonthlyCount {
  /** « AAAA-MM ». */
  key: string;
  year: number;
  month: number;
  count: number;
}
export interface LabelCount {
  /** Clé de regroupement (type, format, ou id salarié). */
  key: string;
  /** Libellé lisible (ex. nom du salarié). */
  label: string;
  count: number;
}

export interface DocKpis {
  /** Nombre total de documents tracés (dans le périmètre fourni). */
  total: number;
  /** Documents générés durant le mois civil de `now`. */
  thisMonth: number;
  /** Documents générés le mois civil précédent (pour la variation). */
  prevMonth: number;
  /** Nombre de salariés distincts ayant reçu au moins un document. */
  distinctEmployees: number;
  /** Répartition par famille de document, ordre décroissant. */
  byType: LabelCount[];
  /** Répartition par format/canal, ordre décroissant. */
  byFormat: LabelCount[];
  /** Série mensuelle (ordre chronologique croissant). */
  monthly: MonthlyCount[];
  /** Top salariés par nombre de documents (décroissant). */
  topEmployees: LabelCount[];
  /** Horodatage ISO du dernier document généré (ou undefined). */
  lastAt?: string;
}

function tallyDesc(pairs: { key: string; label: string }[]): LabelCount[] {
  const map = new Map<string, LabelCount>();
  for (const { key, label } of pairs) {
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { key, label, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Agrège une liste d'événements en indicateurs. `now` (ISO) fixe le mois courant pour les
 * KPI « ce mois-ci » / « mois précédent » — passé en paramètre pour rester déterministe.
 * `topN` borne le classement des salariés.
 */
export function computeDocKpis(events: DocGenEvent[], now: string, topN = 5): DocKpis {
  const curKey = monthKey(now);
  // Mois précédent, calculé sur AAAA-MM (sans dépendre de l'horloge).
  const [cy, cm] = curKey.split("-").map(Number);
  const prevKey = curKey ? `${cm === 1 ? cy - 1 : cy}-${String(cm === 1 ? 12 : cm - 1).padStart(2, "0")}` : "";

  const byMonth = new Map<string, number>();
  const empLabel = new Map<string, string>();
  let thisMonth = 0;
  let prevMonth = 0;
  let lastAt: string | undefined;

  for (const e of events) {
    const k = monthKey(e.at);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    if (k && k === curKey) thisMonth += 1;
    if (k && k === prevKey) prevMonth += 1;
    if (!lastAt || e.at > lastAt) lastAt = e.at;
    if (e.employee_id) empLabel.set(e.employee_id, e.subject || e.employee_id);
  }

  const monthly: MonthlyCount[] = [...byMonth.entries()]
    .filter(([k]) => k)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, year: y, month: m, count };
    });

  const topEmployees = tallyDesc(
    events.filter((e) => e.employee_id).map((e) => ({ key: e.employee_id!, label: e.subject || e.employee_id! })),
  ).slice(0, topN);

  return {
    total: events.length,
    thisMonth,
    prevMonth,
    distinctEmployees: empLabel.size,
    byType: tallyDesc(events.map((e) => ({ key: e.doc_type, label: e.doc_type }))),
    byFormat: tallyDesc(events.map((e) => ({ key: e.format, label: e.format }))),
    monthly,
    topEmployees,
    lastAt,
  };
}
