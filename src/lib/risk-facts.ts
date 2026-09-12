/**
 * Constatation des FAITS qui prouvent — ou non — l'application d'un contrôle.
 *
 * C'est ce module qui distingue cette cartographie d'un tableur : la preuve d'un contrôle n'est
 * pas déclarée une fois pour toutes, elle est RELUE depuis l'état réel de la société à chaque
 * affichage. Un contrôle cesse d'abattre le jour où le fait qui le prouve disparaît — un code de
 * validation effacé, un salarié ajouté sans numéro CNSS, une période close jamais validée.
 *
 * Fonction PURE de l'état : la date d'arrêté est passée en paramètre, jamais `new Date()`
 * implicite, sans quoi la cartographie ne serait ni testable ni reproductible d'une édition à
 * l'autre.
 */
import type { AppState, Employee, Firm } from "@/data/types";
import type { FactKey, RiskFacts } from "./risk-engine";
import { getParams } from "./params";
import { expectedKinds } from "./attachments";

/** Le libellé de chaque fait et ce qu'il constate — affiché en regard du contrôle. */
export const FACT_LABEL: Record<FactKey, string> = {
  builtIn: "Intégré au code de l'application",
  pinConfigured: "Code de validation défini pour la société",
  rolesSegregated: "Au moins deux comptes actifs de rôles distincts",
  loginAuditActive: "Journal des connexions alimenté",
  allDeclaredCnss: "Tous les salariés présents ont un numéro CNSS",
  noSubSmig: "Aucun salarié présent sous le minimum du régime",
  exitDocumented: "Toute sortie porte une date et un motif",
  exemptionsDocumented: "Toute exonération est couverte par une convention au dossier",
  cinOnFile: "CIN au dossier pour tous les salariés présents",
  ribOnFile: "RIB au dossier pour tous les salariés payés par banque",
  medicalOnFile: "Aptitude médicale au dossier pour les mineurs et les postes dangereux",
  bankBaselineSet: "Base de référence des RIB établie",
  payrollValidated: "La dernière période close est validée",
  accountingLocked: "Les écritures de la dernière période validée sont verrouillées",
  docArchiveActive: "Au moins un document produit est archivé en PDF",
  declarationsOnTime: "Aucune période validée ne dépasse son échéance de déclaration",
  noMinorAlert: "Aucun mineur employé sans pièce d'aptitude",
  declaredProven: "Preuve écrite fournie à la saisie",
};

/** Salaire mensuel minimum légal du régime — repris de `params.ts`, jamais en dur. */
function regimeMonthlyMin(regime: Firm["regime"], year: number): number {
  const p = getParams(year);
  const v = regime === "SMAG" ? p.smagDaily * p.smagMonthlyDays : p.smigHourly * p.legalMonthlyHours;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Salarié présent à la date d'arrêté : actif et non sorti. */
function isPresent(e: Employee, asOf: string): boolean {
  if (e.exit_date && e.exit_date <= asOf) return false;
  return e.is_active;
}

/** Mois précédent celui de `asOf`, en { year, month } — c'est la dernière période « close ». */
export function previousMonth(asOf: string): { year: number; month: number } {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

/**
 * Une période validée doit être déclarée au plus tard le 10 du mois suivant (échéance DAMANCOM).
 * Renvoie `true` si l'échéance est dépassée à la date d'arrêté.
 */
export function declarationOverdue(year: number, month: number, asOf: string): boolean {
  const dueYear = month === 12 ? year + 1 : year;
  const dueMonth = month === 12 ? 1 : month + 1;
  const due = `${dueYear}-${String(dueMonth).padStart(2, "0")}-10`;
  return asOf > due;
}

/**
 * Constate tous les faits pour une société. `asOf` (ISO « AAAA-MM-JJ ») est la date d'arrêté.
 *
 * Règle de lecture : en l'absence de matière (aucun salarié, aucune période), un fait n'est PAS
 * réputé vrai par défaut. Un dispositif vide ne prouve rien — le crediter reviendrait à afficher
 * une maîtrise que rien ne soutient, ce qui est exactement le travers qu'une cartographie doit
 * éviter.
 */
export function collectRiskFacts(s: AppState, firm: Firm, asOf: string): RiskFacts {
  const employees = s.employees.filter((e) => e.firm_id === firm.id);
  const present = employees.filter((e) => isPresent(e, asOf));
  const attachments = (s.attachments ?? []).filter((a) => a.firm_id === firm.id);
  const kindsOf = (empId: string) => new Set(attachments.filter((a) => a.employee_id === empId).map((a) => a.kind));

  const year = Number(asOf.slice(0, 4));
  const minMonthly = regimeMonthlyMin(firm.regime, year);

  /** Tous les salariés du sous-ensemble portent-ils la pièce ? Faux si le sous-ensemble est vide. */
  const allHave = (subset: Employee[], kind: string): boolean =>
    subset.length > 0 && subset.every((e) => kindsOf(e.id).has(kind as never));

  const paidByBank = present.filter(
    (e) => e.payment_mode === "virement" || e.payment_mode === "cheque" || !!e.bank_rib?.trim(),
  );
  const needMedical = present.filter((e) => expectedKinds(e, asOf).includes("medical"));
  const exempt = present.filter(
    (e) => e.contract_type === "ANAPEC" || e.contract_type === "Stagiaire" || (e.cnss_exemption && e.cnss_exemption !== "none"),
  );
  const exited = employees.filter((e) => !!e.exit_date || !!e.exit_reason);

  const periods = s.periods.filter((p) => p.firm_id === firm.id);
  const prev = previousMonth(asOf);
  const lastClosed = periods.find((p) => p.year === prev.year && p.month === prev.month);
  const closures = (s.accountingClosures ?? []).filter((cl) => cl.firm_id === firm.id);

  // Une période validée mais non déclarée dont l'échéance est passée : le contrôle ne tient plus.
  const overdue = periods.some(
    (p) => p.status === "validated" && declarationOverdue(p.year, p.month, asOf),
  );

  const activeUsers = (s.users ?? []).filter((u) => u.is_active);
  const distinctRoles = new Set(activeUsers.map((u) => u.role));

  return {
    pinConfigured: !!firm.validation_pin_hash,
    rolesSegregated: activeUsers.length >= 2 && distinctRoles.size >= 2,
    loginAuditActive: (s.loginEvents ?? []).length > 0,

    allDeclaredCnss: present.length > 0 && present.every((e) => !!e.cnss_number?.trim()),
    noSubSmig: present.length > 0 && present.every((e) => e.base_hourly_rate * e.monthly_hours >= minMonthly - 0.01),
    exitDocumented: exited.length > 0 && exited.every((e) => !!e.exit_date && !!e.exit_reason),
    exemptionsDocumented: allHave(exempt, "anapec"),
    cinOnFile: allHave(present, "cin"),
    ribOnFile: allHave(paidByBank, "rib"),
    medicalOnFile: allHave(needMedical, "medical"),
    // Aucun mineur employé = pas d'exposition ; s'il y en a, la pièce doit être là.
    noMinorAlert: needMedical.length === 0 || allHave(needMedical, "medical"),

    bankBaselineSet: (s.bankBaseline ?? []).some((b) => b.firm_id === firm.id),

    payrollValidated: !!lastClosed && lastClosed.status !== "draft",
    accountingLocked: closures.length > 0,
    docArchiveActive: (s.docGenerations ?? []).some((d) => d.firm_id === firm.id && !!d.archive),
    declarationsOnTime: periods.length > 0 && !overdue,
  };
}
