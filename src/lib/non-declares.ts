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

/** Versements d'une société sur une période. */
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
    const t = totalsOf(paymentsOfFirmPeriod(s, f.id, year, month));
    return { firm_id: f.id, firm_name: f.name, effectifND: eff, brut: t.brut, net: t.net, count: t.count };
  });
}

/** Cumul annuel d'une société (janvier → décembre). */
export function yearlyTotal(s: AppState, firmId: string, year: number): { brut: number; net: number; count: number } {
  const all = (s.nonDeclarePayments ?? []).filter((p) => p.firm_id === firmId && p.year === year);
  const t = totalsOf(all);
  return { brut: t.brut, net: t.net, count: t.count };
}

/** Construit un versement (net calculé, jamais saisi). */
export function buildPayment(args: Omit<NonDeclarePayment, "net_verse" | "id" | "created_at"> & { id: string; created_at: string }): NonDeclarePayment {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const avance = args.avance_deduite ?? 0;
  return { ...args, avance_deduite: avance, net_verse: r2((args.brut_verse ?? 0) - avance) };
}
