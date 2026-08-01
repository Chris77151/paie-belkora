/**
 * Registre des mouvements de main-d'œuvre — moteur PUR (skill `registre-personnel-maroc`).
 *
 * Restitue, pour une société et une période, **toute personne ayant travaillé** — déclarée à la
 * CNSS ou non, encore présente ou sortie — avec sa catégorie, ses dates d'entrée et de sortie,
 * son ancienneté et son **statut de déclaration** calculé à une date d'arrêté.
 *
 * CE QUE CE REGISTRE EST — un outil de pilotage et de conformité. Il porte exactement la donnée
 * du **certificat de travail** (art. 24 : date d'entrée, date de sortie, postes occupés) et il
 * alimente le livre de paie et les déclarations CNSS.
 *
 * CE QU'IL N'EST PAS — un registre légal autonome. Le droit marocain ne connaît pas de
 * « registre unique du personnel » à la française : les obligations sont distinctes (livre de
 * paie art. 371, conservation ≥ 2 ans art. 373, registre des congés art. 246). Ce registre ne
 * s'y substitue pas, et le document exporté doit le dire.
 *
 * RÈGLES DE CONCEPTION
 * - **Fonction pure** : la date d'arrêté est un PARAMÈTRE, jamais `new Date()` implicite. Sans
 *   cela le registre n'est ni testable ni reproductible d'une édition à l'autre.
 * - **Aucun délai ni montant en dur** : tout vient de `params.ts` (`RegistreParams`).
 * - **Aucune donnée sensible** : ni salaire, ni RIB. Un registre circule (inspection,
 *   expert-comptable, direction) — principe de minimisation, loi 09-08 / CNDP.
 * - **La non-déclaration est un constat**, jamais un statut neutre : elle est datée, chiffrée
 *   et rattachée à son action de régularisation.
 */
import type { AppState, Employee, ContractType } from "@/data/types";
import { employeesOfFirm } from "@/data/store";
import { getParams, type RegistreParams } from "./params";
import { DEPARTURE_REASONS, type DepartureReason } from "./stc-engine";

/* ------------------------------------------------------------------ statut de déclaration ------------------------------------------------------------------ */

/**
 * Les quatre états possibles d'un salarié au regard de la déclaration CNSS.
 *
 * `derogatoire` n'est ni conforme ni non conforme : c'est une **attente de pièce**. Le compter
 * comme conforme masquerait le risque réel ; le compter comme non conforme accuserait à tort.
 */
export type DeclarationStatus = "declare" | "delai_en_cours" | "hors_delai" | "derogatoire";

export const DECLARATION_LABEL: Record<DeclarationStatus, string> = {
  declare: "Déclaré",
  delai_en_cours: "Délai en cours",
  hors_delai: "Hors délai",
  derogatoire: "Régime dérogatoire — à confirmer",
};

/**
 * Catégories dont l'obligation de déclaration dépend d'une convention et ne peut donc pas être
 * tranchée par le moteur.
 *
 * ATTENTION — piège fréquent : les dispositifs ANAPEC (Idmaj, Tahfiz) exonèrent de
 * **cotisations**, PAS de **déclaration**. Un salarié ANAPEC doit figurer au registre AVEC son
 * numéro CNSS : il relève donc du droit commun ci-dessous, jamais du régime dérogatoire.
 * L'intérim est déclaré par l'entreprise de travail temporaire, pas par l'utilisateur.
 */
const DEROGATOIRE: ReadonlySet<ContractType> = new Set<ContractType>(["Stagiaire", "Interim"]);

/** Nombre de jours calendaires entre deux dates ISO (positif si `to` est postérieur). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Statut de déclaration d'un salarié à la date d'arrêté.
 *
 * Un numéro CNSS renseigné suffit à établir `declare` : le moteur ne présume pas de la validité
 * du numéro, il constate sa présence. Sans numéro, l'échéance vient du référentiel.
 */
export function declarationStatus(
  e: Employee,
  asOf: string,
  p: RegistreParams,
): { status: DeclarationStatus; days: number } {
  if ((e.cnss_number ?? "").trim()) return { status: "declare", days: 0 };
  if (DEROGATOIRE.has(e.contract_type)) return { status: "derogatoire", days: 0 };
  const elapsed = daysBetween(e.hire_date, asOf);
  const overdue = elapsed - p.declarationDeadlineDays;
  return overdue > 0
    ? { status: "hors_delai", days: overdue }
    : { status: "delai_en_cours", days: -overdue };
}

/**
 * Ordre de grandeur de l'exposition financière d'un salarié non immatriculé (DH).
 *
 * ORDRE DE GRANDEUR, jamais un calcul exact : le poste dominant est le **rappel des cotisations
 * depuis la date réelle d'embauche**, hors périmètre de ce moteur car il dépend des salaires
 * réellement versés. Ce montant ne doit donc jamais être présenté comme le coût total.
 */
export function exposureEstimate(overdueDays: number, p: RegistreParams): number {
  if (overdueDays <= 0) return 0;
  const months = Math.floor(overdueDays / 30);
  const extra = months > p.seuilRetardMois ? (months - p.seuilRetardMois) * p.majorationRetardMensuelleParSalarie : 0;
  return p.amendeNonImmatriculationParSalarie + extra;
}

/* ------------------------------------------------------------------ lignes du registre ------------------------------------------------------------------ */

/** Une ligne du registre — une personne, sur la période. Aucune donnée sensible. */
export interface RegisterRow {
  employeeId: string;
  matricule: string;
  nom: string;
  cin: string;
  cnss: string;
  birthDate: string;
  category: ContractType;
  /** Régime d'exonération de cotisations, s'il y en a un (n'exonère JAMAIS de déclaration). */
  exemption?: string;
  position: string;
  site: string;
  hireDate: string;
  /** Date de sortie effective, ou "" si toujours présent à la date d'arrêté. */
  exitDate: string;
  exitReason: string;
  /** Ancienneté en jours à la date de sortie, ou à la date d'arrêté si toujours présent. */
  seniorityDays: number;
  declaration: DeclarationStatus;
  /** Jours de retard si `hors_delai`, jours restants si `delai_en_cours`, sinon 0. */
  declarationDays: number;
  /** Le salarié est-il mineur à la date d'arrêté ? */
  minor: boolean;
  /**
   * Présent dans l'effectif À LA DATE D'ARRÊTÉ.
   * Se calcule par comparaison de dates, jamais par « a une date de sortie » : une sortie
   * planifiée POSTÉRIEURE à l'arrêté (préavis en cours, CDD à échoir) laisse le salarié dans
   * l'effectif du jour de l'arrêté.
   */
  present: boolean;
  /** Entré pendant la période demandée. */
  entrantInPeriod: boolean;
  /** Sorti pendant la période demandée. */
  leaverInPeriod: boolean;
}

/** Indicateurs de mouvement de la période. */
export interface RegisterKpis {
  /** Effectif présent à la date d'arrêté. */
  headcount: number;
  /** Parmi l'effectif présent, combien portent un n° CNSS. */
  declared: number;
  /**
   * Écart entre effectif réel et effectif déclaré — l'indicateur central du registre.
   * Un registre qui ne montrerait que les déclarés reproduirait la vue CNSS et ne servirait à rien.
   */
  gap: number;
  entries: number;
  exits: number;
  /** Turnover de la période = ((entrées + sorties) / 2) / effectif moyen. */
  turnover: number;
  /** Formule affichée avec la valeur : un turnover sans sa définition n'est pas comparable. */
  turnoverFormula: string;
  /** Ancienneté moyenne de l'effectif présent, en années. */
  avgSeniorityYears: number;
  /** Sorties de la période ventilées par motif. */
  exitsByReason: { reason: string; count: number }[];
}

/** Constat de non-conformité issu du registre. */
export interface RegisterFinding {
  employeeId: string;
  nom: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  /** Base légale — uniquement des références vérifiées. */
  legal: string;
  action: string;
  /** Ordre de grandeur de l'exposition (DH), 0 si non chiffrable. */
  exposure: number;
}

export interface StaffRegister {
  rows: RegisterRow[];
  kpis: RegisterKpis;
  findings: RegisterFinding[];
  /** Date d'arrêté effectivement utilisée (ISO) — figure sur l'export. */
  asOf: string;
  from: string;
  to: string;
  /** Mention de source des délais/sanctions, à afficher avec toute échéance. */
  sourceNote: string;
}

export interface RegisterOptions {
  /** Début de la période observée (ISO). */
  from: string;
  /** Fin de la période observée (ISO) — sert aussi de date d'arrêté. */
  to: string;
  /** Restreindre à une catégorie de contrat. */
  category?: ContractType;
  /** Restreindre à un statut de déclaration. */
  declaration?: DeclarationStatus;
}

const nz = (v?: string | null) => (v ?? "").trim();

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  DEPARTURE_REASONS.map((r) => [r.value, r.label]),
);

const EXEMPTION_LABEL: Record<string, string> = {
  totale: "Exonération totale (stage)",
  patronale: "Exonération patronale (TAHFIZ / IDMAJ)",
};

/** Date de sortie effective : `exit_date` fait foi ; un salarié inactif sans date reste signalé. */
function effectiveExit(e: Employee): string {
  return nz(e.exit_date);
}

/** Le salarié fait-il partie de l'effectif présent à la date d'arrêté ? */
function presentAt(e: Employee, asOf: string): boolean {
  if (daysBetween(e.hire_date, asOf) < 0) return false; // pas encore entré
  const exit = effectiveExit(e);
  if (exit) return daysBetween(exit, asOf) < 0; // sorti avant l'arrêté
  return e.is_active;
}

/** Le salarié a-t-il travaillé, ne serait-ce qu'un jour, dans l'intervalle [from, to] ? */
function workedInPeriod(e: Employee, from: string, to: string): boolean {
  if (daysBetween(e.hire_date, to) < 0) return false; // entré après la fin de période
  const exit = effectiveExit(e);
  if (exit && daysBetween(from, exit) < 0) return false; // sorti avant le début de période
  return true;
}

function ageAt(birthIso: string, asOf: string): number | null {
  if (!nz(birthIso)) return null;
  return daysBetween(birthIso, asOf) / 365.25;
}

/**
 * Construit le registre des mouvements.
 *
 * Le périmètre est **toute personne ayant travaillé sur la période**, sortants inclus : un
 * registre qui n'afficherait que l'effectif courant perdrait la traçabilité des départs, qui est
 * précisément ce que contrôle l'inspection.
 */
export function buildStaffRegister(s: AppState, firmId: string, opts: RegisterOptions): StaffRegister {
  const asOf = opts.to;
  const p = getParams(new Date(asOf).getFullYear() || new Date(opts.from).getFullYear()).registre;

  const all = employeesOfFirm(s, firmId).filter((e) => workedInPeriod(e, opts.from, opts.to));

  let rows: RegisterRow[] = all.map((e) => {
    const exit = effectiveExit(e);
    const { status, days } = declarationStatus(e, asOf, p);
    const end = exit || asOf;
    const age = ageAt(nz(e.birth_date), asOf);
    return {
      employeeId: e.id,
      matricule: nz(e.matricule),
      nom: `${e.last_name} ${e.first_name}`.trim().toUpperCase(),
      cin: nz(e.cin),
      cnss: nz(e.cnss_number),
      birthDate: nz(e.birth_date),
      category: e.contract_type,
      exemption: e.cnss_exemption ? EXEMPTION_LABEL[e.cnss_exemption] : undefined,
      position: nz(e.position),
      site: nz(e.site),
      hireDate: e.hire_date,
      exitDate: exit,
      exitReason: e.exit_reason ? (REASON_LABEL[e.exit_reason] ?? e.exit_reason) : "",
      seniorityDays: Math.max(0, daysBetween(e.hire_date, end)),
      declaration: status,
      declarationDays: days,
      minor: age !== null && age < 18,
      present: presentAt(e, asOf),
      entrantInPeriod: daysBetween(opts.from, e.hire_date) >= 0,
      leaverInPeriod: !!exit && daysBetween(opts.from, exit) >= 0 && daysBetween(exit, opts.to) >= 0,
    };
  });

  if (opts.category) rows = rows.filter((r) => r.category === opts.category);
  if (opts.declaration) rows = rows.filter((r) => r.declaration === opts.declaration);

  // Tri : entrée la plus ancienne d'abord — c'est l'ordre d'un registre, pas un classement.
  rows.sort((a, b) => a.hireDate.localeCompare(b.hireDate) || a.nom.localeCompare(b.nom));

  return {
    rows,
    kpis: computeKpis(rows),
    findings: buildFindings(rows, p),
    asOf,
    from: opts.from,
    to: opts.to,
    sourceNote: p.sourceNote,
  };
}

function computeKpis(rows: RegisterRow[]): RegisterKpis {
  // Présence à la DATE D'ARRÊTÉ, et non « absence de date de sortie » : une sortie planifiée
  // au-delà de l'arrêté (préavis, CDD à échoir) laisse le salarié dans l'effectif.
  const present = rows.filter((r) => r.present);
  const entries = rows.filter((r) => r.entrantInPeriod).length;
  const exits = rows.filter((r) => r.leaverInPeriod).length;
  const declared = present.filter((r) => r.declaration === "declare").length;

  // Effectif moyen ≈ (effectif présent + sortants de la période) — évite une division par zéro
  // et reste honnête sur une période courte.
  const avgHeadcount = present.length + exits / 2;
  const turnover = avgHeadcount > 0 ? ((entries + exits) / 2) / avgHeadcount : 0;

  const byReason = new Map<string, number>();
  for (const r of rows.filter((x) => x.leaverInPeriod)) {
    const key = r.exitReason || "Motif non renseigné";
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }

  const seniority = present.map((r) => r.seniorityDays / 365.25);
  return {
    headcount: present.length,
    declared,
    gap: present.length - declared,
    entries,
    exits,
    turnover,
    turnoverFormula: "((entrées + sorties) / 2) / effectif moyen de la période",
    avgSeniorityYears: seniority.length ? seniority.reduce((a, b) => a + b, 0) / seniority.length : 0,
    exitsByReason: [...byReason.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Constats de non-conformité.
 *
 * Ne contient QUE des références légales vérifiées. Un article inventé dans un document présenté
 * à l'inspection du travail est pire que pas de référence du tout.
 */
function buildFindings(rows: RegisterRow[], p: RegistreParams): RegisterFinding[] {
  const out: RegisterFinding[] = [];
  for (const r of rows) {
    if (r.declaration === "hors_delai") {
      out.push({
        employeeId: r.employeeId,
        nom: r.nom,
        severity: "critical",
        title: "Salarié non immatriculé à la CNSS",
        detail:
          `Entré le ${r.hireDate}, aucun numéro CNSS au ${r.exitDate || "jour de l'arrêté"} — `
          + `${r.declarationDays} jour(s) au-delà du délai de référence (${p.declarationDeadlineDays} j).`,
        legal: "Dahir n° 1-72-184 du 27/07/1972 (régime de sécurité sociale) — obligation d'immatriculation",
        action:
          "Immatriculer sans délai via DAMANCOM et régulariser les cotisations depuis la date réelle "
          + "d'embauche. Rapprocher du bordereau BDS de la période.",
        exposure: exposureEstimate(r.declarationDays, p),
      });
    }
    if (r.declaration === "derogatoire") {
      out.push({
        employeeId: r.employeeId,
        nom: r.nom,
        severity: "warning",
        title: "Statut de déclaration à confirmer",
        detail:
          `Catégorie « ${r.category} » : l'obligation de déclaration dépend de la convention `
          + "(convention de stage, contrat de mise à disposition). Le registre ne tranche pas seul.",
        legal: "À confirmer — convention applicable et régime CNSS de la catégorie",
        action:
          "Joindre la convention au dossier et trancher le statut. Ne pas compter ce salarié comme "
          + "conforme tant que la pièce n'est pas au dossier.",
        exposure: 0,
      });
    }
    if (r.minor) {
      out.push({
        employeeId: r.employeeId,
        nom: r.nom,
        severity: "warning",
        title: "Salarié mineur",
        detail: `Né le ${r.birthDate} — contrôles spécifiques applicables (autorisation, aptitude, travaux interdits).`,
        legal: "Code du travail, loi 65-99 — dispositions relatives au travail des mineurs",
        action: "Vérifier l'autorisation du représentant légal et l'aptitude médicale au dossier.",
        exposure: 0,
      });
    }
    if (!r.cin) {
      out.push({
        employeeId: r.employeeId,
        nom: r.nom,
        severity: "warning",
        title: "CIN absente du dossier",
        detail: "Identité incomplète : le registre et la carte de travail ne peuvent pas être servis.",
        legal: "Code du travail, art. 23 — carte de travail",
        action: "Récupérer la CIN et compléter le dossier du salarié.",
        exposure: 0,
      });
    }
    if (r.exitDate && !r.exitReason) {
      out.push({
        employeeId: r.employeeId,
        nom: r.nom,
        severity: "warning",
        title: "Sortie sans motif renseigné",
        detail: `Sortie au ${r.exitDate} sans motif — le certificat de travail et le solde de tout compte ne peuvent être établis.`,
        legal: "Code du travail, art. 24 — certificat de travail (entrée, sortie, postes occupés)",
        action: "Renseigner le motif de départ, puis établir le certificat de travail et le solde de tout compte.",
        exposure: 0,
      });
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

/* ------------------------------------------------------------------ mouvements ------------------------------------------------------------------ */

/** Un mouvement daté : une entrée ou une sortie. */
export interface Movement {
  date: string;
  kind: "entree" | "sortie";
  employeeId: string;
  nom: string;
  category: ContractType;
  position: string;
  /** Motif, pour une sortie. */
  reason: string;
  /** Statut de déclaration du salarié — une entrée non déclarée se voit dès la chronologie. */
  declaration: DeclarationStatus;
}

/** Mois de mouvements, pour la lecture chronologique du registre. */
export interface MovementMonth {
  /** Clé « AAAA-MM ». */
  month: string;
  entries: number;
  exits: number;
  /** Solde du mois (entrées − sorties). */
  net: number;
  movements: Movement[];
}

/**
 * Chronologie des mouvements de la période, groupée par mois.
 *
 * Vue complémentaire du registre nominatif : celui-ci répond « qui est là », celle-ci répond
 * « qu'est-ce qui a bougé, et quand » — c'est la lecture d'un contrôleur qui remonte une période.
 */
export function buildMovements(r: StaffRegister): MovementMonth[] {
  const all: Movement[] = [];
  for (const x of r.rows) {
    if (x.entrantInPeriod) {
      all.push({
        date: x.hireDate, kind: "entree", employeeId: x.employeeId, nom: x.nom,
        category: x.category, position: x.position, reason: "", declaration: x.declaration,
      });
    }
    if (x.leaverInPeriod) {
      all.push({
        date: x.exitDate, kind: "sortie", employeeId: x.employeeId, nom: x.nom,
        category: x.category, position: x.position,
        reason: x.exitReason || "Motif non renseigné", declaration: x.declaration,
      });
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom));

  const byMonth = new Map<string, Movement[]>();
  for (const m of all) {
    const key = m.date.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(m);
    else byMonth.set(key, [m]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, movements]) => {
      const entries = movements.filter((m) => m.kind === "entree").length;
      const exits = movements.length - entries;
      return { month, entries, exits, net: entries - exits, movements };
    });
}

/* ------------------------------------------------------------------ registres légaux ------------------------------------------------------------------ */

/** Degré de couverture d'une obligation par l'application. */
export type CoverageState = "couvert" | "partiel" | "non_couvert";

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  couvert: "Couvert par l'application",
  partiel: "Partiellement couvert",
  non_couvert: "Non couvert — à tenir séparément",
};

/** Une obligation de tenue de registre / document, et son état réel. */
export interface LegalRegisterStatus {
  key: string;
  name: string;
  /** Base légale — uniquement des références vérifiées. */
  legal: string;
  /** Ce que la loi impose. */
  requirement: string;
  coverage: CoverageState;
  /** Ce que l'application fait — et ce qu'elle ne fait pas. */
  detail: string;
  action: string;
}

/**
 * État des obligations de tenue, honnêtement.
 *
 * Ce panneau existe pour éviter le pire défaut d'un logiciel RH : laisser croire qu'il couvre
 * une obligation qu'il ne couvre pas. Un « non couvert » affiché vaut mieux qu'un silence.
 */
export function legalRegisters(r: StaffRegister): LegalRegisterStatus[] {
  const sansCin = r.rows.filter((x) => !x.cin).length;
  const sortiesSansMotif = r.rows.filter((x) => x.exitDate && !x.exitReason).length;
  const nonImmatricules = r.rows.filter((x) => x.declaration === "hors_delai").length;
  const aConfirmer = r.rows.filter((x) => x.declaration === "derogatoire").length;

  return [
    {
      key: "livre_paie",
      name: "Livre de paie",
      legal: "Code du travail, art. 371 (modèle fixé par décret) — conservation ≥ 2 ans, art. 373",
      requirement: "Tenu dans chaque établissement, conforme au modèle réglementaire.",
      coverage: "non_couvert",
      detail:
        "L'application produit les bulletins de paie et les écritures comptables, mais PAS le livre "
        + "de paie au modèle réglementaire. Les bulletins n'en tiennent pas lieu.",
      action: "Tenir le livre de paie séparément et le conserver au moins 2 ans après sa clôture.",
    },
    {
      key: "registre_conges",
      name: "Registre des congés payés",
      legal: "Code du travail, art. 246",
      requirement: "Consigner les départs en congé annuel payé.",
      coverage: "partiel",
      detail:
        "Les congés sont saisis dans l'application (volet Congés) et les soldes calculés, mais aucun "
        + "registre formel n'en est édité.",
      action: "Éditer le registre des congés à partir des données saisies, ou le tenir séparément.",
    },
    {
      key: "carte_travail",
      name: "Carte de travail",
      legal: "Code du travail, art. 23",
      requirement: "Délivrée à tout salarié.",
      coverage: "non_couvert",
      detail:
        `Les données nécessaires sont au dossier, mais l'application n'édite pas la carte de travail. `
        + `${sansCin} salarié(s) du registre n'ont pas de CIN renseignée.`,
      action: "Compléter les CIN manquantes puis délivrer les cartes de travail.",
    },
    {
      key: "certificat_travail",
      name: "Certificat de travail",
      legal: "Code du travail, art. 24 — date d'entrée, date de sortie, postes occupés (exclusivement)",
      requirement: "Délivré à la cessation du contrat.",
      coverage: sortiesSansMotif > 0 ? "partiel" : "couvert",
      detail:
        "L'application produit le certificat de travail (volet Documents RH) à partir des données du registre."
        + (sortiesSansMotif > 0
          ? ` ${sortiesSansMotif} sortie(s) sans motif renseigné bloquent son établissement.`
          : ""),
      action:
        sortiesSansMotif > 0
          ? "Renseigner les motifs de sortie manquants, puis délivrer les certificats."
          : "Délivrer le certificat à chaque sortie.",
    },
    {
      key: "cnss",
      name: "Immatriculation et déclaration CNSS",
      legal: "Dahir n° 1-72-184 du 27/07/1972 relatif au régime de sécurité sociale",
      requirement: "Affilier l'entreprise et immatriculer chaque salarié.",
      coverage: nonImmatricules > 0 || aConfirmer > 0 ? "partiel" : "couvert",
      detail:
        `${r.kpis.declared} salarié(s) déclaré(s) sur ${r.kpis.headcount} présent(s). `
        + `${nonImmatricules} hors délai, ${aConfirmer} en régime dérogatoire à confirmer.`,
      action:
        nonImmatricules > 0
          ? "Immatriculer via DAMANCOM et régulariser les cotisations depuis la date réelle d'embauche."
          : "Maintenir le rapprochement entre effectif réel et bordereau BDS.",
    },
    {
      key: "registre_mouvements",
      name: "Registre des mouvements (le présent registre)",
      legal: "Aucune obligation autonome — outil de pilotage",
      requirement:
        "Le droit marocain ne prévoit pas de « registre unique du personnel » à la française. "
        + "Ce registre reprend la donnée du certificat de travail et alimente les autres obligations.",
      coverage: "couvert",
      detail: "Édité par l'application, arrêté à une date, exportable en PDF et en tableur.",
      action: "Arrêter et faire signer le registre à chaque contrôle ou à chaque clôture de période.",
    },
  ];
}

/**
 * Mention portée sur tout export : le registre ne se substitue à aucun registre légal.
 * L'omettre créerait une fausse sécurité juridique chez le lecteur.
 */
export const REGISTER_DISCLAIMER =
  "Registre de pilotage des mouvements de main-d'œuvre. Il reprend les données du certificat de "
  + "travail (art. 24 : date d'entrée, date de sortie, postes occupés) et alimente les déclarations "
  + "CNSS, mais il NE SE SUBSTITUE PAS au livre de paie (art. 371, conservation ≥ 2 ans art. 373) "
  + "ni au registre des congés payés (art. 246), qui restent tenus séparément.";

/** Libellés des catégories, pour les filtres et les exports. */
export const CATEGORY_LABEL: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  ANAPEC: "ANAPEC (Idmaj / Tahfiz)",
  Interim: "Intérim",
  Stagiaire: "Stagiaire",
};

export type { DepartureReason };
