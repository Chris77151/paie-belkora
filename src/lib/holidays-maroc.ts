/**
 * Jours fériés légaux du Maroc et DÉCOMPTE des jours d'un congé. Moteur PUR, testé.
 *
 * Seuls les jours fériés CIVILS À DATE FIXE sont inclus ici : leurs dates sont certaines chaque
 * année. Les fêtes RELIGIEUSES (Aïd al-Fitr, Aïd al-Adha, 1er Moharram, Aïd al-Mawlid) suivent le
 * calendrier lunaire et varient d'une année à l'autre selon l'observation ; elles ne sont donc
 * PAS codées en dur (zéro invention) et peuvent être fournies au décompte via `extraHolidays`.
 *
 * Le repos hebdomadaire est paramétrable : par défaut le DIMANCHE (jours ouvrables, cohérent avec
 * l'acquisition art. 231), avec l'option « samedi + dimanche ».
 */

export interface FixedHoliday {
  /** Mois 1-12. */
  month: number;
  /** Jour 1-31. */
  day: number;
  name: string;
}

/** Jours fériés civils À DATE FIXE au Maroc (dates certaines). */
export const MOROCCO_FIXED_HOLIDAYS: FixedHoliday[] = [
  { month: 1, day: 1, name: "Nouvel An" },
  { month: 1, day: 11, name: "Manifeste de l'Indépendance" },
  { month: 1, day: 14, name: "Nouvel An amazigh" },
  { month: 5, day: 1, name: "Fête du Travail" },
  { month: 7, day: 30, name: "Fête du Trône" },
  { month: 8, day: 14, name: "Oued Ed-Dahab" },
  { month: 8, day: 20, name: "Révolution du Roi et du Peuple" },
  { month: 8, day: 21, name: "Fête de la Jeunesse" },
  { month: 11, day: 6, name: "Marche Verte" },
  { month: 11, day: 18, name: "Fête de l'Indépendance" },
];

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Jours fériés fixes tombant dans l'intervalle [start, end] (bornes incluses, dates ISO). */
export function fixedHolidaysInRange(startISO: string, endISO: string): { date: string; name: string }[] {
  const s = (startISO || "").slice(0, 10);
  const e = (endISO || "").slice(0, 10);
  if (!s || !e || e < s) return [];
  const y0 = Number(s.slice(0, 4));
  const y1 = Number(e.slice(0, 4));
  const out: { date: string; name: string }[] = [];
  for (let y = y0; y <= y1; y++) {
    for (const h of MOROCCO_FIXED_HOLIDAYS) {
      const d = isoOf(y, h.month, h.day);
      if (d >= s && d <= e) out.push({ date: d, name: h.name });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface LeaveCount {
  /** Jours calendaires, bornes incluses. */
  calendar: number;
  /** Jours de repos hebdomadaire écartés. */
  rest: number;
  /** Jours fériés écartés (hors jours de repos). */
  holidays: number;
  /** Jours réellement décomptés = calendar − rest − holidays. */
  working: number;
  /** Fériés rencontrés (hors repos), pour l'affichage. */
  holidayList: { date: string; name: string }[];
}

export interface LeaveCountOptions {
  /** Jours de repos hebdomadaire (0 = dimanche … 6 = samedi). Défaut : `[0]` (dimanche). */
  restDays?: number[];
  /** Fériés supplémentaires (ISO aaaa-mm-jj) — fêtes religieuses variables, à préciser au besoin. */
  extraHolidays?: string[];
}

const EMPTY: LeaveCount = { calendar: 0, rest: 0, holidays: 0, working: 0, holidayList: [] };

/**
 * Décompte des jours d'un congé entre deux dates (bornes incluses), en écartant les jours de repos
 * hebdomadaire ET les jours fériés (fixes + éventuels ajoutés). Un férié tombant un jour de repos
 * n'est compté qu'une seule fois (comme repos). Itération en UTC (aucun décalage de fuseau/DST). PURE.
 */
export function countLeaveDays(startISO: string, endISO: string, opts: LeaveCountOptions = {}): LeaveCount {
  const s = (startISO || "").slice(0, 10);
  const e = (endISO || "").slice(0, 10);
  if (!s || !e) return { ...EMPTY };
  const start = new Date(`${s}T00:00:00Z`);
  const end = new Date(`${e}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { ...EMPTY };

  const restDays = new Set(opts.restDays ?? [0]);
  const nameByDate = new Map(fixedHolidaysInRange(s, e).map((h) => [h.date, h.name]));
  const extra = new Set(opts.extraHolidays ?? []);

  let calendar = 0, rest = 0, holidays = 0, working = 0;
  const holidayList: { date: string; name: string }[] = [];
  for (let t = new Date(start); t <= end; t.setUTCDate(t.getUTCDate() + 1)) {
    calendar++;
    const dateStr = isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (restDays.has(t.getUTCDay())) { rest++; continue; }
    if (nameByDate.has(dateStr) || extra.has(dateStr)) {
      holidays++;
      holidayList.push({ date: dateStr, name: nameByDate.get(dateStr) ?? "Jour férié" });
      continue;
    }
    working++;
  }
  return { calendar, rest, holidays, working, holidayList };
}
