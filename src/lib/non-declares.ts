/**
 * Salariés non déclarés — moteur PUR (suivi interne, jamais déclaratif).
 *
 * Périmètre : tout salarié SANS numéro CNSS (`cnss_number` vide) est suivi ici,
 * qu'il soit en délai, hors délai ou en régime dérogatoire. Dès que le N° CNSS
 * est renseigné dans la fiche (volet Salariés), il SORT automatiquement de ce
 * volet et bascule en paie normale — aucune bascule manuelle, aucun doublon.
 *
 * ÉTANCHÉITÉ (règle non négociable) : les versements suivis ici n'alimentent
 * JAMAIS la BDS DAMANCOM, le livre de paie art. 371, les écritures PCGE ni
 * l'état IR 9421. Tout reçu porte « INTERNE — SANS VALEUR CNSS/DAMANCOM ».
 */
import type { AppState, Employee, Firm } from "@/data/types";

export type PaymentMode = "especes" | "virement" | "cheque";

/** Un versement interne à un salarié non déclaré (suivi, pas une paie). */
export interface NonDeclarePayment {
  id: string;
  firm_id: string;
  employee_id: string;
  year: number;
  month: number; // 1-12
  jours: number;
  brut_verse: number;
  avance_deduite?: number;
  net_verse: number; // brut_verse - avance_deduite
  mode: PaymentMode;
  /** Section d'équipe de la fiche d'émargement (ex. « OUVRIERS D ») — absente = « OUVRIERS ». */
  section?: string;
  /**
   * Quinzaine de rattachement : « Q1 » (1–15), « Q2 » (16–fin de mois),
   * absente = mois entier / non précisé. Toujours affichée (filtres, fiche).
   */
  quinzaine?: "Q1" | "Q2";
  /** Libellé exact de période, ex. « du 20/09/2026 au 03/10/2026 » (reprend la fiche source). */
  periode?: string;
  note?: string;
  created_at: string; // ISO
  created_by?: string;
}

/** Est suivi dans ce volet : pas de N° CNSS renseigné. */
export function isNonDeclare(e: Employee): boolean {
  return !(e.cnss_number ?? "").trim();
}

/** Salariés non déclarés d'une société (présents ou non, tant que sans CNSS). */
export function nonDeclaresOfFirm(s: AppState, firmId: string): Employee[] {
  return s.employees.filter((e) => e.firm_id === firmId && isNonDeclare(e));
}

/** Versements d'une société sur une période (bruts, historique inclus). */
export function paymentsOfFirmPeriod(
  s: AppState,
  firmId: string,
  year: number,
  month: number,
): NonDeclarePayment[] {
  return (s.nonDeclarePayments ?? []).filter(
    (p) => p.firm_id === firmId && p.year === year && p.month === month,
  );
}

/**
 * Versements du PROCESSUS non-déclarés : seuls ceux des salariés SANS CNSS
 * à ce jour. Dès qu'un salarié est immatriculé (régularisé), il bascule en paie
 * normale et QUITTE COMPLÈTEMENT ce processus — effectif, mouvements, totaux,
 * fiche. Son historique reste conservé (traçabilité), mais n'y figure plus.
 */
export function paymentsOfNonDeclares(
  s: AppState,
  firmId: string,
  year: number,
  month: number,
): NonDeclarePayment[] {
  const nd = new Set(nonDeclaresOfFirm(s, firmId).map((e) => e.id));
  return paymentsOfFirmPeriod(s, firmId, year, month).filter((p) => nd.has(p.employee_id));
}

/** Totaux d'une liste de versements. */
export function totalsOf(payments: NonDeclarePayment[]): {
  count: number;
  brut: number;
  avances: number;
  net: number;
} {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let brut = 0;
  let avances = 0;
  let net = 0;
  for (const p of payments) {
    brut = r2(brut + (p.brut_verse ?? 0));
    avances = r2(avances + (p.avance_deduite ?? 0));
    net = r2(net + (p.net_verse ?? 0));
  }
  return { count: payments.length, brut, avances, net };
}

/** Totaux par entité pour une période (toutes sociétés) — pilotage groupe. */
export function totalsByFirm(
  s: AppState,
  firms: Firm[],
  year: number,
  month: number,
): { firm_id: string; firm_name: string; effectifND: number; brut: number; net: number; count: number }[] {
  return firms.map((f) => {
    const eff = nonDeclaresOfFirm(s, f.id).length;
    const t = totalsOf(paymentsOfNonDeclares(s, f.id, year, month));
    return { firm_id: f.id, firm_name: f.name, effectifND: eff, brut: t.brut, net: t.net, count: t.count };
  });
}

/** Cumul annuel d'une société (janvier → décembre) — processus non-déclarés uniquement. */
export function yearlyTotal(s: AppState, firmId: string, year: number): { brut: number; net: number; count: number } {
  const nd = new Set(nonDeclaresOfFirm(s, firmId).map((e) => e.id));
  const all = (s.nonDeclarePayments ?? []).filter(
    (p) => p.firm_id === firmId && p.year === year && nd.has(p.employee_id),
  );
  const t = totalsOf(all);
  return { brut: t.brut, net: t.net, count: t.count };
}

/** Dernier jour d'un mois (1-12) — pour le libellé « Q2 : 16–fin de mois ». */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Libellé de période d'une quinzaine : « du 01/10/2026 au 15/10/2026 ». */
export function quinzaineLabel(year: number, month: number, q: "Q1" | "Q2"): string {
  const mm = String(month).padStart(2, "0");
  if (q === "Q1") return `du 01/${mm}/${year} au 15/${mm}/${year}`;
  return `du 16/${mm}/${year} au ${lastDayOfMonth(year, month)}/${mm}/${year}`;
}

/** Libellé court d'affichage d'un versement : quinzaine + période exacte. */
export function paymentPeriodLabel(pay: NonDeclarePayment): string {
  const q = pay.quinzaine ? ` · ${pay.quinzaine}` : "";
  const per = pay.periode ? ` (${pay.periode})` : "";
  return `${String(pay.month).padStart(2, "0")}/${pay.year}${q}${per}`;
}

/**
 * Rattache les 100 versements importés des 3 fiches 20/09–03/10/2026 à leur
 * quinzaine (Q1 d'octobre, payés le 05/10) avec le libellé exact de la fiche.
 * Idempotent : ne touche que les versements d'import sans période.
 */
export function backfillPeriodes(s: { nonDeclarePayments?: NonDeclarePayment[] }): number {
  let n = 0;
  for (const p of s.nonDeclarePayments ?? []) {
    if (!p.created_by?.startsWith("import-fiche-")) continue;
    if (p.periode) continue;
    p.quinzaine = "Q1";
    p.periode = "du 20/09/2026 au 03/10/2026";
    n += 1;
  }
  return n;
}

/** Construit un versement (net calculé, jamais saisi). */
export function buildPayment(args: Omit<NonDeclarePayment, "net_verse" | "id" | "created_at"> & { id: string; created_at: string }): NonDeclarePayment {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const avance = args.avance_deduite ?? 0;
  return { ...args, avance_deduite: avance, net_verse: r2((args.brut_verse ?? 0) - avance) };
}
