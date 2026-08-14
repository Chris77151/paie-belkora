/**
 * Solde de congés payés — moteur PUR & testé (Code du travail marocain, art. 231-232).
 *
 * Congés payés ACQUIS (jours ouvrables) depuis l'embauche :
 *  - art. 231 : 1,5 j/mois de service, porté à 2 j/mois pour les salariés de moins de 18 ans ;
 *  - art. 232 : + majoration d'ancienneté de 1,5 j par tranche entière de 5 ans de service,
 *    la part de majoration étant plafonnée pour que le congé annuel ne dépasse pas 30 jours.
 * Modèle cumulatif depuis l'embauche (simplification de l'app). Les taux/plafonds viennent de
 * `params.ts`. Le solde = acquis − pris (somme des congés payés effectivement posés).
 */
import type { Employee, Leave } from "@/data/types";
import { getParams } from "./params";

export interface LeaveBalance {
  /** Jours de congés payés acquis depuis l'embauche, arrêtés à la date `at`. */
  acquired: number;
  /** Jours de congés payés effectivement pris (leaves de type `conge_paye`). */
  taken: number;
  /** Solde = acquis − pris (peut être négatif si le salarié a pris par anticipation). */
  balance: number;
}

/** Âge en années à une date donnée (null si date de naissance absente). */
function ageAt(birthDate: string | undefined, at: Date): number | null {
  if (!birthDate) return null;
  return (at.getTime() - new Date(birthDate).getTime()) / (365.25 * 8.64e7);
}

/** Congés payés ACQUIS (jours ouvrables) d'un salarié, arrêtés à la date `at`. PURE. */
export function acquiredLeaveDays(emp: Employee, at: Date): number {
  const p = getParams(at.getFullYear());
  const months = Math.max(0, (at.getTime() - new Date(emp.hire_date).getTime()) / (30.4375 * 8.64e7));
  const age = ageAt(emp.birth_date, at);
  const isMinor = age !== null && age < 18;
  const baseMonthly = isMinor ? p.paidLeaveMinorPerMonth : p.paidLeavePerMonth;

  const years = months / 12;
  const tranches = Math.floor(years / p.paidLeaveSeniorityTrancheYears);
  const seniorityBonusCap = Math.max(0, p.paidLeaveMaxDays - baseMonthly * 12);
  const seniorityBonus = Math.min(tranches * p.paidLeaveSeniorityBonusDays, seniorityBonusCap);

  return months * baseMonthly + seniorityBonus;
}

/**
 * Solde de congés payés d'un salarié (acquis / pris / solde), arrêté à la date `at`.
 * `leaves` = tous les congés connus (filtrés ici sur ce salarié et le type « congé payé »). PURE.
 */
export function leaveBalance(emp: Employee, leaves: Leave[], at: Date): LeaveBalance {
  const acquired = acquiredLeaveDays(emp, at);
  const taken = leaves
    .filter((l) => l.employee_id === emp.id && l.type === "conge_paye")
    .reduce((a, l) => a + l.days, 0);
  return { acquired, taken, balance: acquired - taken };
}

/** Source des congés du bulletin. */
export type LeaveSource = "app" | "odoo";

/**
 * Choisit la source des congés affichés sur le bulletin : décompte interne (`app`) ou soldes
 * importés d'Odoo (`odoo`). Si `odoo` est demandé mais qu'aucun solde Odoo n'a été importé pour le
 * salarié, on RETOMBE proprement sur le décompte de l'application (jamais d'affichage vide). PURE.
 */
export function payslipLeave(
  emp: Employee,
  leaves: Leave[],
  at: Date,
  source: LeaveSource | undefined,
): { balance: LeaveBalance; source: LeaveSource } {
  if (source === "odoo" && emp.odoo_leave) {
    const o = emp.odoo_leave;
    return { balance: { acquired: o.allocated, taken: o.taken, balance: o.remaining }, source: "odoo" };
  }
  return { balance: leaveBalance(emp, leaves, at), source: "app" };
}
