/**
 * Formulaire exhaustif d'évaluation des risques — plan d'action 2.4 + Tableau 13.
 *
 * Source : plan d'action du mémoire (8 risques prioritaires + 8 en vigilance,
 * 16 fiches : responsable, échéance, objectif, mise en œuvre ; Tableau 13 :
 * indicateur, nature exposition/avéré, collecte auto/manuel, seuil, responsable).
 * Méthode : fiches d'indicateurs clés sur le modèle de Lakrari (2013), résiduel
 * CALCULÉ jamais déclaré (skills `risk-management-paie` et
 * `dispositif-gestion-risques-memoire`).
 *
 * Règle d'honnêteté tenue dans tout le module :
 *  - les 11 risques du référentiel applicatif sont évalués EN DIRECT (brut,
 *    dispositif prouvé, résiduel) et leurs indicateurs sont RELUS dans l'état ;
 *  - les 5 risques hors référentiel (R26, R27, R28, R29, R30) portent une cotation
 *    « à valider en atelier avec la direction » — le mémoire lui-même retient
 *    comme limite n° 1 que les cotations n'ont pas été validées en atelier ;
 *  - un indicateur non constatable dans l'app reste MANUEL, avec son champ à
 *    renseigner sur le formulaire — jamais une valeur inventée.
 */
import type {
  AppState, Employee, Firm, PayrollPeriod, Payslip,
} from "@/data/types";
import {
  CATEGORY_LABEL, RISK_CATALOGUE, STEP_LABEL,
  type AssessedRisk, type RiskCategory, type RiskStep,
} from "./risk-engine";
import { LEVEL_LABEL, type RiskLevel } from "./risk-params";
import { getParams } from "./params";
import { seniorityYears } from "./payroll-engine";
import { declarationOverdue } from "./risk-facts";
import { buildSettlementReport } from "./payroll-settlement";

/* ============================================================ plan d'action 2.4 ============================================================ */

export type EvalPlan = 1 | 2;
export type EvalEcheance = "immediat" | "1mois" | "3mois" | "6mois";
export type IndicatorNature = "Exposition" | "Risque avéré";
export type IndicatorCollecte = "Automatique" | "Manuel" | "Mixte";

export interface EvalIndicator {
  libelle: string;
  nature: IndicatorNature;
  collecte: IndicatorCollecte;
  /** Mention de collecte : d'où vient (ou viendra) la valeur. */
  collecteNote: string;
  seuil: string;
  responsableSuivi: string;
}

export interface EvalActionDef {
  /** Numéro d'action du plan (1-16). */
  action: number;
  ref: string;
  plan: EvalPlan;
  titre: string;
  responsable: string;
  echeance: EvalEcheance;
  echeanceLabel: string;
  objectif: string;
  miseEnOeuvre: string[];
  vigilance?: string;
  indicateur: EvalIndicator;
  /** Clé de calcul live, ou null = indicateur purement manuel (champ à renseigner). */
  live: string | null;
}

const AUTO_APP = "Données de l'application, relues à la date d'arrêté.";

export const EVAL_ACTIONS: EvalActionDef[] = [
  /* ------------------------------------------ plan 1 : huit risques prioritaires ------------------------------------------ */
  {
    action: 1, ref: "R14", plan: 1, titre: "Séparer la production et la validation de la paie",
    responsable: "Président du groupe", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Faire valider chaque paie par une personne autre que celle qui la produit.",
    miseEnOeuvre: [
      "Désigner une seconde personne chargée de la validation.",
      "Lui attribuer le profil de validation déjà défini dans l'application et lui remettre le code de validation.",
      "Retirer ce droit au compte du gestionnaire de paie.",
      "Vérifier dans le journal des événements que la paie suivante a été validée par ce second compte.",
    ],
    indicateur: {
      libelle: "Part des validations de paie faites par un compte distinct de celui qui produit la paie",
      nature: "Exposition", collecte: "Manuel",
      collecteNote: "À constater : l'application ne trace pas l'auteur de chaque validation — vérifier au journal et aux clôtures.",
      seuil: "Inférieure à 100 %", responsableSuivi: "Président du groupe",
    },
    live: null,
  },
  {
    action: 2, ref: "R16", plan: 1, titre: "Prouver chaque salaire réglé en espèces",
    responsable: "Gérante (employeur)", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Conserver une preuve signée de chaque paiement en espèces.",
    miseEnOeuvre: [
      "Éditer, à chaque paiement en espèces, l'état de règlement nominatif que l'application produit déjà.",
      "Le faire signer par chaque salarié au moment de la remise.",
      "Rattacher l'état signé à la période dans l'application et en conserver l'original.",
    ],
    indicateur: {
      libelle: "Périodes réglées en espèces sans état d'émargement rattaché",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Périodes validées des 12 derniers mois avec règlement espèces, sans pièce « fiche d'émargement signée » sur la période.`,
      seuil: "Supérieur à 0", responsableSuivi: "Gérante (employeur)",
    },
    live: "R16",
  },
  {
    action: 3, ref: "R10", plan: 1, titre: "Régulariser la prime d'ancienneté",
    responsable: "Gestionnaire de paie", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Verser la prime d'ancienneté à chaque salarié qui y a droit.",
    miseEnOeuvre: [
      "Reprendre les bulletins qui portent la prime désactivée alors que le droit est ouvert.",
      "Rechercher pour chaque salarié un motif écrit de désactivation.",
      "Calculer et verser le rappel lorsque la désactivation n'est pas justifiée.",
      "Exiger ensuite un motif écrit pour toute nouvelle désactivation.",
    ],
    indicateur: {
      libelle: "Bulletins portant une prime d'ancienneté désactivée alors que le droit est ouvert",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Bulletins calculés des 12 derniers mois : ancienneté ≥ 2 ans et prime désactivée sur la fiche.`,
      seuil: "Supérieur à 0", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R10",
  },
  {
    action: 4, ref: "R22", plan: 1, titre: "Rattacher les pièces justificatives aux écritures de paie",
    responsable: "Comptabilité", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Que chaque écriture de paie puisse être justifiée par ses pièces en cas de contrôle.",
    miseEnOeuvre: [
      "Joindre à chaque écriture exportée le livre de paie de la période et le bordereau CNSS correspondant.",
      "Vérifier à la clôture mensuelle que chaque écriture porte ses deux pièces.",
      "Compléter les écritures déjà passées.",
    ],
    indicateur: {
      libelle: "Écritures de paie exportées sans pièce justificative rattachée",
      nature: "Risque avéré", collecte: "Manuel",
      collecteNote: "À constater : aucune pièce n'est aujourd'hui rattachée aux écritures dans l'application.",
      seuil: "Supérieur à 0", responsableSuivi: "Comptabilité",
    },
    live: null,
  },
  {
    action: 5, ref: "R27", plan: 1, titre: "Renseigner les charges de famille",
    responsable: "Gestionnaire de paie", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Retenir l'impôt sur le revenu en tenant compte des personnes à charge.",
    miseEnOeuvre: [
      "Recueillir auprès de chaque salarié présent sa situation familiale et la pièce qui la justifie.",
      "Renseigner les personnes à charge dans sa fiche.",
      "Recalculer l'impôt retenu et restituer l'excédent.",
      "Recueillir cette information dès l'embauche pour les nouveaux salariés.",
    ],
    indicateur: {
      libelle: "Salariés présents dont la situation familiale n'est pas renseignée",
      nature: "Exposition", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Fiches des salariés présents sans situation de famille.`,
      seuil: "Supérieur à 0", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R27",
  },
  {
    action: 6, ref: "R24", plan: 1, titre: "Prouver la remise des documents sensibles",
    responsable: "Gestionnaire de paie", echeance: "3mois", echeanceLabel: "Sous trois mois",
    objectif: "Pouvoir établir que chaque document sensible a été remis au salarié.",
    miseEnOeuvre: [
      "Dresser la liste des documents concernés, dont les sanctions disciplinaires et le solde de tout compte.",
      "Faire signer un accusé de réception à chaque remise.",
      "Archiver le PDF du document dans l'application.",
    ],
    indicateur: {
      libelle: "Documents sensibles remis sans accusé de réception signé",
      nature: "Risque avéré", collecte: "Manuel",
      collecteNote: "À constater : l'accusé signé n'est rattaché ni au document ni au salarié — angle mort du dispositif.",
      seuil: "Supérieur à 0", responsableSuivi: "Gestionnaire de paie",
    },
    live: null,
  },
  {
    action: 7, ref: "R26", plan: 1, titre: "Payer les jours réellement travaillés",
    responsable: "Gestionnaire de paie", echeance: "3mois", echeanceLabel: "Sous trois mois",
    objectif: "Établir chaque bulletin sur les jours constatés et non sur une durée présumée.",
    miseEnOeuvre: [
      "Rapprocher chaque mois les jours relevés par le pointage des jours saisis dans l'outil.",
      "Remplacer la valeur par défaut de vingt-six jours par les jours constatés.",
      "Saisir dans l'outil les absences et les primes du mois, aujourd'hui suivies en dehors.",
    ],
    indicateur: {
      libelle: "Bulletins établis sur la valeur par défaut de vingt-six jours",
      nature: "Exposition", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Bulletins calculés des 12 derniers mois saisis à 26 jours — PROXY : 26 jours peut être le réel constaté.`,
      seuil: "Supérieur à 0", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R26",
  },
  {
    action: 8, ref: "R09", plan: 1, titre: "Payer les heures supplémentaires majorées",
    responsable: "Gestionnaire de paie", echeance: "3mois", echeanceLabel: "Sous trois mois",
    objectif: "Payer chaque heure supplémentaire avec la majoration prévue par le Code du travail.",
    miseEnOeuvre: [
      "Étendre le pointage aux chantiers ou, à défaut, tenir une feuille d'heures visée par le chef d'équipe.",
      "Reporter les heures supplémentaires dans l'outil à partir de cette feuille.",
      "Appliquer les taux de majoration de 25 à 100 % déjà inscrits au référentiel.",
    ],
    indicateur: {
      libelle: "Périodes dont les heures payées ne sont pas rapprochées du pointage",
      nature: "Exposition", collecte: "Manuel",
      collecteNote: "À constater : aucune pièce de pointage n'est rattachée aux périodes — angle mort du dispositif.",
      seuil: "Supérieur à 0", responsableSuivi: "Gestionnaire de paie",
    },
    live: null,
  },
  /* ------------------------------------------ plan 2 : huit risques en vigilance ------------------------------------------ */
  {
    action: 9, ref: "R04", plan: 2, titre: "Ramener chaque salaire au minimum légal",
    responsable: "Gestionnaire de paie", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Qu'aucune paie ne puisse être validée avec un salaire inférieur au SMIG pour la société ou au SMAG pour la pépinière.",
    miseEnOeuvre: [
      "Vérifier le taux de chaque salarié présent au regard du minimum de son régime.",
      "Corriger le taux en cause et verser le rappel sur les périodes concernées.",
      "Transformer l'alerte en règle bloquante à la validation de la période.",
    ],
    indicateur: {
      libelle: "Bulletins inférieurs au minimum par période",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Salariés présents sous le minimum du régime (constat mission : 29 bulletins sur 769, tous dans E1). Alerte dès le premier.`,
      seuil: "Supérieur à 0 (dès le premier bulletin)", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R04",
  },
  {
    action: 10, ref: "R18", plan: 2, titre: "Déclarer chaque période dans le délai",
    responsable: "Gestionnaire de paie", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Déposer chaque déclaration CNSS au plus tard le 10 du mois suivant.",
    miseEnOeuvre: [
      "Déclarer les périodes en retard et régler la majoration calculée par l'application (3 % le premier mois puis 1 % par mois).",
      "Inscrire l'échéance du 10 dans un calendrier partagé avec le président du groupe.",
      "Valider la paie de chaque entité avant cette date.",
    ],
    indicateur: {
      libelle: "Périodes déclarées dans le délai",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Périodes validées ayant dépassé l'échéance (constat mission : au moins une par entité). Alerte dès qu'une période dépasse le 10.`,
      seuil: "Alerte dès qu'une période dépasse le 10", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R18",
  },
  {
    action: 11, ref: "R29", plan: 2, titre: "Établir l'identité de chaque salarié avant sa première paie",
    responsable: "Gestionnaire de paie", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Qu'aucun salarié ne soit payé sans pièce d'identité conservée au dossier.",
    miseEnOeuvre: [
      "Réclamer la pièce aux salariés présents dont le dossier est incomplet.",
      "Faire du signalement existant un blocage de la première paie, saisonniers compris.",
    ],
    indicateur: {
      libelle: "Dossiers complets rapportés aux salariés présents",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Salariés présents sans CIN (constat mission : pièce manquante pour 246 bulletins sur 769 et 2 dossiers sur 10). Alerte en dessous de 100 %.`,
      seuil: "Alerte en dessous de 100 %", responsableSuivi: "Gestionnaire de paie",
    },
    live: "R29",
  },
  {
    action: 12, ref: "R03", plan: 2, titre: "Encadrer l'emploi des salariés de moins de dix-huit ans",
    responsable: "Gérante (employeur)", echeance: "immediat", echeanceLabel: "Immédiatement",
    objectif: "Qu'aucun salarié de moins de dix-huit ans ne soit payé sans l'autorisation de son représentant légal, le certificat d'aptitude et une affectation conforme au décret n° 2-04-682.",
    miseEnOeuvre: [
      "Vérifier la date de naissance, les pièces et les tâches confiées au salarié concerné.",
      "Consigner par écrit la décision de suspendre le recrutement de mineurs tant que l'autorisation ne peut pas être légalisée.",
      "Bloquer la première paie d'un mineur dont le dossier ne porte pas les deux pièces.",
    ],
    vigilance: "Obstacle externe constaté en mission : les services consultés ont refusé de légaliser l'autorisation du représentant légal — le recrutement de mineurs est donc suspendu par décision écrite, faute de pouvoir régulariser.",
    indicateur: {
      libelle: "Dossiers de mineurs complets rapportés aux mineurs présents",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Mineurs présents sans autorisation ou aptitude au dossier (constat mission : 1 mineur sans autorisation). Alerte en dessous de 100 %.`,
      seuil: "Alerte en dessous de 100 %", responsableSuivi: "Gérante (employeur)",
    },
    live: "R03",
  },
  {
    action: 13, ref: "R28", plan: 2, titre: "Rattacher chaque salarié à un site et à un poste",
    responsable: "Responsable de l'outil", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Imputer le coût de la main-d'œuvre aux chantiers et tenir un registre du personnel complet.",
    miseEnOeuvre: [
      "Compléter le site et le poste des salariés présents à partir du référentiel.",
      "Rendre ces deux champs obligatoires à la création d'une fiche.",
    ],
    indicateur: {
      libelle: "Part des bulletins portant un site et un poste",
      nature: "Exposition", collecte: "Automatique",
      collecteNote: `${AUTO_APP} PROXY sur fiches (constat mission sur bulletins : site manque sur 637/769, poste absent sur 338). Alerte en dessous de 100 %.`,
      seuil: "Alerte en dessous de 100 %", responsableSuivi: "Responsable de l'outil",
    },
    live: "R28",
  },
  {
    action: 14, ref: "R06", plan: 2, titre: "Justifier chaque exonération de cotisations",
    responsable: "Gérante (employeur)", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Que chaque exonération repose sur une convention conservée au dossier du salarié.",
    miseEnOeuvre: [
      "Rechercher pour chaque salarié exonéré la convention qui fonde l'exonération, contrat aidé ou stage.",
      "À défaut, rétablir les cotisations et régulariser les déclarations.",
      "Subordonner toute nouvelle exonération au rattachement de la convention.",
    ],
    indicateur: {
      libelle: "Exonérations appuyées d'une convention",
      nature: "Risque avéré", collecte: "Automatique",
      collecteNote: `${AUTO_APP} Salariés exonérés sans convention au dossier (constat mission : 10 bulletins en exonération totale, E1). Alerte en dessous de 100 %.`,
      seuil: "Alerte en dessous de 100 %", responsableSuivi: "Gérante (employeur)",
    },
    live: "R06",
  },
  {
    action: 15, ref: "R15", plan: 2, titre: "Autoriser toute modification des coordonnées bancaires",
    responsable: "Gestionnaire de paie", echeance: "1mois", echeanceLabel: "Sous un mois",
    objectif: "Qu'aucun virement ne parte vers un compte dont le changement n'a pas été demandé et confirmé par le salarié.",
    miseEnOeuvre: [
      "Vérifier la modification relevée auprès du salarié.",
      "Conserver au dossier le RIB délivré par la banque.",
      "Exiger une demande signée et la confirmer par un appel au numéro déjà connu du dossier avant d'enregistrer le changement.",
    ],
    indicateur: {
      libelle: "Modifications de RIB appuyées d'une demande signée",
      nature: "Risque avéré", collecte: "Manuel",
      collecteNote: "À constater au volet Sécurité RIB (constat mission : 1 modification attribuée sans pièce, E1). Alerte dès une modification non appuyée.",
      seuil: "Alerte dès une modification non appuyée", responsableSuivi: "Gestionnaire de paie",
    },
    live: null,
  },
  {
    action: 16, ref: "R30", plan: 2, titre: "Éprouver la sauvegarde et nommer les accès à la base",
    responsable: "Responsable de l'outil", echeance: "6mois", echeanceLabel: "Sous six mois",
    objectif: "Pouvoir reconstituer l'historique de paie et attribuer toute écriture directe dans la base à une personne.",
    miseEnOeuvre: [
      "Restaurer une sauvegarde hors production et comparer le livre de paie d'une période close.",
      "Consigner la date et le résultat du test.",
      "Remplacer l'accès partagé par des comptes nominatifs.",
    ],
    indicateur: {
      libelle: "Date du dernier test de restauration réussi",
      nature: "Exposition", collecte: "Manuel",
      collecteNote: "À renseigner (constat mission : aucun test, accès non nominatif). Alerte au-delà de douze mois.",
      seuil: "Alerte au-delà de douze mois", responsableSuivi: "Responsable de l'outil",
    },
    live: null,
  },
];

/* ============================================================ définitions hors référentiel applicatif ============================================================ */

/** Les 5 risques du mémoire absents du référentiel applicatif (R01–R25). */
export const EXTRA_DEFS: { ref: string; step: RiskStep; category: RiskCategory; event: string; basis: string }[] = [
  {
    ref: "R26", step: "calcul", category: "juridique_social",
    event: "Les bulletins sont établis sur la durée présumée de vingt-six jours au lieu des jours réellement travaillés → paie fausse à la hausse comme à la baisse, rappels et contentieux.",
    basis: "Code du travail (durée du travail) ; pointage",
  },
  {
    ref: "R27", step: "collecte", category: "fiscal",
    event: "La situation familiale n'est pas recueillie → l'impôt sur le revenu est retenu sans les déductions pour charges de famille → trop-perçu d'IR à restituer.",
    basis: "CGI (charges de famille)",
  },
  {
    ref: "R28", step: "collecte", category: "operationnel",
    event: "Ni le site ni le poste ne sont renseignés → le coût de la main-d'œuvre ne peut pas être imputé aux chantiers et le registre du personnel est incomplet.",
    basis: "Registre du personnel ; comptabilité analytique",
  },
  {
    ref: "R29", step: "collecte", category: "conformite_sociale",
    event: "Un salarié est payé sans pièce d'identité conservée au dossier → identité non établie, immatriculation et déclarations fragilisées.",
    basis: "Dossier du personnel — pièce d'identité",
  },
  {
    ref: "R30", step: "archivage", category: "donnees",
    event: "Aucune restauration de sauvegarde n'est testée et l'accès à la base n'est pas nominatif → historique non reconstituable et écritures directes non attribuables.",
    basis: "Continuité d'activité ; traçabilité des accès",
  },
];

/* ============================================================ calculs live ============================================================ */

export interface EvalCtx {
  s: AppState;
  firm: Firm;
  asOf: string;
}

export interface LiveValue {
  /** Valeur relevée, formulée pour le formulaire (« 3 bulletins », « 0 salarié », …). */
  valeur: string;
  /** Le seuil d'alerte est-il franchi ? */
  alerte: boolean;
  /** Détail chiffré (noms, périodes) — vide si rien à signaler. */
  detail: string;
}

/** Salarié présent à la date d'arrêté (même règle que le registre : sorti = parti). */
function presentAt(e: Employee, asOf: string): boolean {
  if (e.exit_date && e.exit_date <= asOf) return false;
  return e.is_active;
}

/** Les 12 mois clos précédant le mois de la date d'arrêté. */
export function window12(asOf: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(asOf.slice(0, 4));
  let m = Number(asOf.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push({ year: y, month: m });
  }
  return out;
}

/** Bulletins calculés (result figé) de la société sur la fenêtre, avec leur salarié. */
function validatedSlips(ctx: EvalCtx): { slip: Payslip; emp: Employee; period: PayrollPeriod }[] {
  const { s, firm, asOf } = ctx;
  const win = new Set(window12(asOf).map((w) => `${w.year}-${w.month}`));
  const periods = new Map(s.periods.filter((p) => p.firm_id === firm.id).map((p) => [p.id, p]));
  const emps = new Map(s.employees.filter((e) => e.firm_id === firm.id).map((e) => [e.id, e]));
  const out: { slip: Payslip; emp: Employee; period: PayrollPeriod }[] = [];
  for (const slip of s.payslips ?? []) {
    if (slip.result == null) continue;
    const per = periods.get(slip.period_id);
    const emp = emps.get(slip.employee_id);
    if (!per || !emp) continue;
    if (!win.has(`${per.year}-${per.month}`)) continue;
    out.push({ slip, emp, period: per });
  }
  return out;
}

function regimeMonthlyMin(firm: Firm, year: number): number {
  const p = getParams(year);
  const v = firm.regime === "SMAG" ? p.smagDaily * p.smagMonthlyDays : p.smigHourly * p.legalMonthlyHours;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function ageAt(birthIso: string | undefined, asOf: string): number | null {
  if (!birthIso) return null;
  const b = Date.parse(birthIso);
  const a = Date.parse(asOf);
  if (Number.isNaN(b) || Number.isNaN(a)) return null;
  return (a - b) / 31_557_600_000;
}

const names = (list: Employee[], n = 4): string => {
  const shown = list.slice(0, n).map((e) => `${e.first_name} ${e.last_name}`).join(", ");
  return list.length > n ? `${shown}, +${list.length - n} autre(s)` : shown;
};

/** « 0 salarié », « 1 salarié », « 3 salariés » — l'accord se voit, l'approximation aussi. */
function counting(n: number, singulier: string, pluriel?: string): string {
  if (n === 0) return `0 ${pluriel ?? `${singulier}s`}`;
  if (n === 1) return `1 ${singulier}`;
  return `${n} ${pluriel ?? `${singulier}s`}`;
}

/** Valeur live d'un indicateur, ou null si l'indicateur est manuel (champ à renseigner). */
export function computeLive(ref: string, ctx: EvalCtx): LiveValue | null {
  const { s, firm, asOf } = ctx;
  const present = s.employees.filter((e) => e.firm_id === firm.id && presentAt(e, asOf));
  const [ay, am] = [Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))];

  switch (ref) {
    case "R16": {
      // Périodes validées des 12 derniers mois avec règlement espèces, sans émargement rattaché.
      const bad: string[] = [];
      for (const w of window12(asOf)) {
        const per = s.periods.find((p) => p.firm_id === firm.id && p.year === w.year && p.month === w.month);
        if (!per || per.status === "draft") continue;
        const rep = buildSettlementReport(s, firm, w.year, w.month);
        const esp = rep.byMode.find((m) => m.mode === "especes");
        if (!esp || esp.count === 0) continue;
        const signed = (s.payrollAttachments ?? []).some(
          (a) => a.firm_id === firm.id && a.year === w.year && a.month === w.month && a.kind === "emargement_signee",
        );
        if (!signed) bad.push(`${w.year}-${String(w.month).padStart(2, "0")} (${esp.count} salarié(s) en espèces)`);
      }
      return {
        valeur: counting(bad.length, "période"),
        alerte: bad.length > 0,
        detail: bad.join(" ; "),
      };
    }
    case "R10": {
      const bad = validatedSlips(ctx).filter(
        ({ emp }) => seniorityYears(emp.hire_date, ay, am) >= 2 && emp.seniority_bonus === false,
      );
      const who = [...new Map(bad.map((b) => [b.emp.id, b.emp])).values()];
      return {
        valeur: counting(bad.length, "bulletin"),
        alerte: bad.length > 0,
        detail: who.length ? names(who) : "",
      };
    }
    case "R27": {
      const bad = present.filter((e) => !(e.marital_status ?? "").trim());
      return {
        valeur: counting(bad.length, "salarié"),
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    case "R26": {
      const bad = validatedSlips(ctx).filter(({ slip }) => slip.input.days_worked === 26);
      return {
        valeur: `${counting(bad.length, "bulletin")} à 26 jours`,
        alerte: bad.length > 0,
        detail: "PROXY : 26 jours peut être le réel constaté — à confirmer au pointage.",
      };
    }
    case "R04": {
      const min = regimeMonthlyMin(firm, ay);
      const bad = present.filter((e) => e.base_hourly_rate * e.monthly_hours < min - 0.01);
      return {
        valeur: `${counting(bad.length, "salarié")} sous le minimum (${min} DH)`,
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    case "R18": {
      const bad = s.periods
        .filter((p) => p.firm_id === firm.id && p.status !== "draft" && declarationOverdue(p.year, p.month, asOf))
        .map((p) => `${p.year}-${String(p.month).padStart(2, "0")}`);
      return {
        valeur: counting(bad.length, "période en retard", "périodes en retard"),
        alerte: bad.length > 0,
        detail: bad.join(" ; "),
      };
    }
    case "R29": {
      const bad = present.filter((e) => !(e.cin ?? "").trim());
      return {
        valeur: bad.length === 0 ? "100 % complets" : counting(bad.length, "dossier sans CIN", "dossiers sans CIN"),
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    case "R03": {
      const minors = present.filter((e) => {
        const a = ageAt(e.birth_date, asOf);
        return a !== null && a < 18;
      });
      const kindsOf = (empId: string): Set<string> => new Set(
        (s.attachments ?? []).filter((a) => a.employee_id === empId).map((a) => a.kind),
      );
      const bad = minors.filter((e) => !kindsOf(e.id).has("medical"));
      return {
        valeur: minors.length === 0
          ? "0 mineur présent"
          : `${bad.length}/${minors.length} ${bad.length > 1 ? "dossiers incomplets" : "dossier incomplet"}`,
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    case "R28": {
      const bad = present.filter((e) => !(e.site ?? "").trim() || !(e.position ?? "").trim());
      return {
        valeur: bad.length === 0
          ? "100 % rattachés"
          : counting(bad.length, "salarié sans site ou poste", "salariés sans site ou poste"),
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    case "R06": {
      const kindsOf = (empId: string): Set<string> => new Set(
        (s.attachments ?? []).filter((a) => a.employee_id === empId).map((a) => a.kind),
      );
      const bad = present.filter(
        (e) =>
          (e.contract_type === "ANAPEC" || e.contract_type === "Stagiaire" || (e.cnss_exemption && e.cnss_exemption !== "none")) &&
          !kindsOf(e.id).has("anapec"),
      );
      return {
        valeur: bad.length === 0 ? "0 exonération sans convention" : counting(bad.length, "salarié"),
        alerte: bad.length > 0,
        detail: bad.length ? names(bad) : "",
      };
    }
    default:
      return null;
  }
}

/* ============================================================ échéances ============================================================ */

/** Ajoute n mois à une date ISO (jour bloqué au dernier jour du mois cible). */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(yy, mm, 0).getDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Échéance datée d'une action, calculée depuis la date d'arrêté. */
export function echeanceDate(asOf: string, e: EvalActionDef["echeance"]): string {
  if (e === "immediat") return asOf.slice(0, 10);
  if (e === "1mois") return addMonthsISO(asOf, 1);
  if (e === "3mois") return addMonthsISO(asOf, 3);
  return addMonthsISO(asOf, 6);
}
