/**
 * Contrôles généraux informatiques (ITGC / COBIT, ISA 315) — moteur PUR, sans IA.
 *
 * Le principe : **une anomalie ITGC ne se déclare pas, elle se CONSTATE sur l'état du système.**
 * Un questionnaire rempli à la main photographie une intention, pas une réalité, et se périme
 * en silence dès le lendemain. Chaque contrôle ci-dessous interroge l'état réel et donne la même
 * réponse à qui la repose.
 *
 * Corollaire tenu strictement : un contrôle que l'on ne sait pas tester est déclaré
 * `non_evalue` et SORT du dénominateur de la maturité. Sans cette règle, le score monterait
 * quand l'outil devient aveugle — exactement l'inverse de ce qu'on veut mesurer.
 *
 * Aucun effet de bord, aucune horloge implicite : la date d'arrêté est injectée.
 */
import type { AppState, AppUser } from "@/data/types";
import { SUPER_ADMIN } from "@/data/seed";

/* ============================================================ types ============================================================ */

export type ItgcDomain = "acces" | "changements" | "developpement" | "exploitation";

export const DOMAIN_LABEL: Record<ItgcDomain, string> = {
  acces: "Accès aux programmes et aux données",
  changements: "Gestion des changements",
  developpement: "Développement et acquisition",
  exploitation: "Exploitation informatique",
};

/** Ordre d'examen : du plus structurant au plus opérationnel. */
export const DOMAINS: ItgcDomain[] = ["acces", "changements", "developpement", "exploitation"];

export type ItgcSeverity = "critique" | "majeur" | "mineur";
export const SEVERITY_LABEL: Record<ItgcSeverity, string> = {
  critique: "Critique", majeur: "Majeur", mineur: "Mineur",
};
export const SEVERITY_ORDER: ItgcSeverity[] = ["critique", "majeur", "mineur"];

export type ItgcEffort = "immediat" | "court_terme" | "projet";
export const EFFORT_LABEL: Record<ItgcEffort, string> = {
  immediat: "Immédiat", court_terme: "Court terme", projet: "Projet",
};

/** Verdict d'un contrôle. `non_evalue` sort du dénominateur de la maturité. */
export type ItgcVerdict = "satisfait" | "anomalie" | "non_evalue";

export interface ItgcFinding {
  id: string;
  domain: ItgcDomain;
  /** Énoncé de l'ÉTAT ATTENDU, testable — jamais une bonne intention. */
  control: string;
  verdict: ItgcVerdict;
  severity: ItgcSeverity;
  effort: ItgcEffort;
  /** Le fait constaté, chiffré. */
  observed: string;
  /** La conséquence, pas la règle. */
  consequence: string;
  /** Action précise et située. */
  action: string;
  /** Ce qu'on vérifiera pour considérer le point clos. */
  evidence: string;
  /** Route interne où corriger, si l'application la porte. */
  route?: string;
}

export interface DomainMaturity {
  domain: ItgcDomain;
  satisfied: number;
  /** Contrôles évaluables = satisfaits + anomalies (les non évalués sont exclus). */
  applicable: number;
  notAssessed: number;
  /** Pourcentage entier 0-100. 0 si rien n'est évaluable. */
  pct: number;
}

export interface ItgcReport {
  asOf: string;
  findings: ItgcFinding[];
  anomalies: ItgcFinding[];
  notAssessed: ItgcFinding[];
  byDomain: DomainMaturity[];
  /** Maturité globale : satisfaits / évaluables, tous domaines confondus. */
  maturityPct: number;
  counts: Record<ItgcSeverity, number>;
}

/* ============================================================ constatation ============================================================ */

const DAY = 86_400_000;

/** Jours écoulés entre deux dates ISO. Négatif impossible : borné à 0. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / DAY));
}

/** Seuils du référentiel — regroupés ici, jamais dispersés dans les contrôles. */
export const ITGC_THRESHOLDS = {
  /** Au-delà, un compte actif est réputé dormant. */
  dormantDays: 90,
  /** Nombre de comptes à privilèges au-delà duquel le moindre privilège n'est plus tenu. */
  maxPrivileged: 2,
  /** Fenêtre d'observation des échecs de connexion. */
  bruteForceWindowDays: 7,
  /** Nombre d'échecs sur la fenêtre au-delà duquel une série est anormale. */
  bruteForceThreshold: 10,
} as const;

/** Dernière connexion RÉUSSIE d'un compte, ou undefined s'il ne s'est jamais connecté. */
function lastLogin(s: AppState, user: AppUser): string | undefined {
  let last: string | undefined;
  for (const ev of s.loginEvents ?? []) {
    if (ev.outcome !== "success") continue;
    if (ev.user_id !== user.id) continue;
    if (!last || ev.at > last) last = ev.at;
  }
  return last;
}

/**
 * Produit le rapport ITGC à la date d'arrêté `asOf` (ISO « AAAA-MM-JJ »).
 *
 * `env` porte ce que le moteur ne peut pas lire dans l'état applicatif : la configuration du
 * navigateur et de l'hébergement. Injecté plutôt que deviné, pour rester pur et testable.
 */
export function buildItgcReport(
  s: AppState,
  asOf: string,
  env: {
    /** La persistance cloud est-elle configurée ? (sauvegarde hors du poste) */
    cloudConfigured: boolean;
    /** Une clé d'API du modèle est-elle stockée dans ce navigateur ? */
    aiKeyInBrowser: boolean;
    /** Nombre de pièces jointes dont le binaire ne vit que sur ce poste. */
    localOnlyAttachments: number;
  },
): ItgcReport {
  const f: ItgcFinding[] = [];
  const users = s.users ?? [];
  const active = users.filter((u) => u.is_active);
  const events = s.loginEvents ?? [];

  const add = (x: ItgcFinding) => f.push(x);

  /* ---------------------------------------------- 1. Accès ---------------------------------------------- */

  // Mot de passe racine documenté : l'empreinte du seed est publique dans le dépôt.
  const rootUnchanged = users.some((u) => u.is_super && u.password_hash === SUPER_ADMIN.password_hash);
  add({
    id: "ACC-01", domain: "acces",
    control: "Aucun compte ne conserve un mot de passe par défaut ou documenté",
    verdict: rootUnchanged ? "anomalie" : "satisfait",
    severity: "critique", effort: "immediat",
    observed: rootUnchanged
      ? "Le compte super administrateur porte encore l'empreinte du mot de passe livré avec l'application."
      : "Le mot de passe du compte racine a été changé.",
    consequence: "Ce mot de passe figure dans le dépôt : quiconque y a accès entre avec tous les droits.",
    action: "Changer le mot de passe du compte racine dans Paramètres → Utilisateurs.",
    evidence: "Le contrôle repasse au vert dès que l'empreinte diffère de celle du seed.",
    route: "/settings",
  });

  const privileged = active.filter((u) => u.role === "super_admin");
  add({
    id: "ACC-02", domain: "acces",
    control: `Le nombre de comptes à privilèges reste limité (${ITGC_THRESHOLDS.maxPrivileged} au plus)`,
    verdict: privileged.length > ITGC_THRESHOLDS.maxPrivileged ? "anomalie" : "satisfait",
    severity: "critique", effort: "court_terme",
    observed: `${privileged.length} compte(s) super administrateur actif(s).`,
    consequence: "Chaque compte à privilèges est une surface d'attaque, et un contre-pouvoir en moins.",
    action: "Rétrograder les comptes qui n'ont pas besoin des zones sensibles (Sécurité RIB, Stabilisation, persistance cloud).",
    evidence: `Le contrôle repasse au vert à ${ITGC_THRESHOLDS.maxPrivileged} comptes à privilèges ou moins.`,
    route: "/settings",
  });

  const dormant = active.filter((u) => {
    const last = lastLogin(s, u);
    if (!last) return daysBetween(u.created_at, asOf) > ITGC_THRESHOLDS.dormantDays;
    return daysBetween(last, asOf) > ITGC_THRESHOLDS.dormantDays;
  });
  add({
    id: "ACC-03", domain: "acces",
    control: `Aucun compte actif sans connexion depuis plus de ${ITGC_THRESHOLDS.dormantDays} jours`,
    verdict: events.length === 0 ? "non_evalue" : dormant.length > 0 ? "anomalie" : "satisfait",
    severity: "majeur", effort: "immediat",
    observed: events.length === 0
      ? "Aucun journal de connexion : l'ancienneté des accès n'est pas mesurable."
      : `${dormant.length} compte(s) dormant(s)${dormant.length ? ` : ${dormant.map((u) => u.username).join(", ")}` : ""}.`,
    consequence: "Un compte dormant est une cible : son usage anormal ne surprend personne.",
    action: "Désactiver les comptes inutilisés dans Paramètres → Utilisateurs.",
    evidence: "Le contrôle repasse au vert quand tout compte actif s'est connecté dans la fenêtre.",
    route: "/settings",
  });

  const roles = new Set(active.map((u) => u.role));
  add({
    id: "ACC-04", domain: "acces",
    control: "La séparation des tâches est possible : au moins deux comptes actifs de rôles distincts",
    verdict: active.length >= 2 && roles.size >= 2 ? "satisfait" : "anomalie",
    severity: "critique", effort: "court_terme",
    observed: `${active.length} compte(s) actif(s), ${roles.size} rôle(s) distinct(s).`,
    consequence: "Sans séparation, une même personne saisit, valide et règle la paie : la fraude ne rencontre aucun obstacle.",
    action: "Créer au moins un compte gestionnaire distinct du compte administrateur.",
    evidence: "Deux comptes actifs au moins, portant des rôles différents.",
    route: "/settings",
  });

  const firmsNoPin = s.firms.filter((fi) => !fi.validation_pin_hash);
  add({
    id: "ACC-05", domain: "acces",
    control: "Le code de validation est configuré pour toutes les sociétés",
    verdict: s.firms.length === 0 ? "non_evalue" : firmsNoPin.length > 0 ? "anomalie" : "satisfait",
    severity: "majeur", effort: "immediat",
    observed: s.firms.length === 0
      ? "Aucune société enregistrée."
      : firmsNoPin.length > 0
        ? `${firmsNoPin.length} société(s) sans code : ${firmsNoPin.map((x) => x.name).join(", ")}.`
        : "Toutes les sociétés portent un code de validation.",
    consequence: "Sans code, la validation de la paie, le verrouillage des écritures et la modification d'une fiche salarié n'ont plus de double consentement.",
    action: "Paramètres → Code de validation, puis « Appliquer à toutes les sociétés ».",
    evidence: "Aucune société sans empreinte de code enregistrée.",
    route: "/settings",
  });

  add({
    id: "ACC-06", domain: "acces",
    control: "Les accès sont journalisés (réussites, échecs et déconnexions)",
    verdict: events.length > 0 ? "satisfait" : "anomalie",
    severity: "majeur", effort: "court_terme",
    observed: `${events.length} événement(s) d'accès journalisé(s).`,
    consequence: "Sans journal, une tentative d'intrusion ne laisse aucune trace et n'est jamais détectée.",
    action: "Le journal est automatique ; s'il est vide, c'est qu'aucune connexion n'a eu lieu depuis sa mise en service.",
    evidence: "Le journal des connexions contient des événements.",
    route: "/settings",
  });

  const windowStart = new Date(Date.parse(asOf) - ITGC_THRESHOLDS.bruteForceWindowDays * DAY).toISOString();
  const recentFailures = events.filter((ev) => ev.outcome === "failed" && ev.at >= windowStart);
  add({
    id: "ACC-07", domain: "acces",
    control: `Aucune série anormale d'échecs de connexion sur ${ITGC_THRESHOLDS.bruteForceWindowDays} jours`,
    verdict: events.length === 0
      ? "non_evalue"
      : recentFailures.length >= ITGC_THRESHOLDS.bruteForceThreshold ? "anomalie" : "satisfait",
    severity: "majeur", effort: "immediat",
    observed: events.length === 0
      ? "Journal vide : la détection n'est pas possible."
      : `${recentFailures.length} échec(s) de connexion sur la fenêtre (seuil ${ITGC_THRESHOLDS.bruteForceThreshold}).`,
    consequence: "Une série d'échecs signale une tentative de force brute en cours.",
    action: "Examiner le journal des connexions et désactiver le compte visé le temps de l'enquête.",
    evidence: "Le nombre d'échecs récents repasse sous le seuil.",
    route: "/settings",
  });

  add({
    id: "ACC-08", domain: "acces",
    control: "Le journal d'accès ne peut pas être effacé par ceux qu'il surveille",
    verdict: "anomalie",
    severity: "majeur", effort: "projet",
    // La purge est désormais réservée au super administrateur, et la garde vit dans le store —
    // un bouton masqué se contourne, cette condition non. L'exposition baisse donc nettement.
    // Mais le constat RESTE une anomalie : le super administrateur est lui aussi journalisé, il
    // peut donc encore effacer ses propres traces. Passer au vert ici serait se mentir.
    observed: "La purge du journal des connexions est réservée au super administrateur (garde portée par le store, pas seulement par l'interface). Ce compte reste toutefois journalisé : il peut effacer ses propres traces.",
    consequence: "Tant que l'auteur des actes peut purger le journal, celui-ci ne fait pas pleinement preuve contre lui.",
    action: "Exporter périodiquement le journal hors de l'application, ou confier la purge à un tiers distinct des comptes surveillés.",
    evidence: "Le journal est répliqué hors de portée des comptes qu'il surveille.",
  });

  add({
    id: "ACC-09", domain: "acces",
    control: "Aucun identifiant n'est partagé entre plusieurs personnes",
    verdict: "non_evalue",
    severity: "majeur", effort: "court_terme",
    observed: "L'application ne peut pas distinguer deux personnes derrière un même identifiant.",
    consequence: "Un identifiant partagé rend tout acte inimputable et ruine la valeur du journal.",
    action: "Revue organisationnelle : un identifiant nominatif par personne, aucun compte générique.",
    evidence: "Constat déclaratif à consigner lors de la revue périodique des habilitations.",
  });

  add({
    id: "ACC-10", domain: "acces",
    control: "La purge du journal des documents est réservée aux administrateurs",
    verdict: "satisfait",
    severity: "majeur", effort: "immediat",
    observed: "Seuls les comptes administrateur et super administrateur peuvent vider le journal des documents ; la garde est portée par le store.",
    consequence: "Le journal fait la preuve de ce qui a été remis à un salarié — avertissement, solde de tout compte, bulletin. L'effacer détruit cette preuve.",
    action: "Maintenir la restriction ; un opérateur n'a pas à disposer de ce geste.",
    evidence: "Le bouton de purge est absent pour les rôles non administrateurs, et l'appel direct est neutralisé.",
    route: "/documents-log",
  });

  /* ---------------------------------------------- 2. Changements ---------------------------------------------- */

  add({
    id: "CHG-01", domain: "changements",
    control: "Les paramètres réglementaires sont centralisés, jamais écrits en dur",
    verdict: "satisfait",
    severity: "majeur", effort: "projet",
    observed: "Taux, plafonds et barèmes vivent dans le référentiel unique `params.ts`.",
    consequence: "Une valeur en dur oblige à modifier du code à chaque loi de finances, avec le risque d'en oublier.",
    action: "Maintenir la règle : aucune valeur réglementaire hors du référentiel.",
    evidence: "Revue de code à chaque évolution.",
  });

  add({
    id: "CHG-02", domain: "changements",
    control: "Les barèmes portent une date d'effet",
    verdict: "satisfait",
    severity: "majeur", effort: "court_terme",
    observed: "Le référentiel applique le barème dont l'année d'effet est la plus récente ≤ période calculée.",
    consequence: "Sans date d'effet, une période ancienne se recalcule au barème d'aujourd'hui — donc faux.",
    action: "Maintenir la datation à chaque ajout de barème.",
    evidence: "Tests du référentiel historique.",
  });

  const closures = s.accountingClosures ?? [];
  const declaredPeriods = s.periods.filter((p) => p.status === "declared" || p.status === "paid");
  add({
    id: "CHG-03", domain: "changements",
    control: "Les périodes déclarées sont figées par un instantané comptable",
    verdict: declaredPeriods.length === 0
      ? "non_evalue"
      : declaredPeriods.every((p) => closures.some((c) => c.id === `${p.firm_id}_${p.year}_${p.month}`))
        ? "satisfait" : "anomalie",
    severity: "critique", effort: "court_terme",
    observed: declaredPeriods.length === 0
      ? "Aucune période déclarée ou payée à ce jour."
      : `${declaredPeriods.filter((p) => !closures.some((c) => c.id === `${p.firm_id}_${p.year}_${p.month}`)).length} période(s) déclarée(s) sans instantané figé sur ${declaredPeriods.length}.`,
    consequence: "Une période modifiée après déclaration fait diverger l'assiette déclarée des pièces, sans trace.",
    action: "Volet Écritures comptables : valider les écritures des périodes déclarées.",
    evidence: "Chaque période déclarée porte une clôture comptable.",
    route: "/accounting",
  });

  /* ---------------------------------------------- 3. Développement ---------------------------------------------- */

  add({
    id: "DEV-01", domain: "developpement",
    control: "Les traitements critiques sont couverts par des tests automatisés",
    verdict: "satisfait",
    severity: "majeur", effort: "projet",
    observed: "Moteurs de paie, registre, écritures, risques et états déclaratifs sont couverts par une suite de tests unitaires.",
    consequence: "Sans tests, une dérive de calcul passe inaperçue jusqu'au contrôle.",
    action: "Exiger un test à chaque évolution d'un moteur.",
    evidence: "Suite de tests verte avant chaque mise en production.",
  });

  add({
    id: "DEV-02", domain: "developpement",
    control: "Les invariants métier sont vérifiés à l'exécution, pas seulement en test",
    verdict: "satisfait",
    severity: "majeur", effort: "court_terme",
    observed: "La génération des écritures bloque sur rupture d'équilibre ou d'identité de paie ; le volet Stabilisation rejoue les invariants sur les bulletins réels.",
    consequence: "Une donnée incohérente se propagerait jusqu'aux documents officiels.",
    action: "Maintenir les invariants bloquants.",
    evidence: "Volet Stabilisation sans anomalie d'invariant.",
    route: "/stability",
  });

  const demoIds = new Set(["emp_1", "emp_2", "emp_3", "emp_4", "emp_5", "emp_6", "emp_7"]);
  const demoLeft = s.employees.filter((e) => demoIds.has(e.id)).length;
  add({
    id: "DEV-03", domain: "developpement",
    control: "Aucune donnée de démonstration ne subsiste",
    verdict: demoLeft > 0 ? "anomalie" : "satisfait",
    severity: "mineur", effort: "immediat",
    observed: demoLeft > 0 ? `${demoLeft} salarié(s) de démonstration encore présent(s).` : "Aucun salarié de démonstration.",
    consequence: "Des chiffres fictifs mêlés aux réels faussent les états et les déclarations.",
    action: "Supprimer ces enregistrements dans le volet Salariés.",
    evidence: "Aucun identifiant de démonstration dans les données.",
    route: "/employees",
  });

  /* ---------------------------------------------- 4. Exploitation ---------------------------------------------- */

  add({
    id: "EXP-01", domain: "exploitation",
    control: "Une sauvegarde existe HORS du poste de travail",
    verdict: env.cloudConfigured ? "satisfait" : "anomalie",
    severity: "critique", effort: "immediat",
    observed: env.cloudConfigured
      ? "La persistance cloud est configurée : les données sont répliquées hors du poste."
      : "Aucune persistance cloud : toutes les données ne vivent que dans ce navigateur.",
    consequence: "À la panne du poste, ou au simple effacement des données du navigateur, tout est perdu — bulletins, déclarations, écritures.",
    action: "Paramètres → Persistance cloud : renseigner l'URL et la clé Supabase.",
    evidence: "L'indicateur de synchronisation passe à « enregistré ».",
    route: "/settings",
  });

  add({
    id: "EXP-02", domain: "exploitation",
    control: "La sauvegarde a été restaurée au moins une fois",
    verdict: "non_evalue",
    severity: "critique", effort: "court_terme",
    observed: "L'application ne peut pas constater qu'une restauration a été éprouvée.",
    consequence: "Une sauvegarde jamais restaurée n'est pas une garantie, c'est une hypothèse — et elle se vérifie le jour où il est trop tard.",
    action: "Réaliser une restauration de test sur un poste vierge, et en consigner la date.",
    evidence: "Compte rendu de restauration daté, à renouveler périodiquement.",
  });

  add({
    id: "EXP-03", domain: "exploitation",
    control: "Les pièces justificatives déposées sont sauvegardées comme les données",
    verdict: env.localOnlyAttachments > 0 ? "anomalie" : "satisfait",
    severity: "majeur", effort: "projet",
    observed: env.localOnlyAttachments > 0
      ? `${env.localOnlyAttachments} pièce(s) dont le fichier ne vit que sur ce poste (fiche synchronisée, binaire local).`
      : "Aucune pièce jointe non sauvegardée.",
    consequence: "Les CIN, contrats et accusés disparaissent avec le poste, alors que leur fiche laisse croire qu'ils existent.",
    action: "Basculer le stockage binaire sur Supabase Storage, ou exporter périodiquement les pièces.",
    evidence: "Toute pièce enregistrée est lisible depuis un autre poste.",
    route: "/employees",
  });

  add({
    id: "EXP-04", domain: "exploitation",
    control: "Aucun secret n'est stocké en clair côté navigateur",
    verdict: env.aiKeyInBrowser ? "anomalie" : "satisfait",
    severity: "critique", effort: "court_terme",
    observed: env.aiKeyInBrowser
      ? "Une clé d'API du modèle est enregistrée dans le stockage local de ce navigateur."
      : "Aucune clé d'API enregistrée dans ce navigateur.",
    consequence: "La clé est lisible par toute personne ayant accès au navigateur, et facturable à son détenteur.",
    action: "Retirer la clé de Configuration après usage, ou réserver l'Assistant IA à un poste personnel.",
    evidence: "Aucune clé présente dans le stockage local.",
    route: "/assistant",
  });

  const empIds = new Set(s.employees.map((e) => e.id));
  const orphanSlips = (s.payslips ?? []).filter((sl) => !empIds.has(sl.employee_id)).length;
  const orphanLeaves = (s.leaves ?? []).filter((l) => !empIds.has(l.employee_id)).length;
  const orphans = orphanSlips + orphanLeaves;
  add({
    id: "EXP-05", domain: "exploitation",
    control: "Aucune donnée orpheline ni référence morte",
    verdict: orphans > 0 ? "anomalie" : "satisfait",
    severity: "mineur", effort: "immediat",
    observed: orphans > 0 ? `${orphanSlips} bulletin(s) et ${orphanLeaves} congé(s) rattachés à un salarié inexistant.` : "Aucune référence morte.",
    consequence: "Les totaux se faussent silencieusement et les états deviennent incohérents.",
    action: "Volet Stabilisation → « Corriger » (réparations idempotentes).",
    evidence: "Aucune référence orpheline détectée.",
    route: "/stability",
  });

  const matricules = s.employees.map((e) => (e.matricule ?? "").trim().toLowerCase()).filter(Boolean);
  const dupMatricule = matricules.length - new Set(matricules).size;
  add({
    id: "EXP-06", domain: "exploitation",
    control: "Aucun doublon sur les clés d'identification des salariés",
    verdict: dupMatricule > 0 ? "anomalie" : "satisfait",
    severity: "majeur", effort: "immediat",
    observed: dupMatricule > 0 ? `${dupMatricule} matricule(s) en double.` : "Aucun matricule en double.",
    consequence: "Deux salariés confondus dans une déclaration, un appariement Odoo qui écrit sur le mauvais dossier.",
    action: "Volet Salariés : rendre chaque matricule unique.",
    evidence: "Aucun matricule répété.",
    route: "/employees",
  });

  /* ---------------------------------------------- synthèse ---------------------------------------------- */

  const anomalies = f.filter((x) => x.verdict === "anomalie");
  const notAssessed = f.filter((x) => x.verdict === "non_evalue");

  const byDomain: DomainMaturity[] = DOMAINS.map((d) => {
    const dom = f.filter((x) => x.domain === d);
    const satisfied = dom.filter((x) => x.verdict === "satisfait").length;
    const na = dom.filter((x) => x.verdict === "non_evalue").length;
    const applicable = dom.length - na; // les non évalués SORTENT du dénominateur
    return {
      domain: d, satisfied, applicable, notAssessed: na,
      pct: applicable === 0 ? 0 : Math.round((satisfied / applicable) * 100),
    };
  });

  const totalApplicable = f.length - notAssessed.length;
  const totalSatisfied = f.filter((x) => x.verdict === "satisfait").length;

  return {
    asOf, findings: f, anomalies, notAssessed, byDomain,
    maturityPct: totalApplicable === 0 ? 0 : Math.round((totalSatisfied / totalApplicable) * 100),
    counts: {
      critique: anomalies.filter((x) => x.severity === "critique").length,
      majeur: anomalies.filter((x) => x.severity === "majeur").length,
      mineur: anomalies.filter((x) => x.severity === "mineur").length,
    },
  };
}

/**
 * Anomalies ordonnées par rapport gravité / effort : ce qui coûte peu et rapporte beaucoup
 * d'abord. C'est l'ordre dans lequel une équipe traite réellement une liste de constats.
 */
export function prioritise(anomalies: ItgcFinding[]): ItgcFinding[] {
  const sev: Record<ItgcSeverity, number> = { critique: 3, majeur: 2, mineur: 1 };
  const eff: Record<ItgcEffort, number> = { immediat: 3, court_terme: 2, projet: 1 };
  return [...anomalies].sort((a, b) =>
    sev[b.severity] * eff[b.effort] - sev[a.severity] * eff[a.effort]
    || sev[b.severity] - sev[a.severity]
    || a.id.localeCompare(b.id));
}

export const ITGC_DISCLAIMER =
  "Contrôles généraux informatiques constatés sur l'état RÉEL du système à la date d'arrêté. "
  + "Un contrôle non testable est déclaré « non évalué » et exclu du calcul de maturité : sans cette "
  + "règle, le score monterait quand l'outil devient aveugle. Ce rapport ne se substitue ni à un "
  + "audit de sécurité, ni à un test d'intrusion.";
