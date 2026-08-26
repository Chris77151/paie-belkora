/**
 * Moteur d'audit comptable & financier — LOCAL et DÉTERMINISTE (aucun appel à une IA).
 *
 * Deux périmètres :
 *  - PAIE LOCALE : règles sur le store (société, salariés, écritures de paie OD + règlement).
 *  - COMPTABILITÉ ODOO (si connectée) : lecture seule des soldes postés par compte et de l'état
 *    des écritures → contrôles par assertion sur TOUS les cycles (achats, ventes, trésorerie,
 *    TVA, dettes, présentation).
 *
 * `runLocalAudit` = paie seule (synchrone). `runFullAudit` = paie + Odoo (asynchrone ; se rabat
 * sur la paie locale si Odoo n'est pas configuré ou inaccessible). Les taux/seuils viennent de
 * params.ts (source unique). Aucun appel Claude.
 */
import { currentFirm, employeesOfFirm, getState, payslipsOfPeriod } from "@/data/store";
import type { Employee } from "@/data/types";
import { round2, type PayrollResult } from "@/lib/payroll-engine";
import { computeFor, defaultInput, employeesForPeriod } from "@/lib/payroll-helpers";
import { leaveBalance } from "@/lib/leave-balance";
import {
  buildPayrollEntry, buildSettlementEntries, sumResults, type JournalEntry,
} from "@/lib/payroll-accounting";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting-accounts";
import { getParams } from "@/lib/params";
import { odooReadiness, odooErrorHint } from "@/lib/odoo";
import { fetchOdooAccounting, type OdooAccountingData } from "@/lib/odoo-accounting";

export type AssertionCategory = "flux" | "soldes" | "presentation";
export type Gravite = "critique" | "eleve" | "moyen" | "info";

/** Une ligne d'écriture de correction proposée (partie double). */
export interface CorrectionLine {
  compte: string; // n° PCGE
  libelle: string;
  debit: number;
  credit: number;
}

/** Écriture comptable de correction prête à passer (proposition, jamais appliquée en aveugle). */
export interface CorrectionEntry {
  journal: string; // "OD" (divers), "BQ" (banque)…
  libelle: string; // narration de l'écriture
  lignes: CorrectionLine[];
  totalDebit: number;
  totalCredit: number;
  equilibre: boolean;
  /** Réserve/précision (ex. « montant à ajuster selon l'inventaire des congés »). */
  note?: string;
}

/** Bloc « correction » enrichi attaché à un constat : compréhension + étapes + écriture. */
export interface FindingCorrection {
  /** Ce que l'anomalie SIGNIFIE et son impact comptable/fiscal (compréhension). */
  comprendre: string;
  /** Étapes concrètes de correction (checklist). */
  etapes: string[];
  /** Écriture comptable proposée, si une écriture est le bon remède (sinon null). */
  ecriture?: CorrectionEntry | null;
}

/** Élément (compte) réellement anormal détecté, avec son montant et son id Odoo (pour lien direct). */
export interface ElementAnormal {
  /** id Odoo de account.account (ouvre le compte dans Odoo). */
  id?: number;
  /** N° de compte PCGE. */
  code: string;
  /** Intitulé du compte. */
  name: string;
  /** Montant anormal (solde, DH ; signé). */
  montant: number;
}

export interface AuditFinding {
  categorie_assertion: AssertionCategory;
  assertion: string;
  cycle: string;
  gravite: Gravite;
  titre: string;
  detail: string;
  recommandation: string;
  reference_normative: string;
  action_odoo: string;
  /** Numéros de compte PCGE concernés (extraits du constat, allowlist — sans faux positif). */
  comptes: string[];
  /** Origine du constat : `paie` (local) ou `odoo` (comptabilité) — pilote le lien de correction. */
  source?: "paie" | "odoo";
  /** Comptes RÉELLEMENT anormaux (code + intitulé + montant + id Odoo), pour affichage et lien direct. */
  elementsAnormaux?: ElementAnormal[];
  /** Compréhension approfondie + écriture de correction prête à passer (si applicable). */
  correction?: FindingCorrection;
}

/** Assemble une écriture de correction équilibrée (arrondi 2 déc., calcul des totaux + équilibre). */
export function mkEntry(journal: string, libelle: string, lignes: CorrectionLine[], note?: string): CorrectionEntry {
  const rl = lignes.map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }));
  const totalDebit = round2(rl.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(rl.reduce((s, l) => s + l.credit, 0));
  return { journal, libelle, lignes: rl, totalDebit, totalCredit, equilibre: Math.abs(totalDebit - totalCredit) < 0.01, note };
}

/**
 * Attache un bloc de correction à un constat (helper immuable) ET complète la liste des comptes
 * concernés avec ceux de l'ÉCRITURE de correction — ainsi un constat dont les comptes n'apparaissent
 * que dans l'écriture (ex. provision congés → 6171/617x/4437) les expose quand même clairement.
 */
export function withCorrection(f: AuditFinding, correction: FindingCorrection): AuditFinding {
  const fromEcriture = correction.ecriture ? correction.ecriture.lignes.map((l) => l.compte) : [];
  const comptes = Array.from(new Set([...f.comptes, ...fromEcriture])).sort();
  return { ...f, comptes, correction };
}

/**
 * Attache les COMPTES ANORMAUX réels (avec montant + id Odoo) à un constat et les ajoute à la liste
 * des comptes concernés — pour que les numéros de compte des éléments en anomalie soient toujours
 * VISIBLES (chips) et cliquables (lien direct vers Odoo), au lieu de rester noyés dans le texte.
 */
export function withElements(f: AuditFinding, elements: ElementAnormal[]): AuditFinding {
  const codes = elements.map((e) => e.code).filter(Boolean);
  const comptes = Array.from(new Set([...f.comptes, ...codes])).sort();
  return { ...f, comptes, elementsAnormaux: elements };
}

/**
 * Route INTERNE de l'app où corriger un constat de PAIE (déterministe, par mots-clés du titre/cycle).
 * Les constats Odoo se corrigent dans Odoo (lien externe géré par l'UI), pas ici.
 */
export function findingRoute(f: AuditFinding): { route: string; label: string } | null {
  const t = `${f.titre} ${f.cycle}`.toLowerCase();
  if (/\bice\b|identifiant fiscal|\bif\b|affiliation cnss/.test(t)) return { route: "settings", label: "Ouvrir les Paramètres société" };
  // Constats comptables (écriture, provision, dettes sociales/fiscales…) → volet Écritures — prioritaire
  // sur « congés » car la provision pour congés payés se corrige par une écriture, pas dans le volet Congés.
  if (/[ée]criture|charge|\btfp\b|provision|4441|\bir\b|\btva\b|classification|attente|balance|lettr|factur|fournisseur|client|organism|d[ée]s[ée]quilibr/.test(t))
    return { route: "accounting", label: "Ouvrir les Écritures comptables" };
  if (/taux|smig|heures|\bcdd\b|\bcin\b|immatricul|mineur|contrat|embauche/.test(t)) return { route: "employees", label: "Ouvrir le volet Salariés" };
  if (/cong[ée]s/.test(t)) return { route: "leaves", label: "Ouvrir le volet Congés" };
  return null;
}

export interface AuditReport {
  synthese: string;
  score_fiabilite: number;
  scope: string;
  constats: AuditFinding[];
}

export interface AuditSnapshot {
  firm: Record<string, unknown>;
  period: string;
  totals: ReturnType<typeof sumResults>;
  entries: JournalEntry[];
  headcount: number;
}

/* ------------------------------------------------------------------ */
/* Instantané (aperçu local, aussi affiché avant l'audit)             */
/* ------------------------------------------------------------------ */

function resultsFor(year: number, month: number): PayrollResult[] {
  const s = getState();
  const firm = currentFirm(s);
  const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
  if (period) {
    const frozen = payslipsOfPeriod(s, period.id).filter((sl) => sl.result).map((sl) => sl.result as PayrollResult);
    if (frozen.length) return frozen;
  }
  // Reconstitution : uniquement les salariés employés pendant la période (embauche/fin de contrat).
  const active = employeesForPeriod(employeesOfFirm(s, firm.id), year, month);
  return active.map((e) => computeFor(e, firm, year, month, defaultInput(e)));
}

export function buildAuditSnapshot(year: number, month: number): AuditSnapshot {
  const s = getState();
  const firm = currentFirm(s);
  const totals = sumResults(resultsFor(year, month));
  const entries = [
    buildPayrollEntry(totals, DEFAULT_ACCOUNTS, year, month),
    ...buildSettlementEntries(totals, DEFAULT_ACCOUNTS, year, month),
  ];
  return { firm: { name: firm.name, regime: firm.regime }, period: `${year}-${String(month).padStart(2, "0")}`, totals, entries, headcount: totals.headcount };
}

/* ------------------------------------------------------------------ */
/* Utilitaires de construction de constats                            */
/* ------------------------------------------------------------------ */

const ageYears = (iso: string, at: Date) => (at.getTime() - new Date(iso).getTime()) / 3.15576e10;
const names = (list: Employee[], n = 4) => {
  const shown = list.slice(0, n).map((e) => `${e.first_name} ${e.last_name}`).join(", ");
  return list.length > n ? `${shown}, +${list.length - n} autre(s)` : shown;
};
const dh = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;

/**
 * Comptes PCGE reconnus dans les constats (paie + cycles Odoo). ALLOWLIST : on n'extrait QUE ces
 * codes, ce qui évite tout faux positif (montants, années 2025/2026, quantités). Triés du plus
 * long au plus court pour matcher 617411 avant 6174, 44525 avant 4452, etc.
 */
const PCGE_ACCOUNTS = [
  "617411", "617412", "61678", "61671", "61744", "61741", "44525", "4455", "3455", "4432", "4441", "4457",
  "5141", "5161", "3421", "3411", "4421", "4411", "4434", "3431", "3491", "4491", "6171", "471", "472",
  "342", "441", "445",
].sort((a, b) => b.length - a.length);

/**
 * Intitulés PCGE / CGNC des comptes cités par l'audit — pour AFFICHER « 4441 — CNSS » plutôt qu'un
 * simple « 4441 ». Valeurs standard du plan comptable marocain (aucune invention). Étend
 * `ACCOUNT_LABELS` (paie) aux comptes des cycles Odoo (tiers, TVA, attente).
 */
export const PCGE_LABELS: Record<string, string> = {
  "6171": "Appointements et salaires",
  "61671": "Droits d'enregistrement et de timbre",
  "61678": "Autres impôts, taxes et droits assimilés (dont TFP)",
  "617x": "Charges patronales sur salaires",
  "61741": "Cotisations de sécurité sociale",
  "617411": "CNSS part patronale",
  "617412": "AMO part patronale",
  "61744": "Prestations familiales (allocations familiales)",
  "4432": "Rémunérations dues au personnel",
  "4437": "Charges de personnel à payer (congés)",
  "4441": "Caisses de sécurité sociale (CNSS)",
  "4457": "État - impôts et taxes à payer",
  "4452": "État - impôts, taxes et assimilés",
  "44525": "État - IR (IGR) retenu à la source",
  "4455": "État, T.V.A. facturée",
  "4456": "État, T.V.A. due (suivant déclarations)",
  "3455": "État - T.V.A. récupérable",
  "3456": "État - crédit de T.V.A. (suivant déclarations)",
  "3421": "Clients",
  "342": "Clients et comptes rattachés",
  "3411": "Fournisseurs - avances et acomptes versés sur commandes",
  "3431": "Personnel - avances et acomptes",
  "4411": "Fournisseurs",
  "441": "Fournisseurs et comptes rattachés",
  "4421": "Clients - avances et acomptes reçus sur commandes en cours",
  "4434": "Personnel - oppositions / saisies sur salaires",
  "445": "État - TVA et impôts",
  "3491": "Charges constatées d'avance",
  "4491": "Produits constatés d'avance",
  "471": "Compte d'attente (à réimputer)",
  "472": "Compte d'attente (à régulariser)",
  "5141": "Banques (soldes débiteurs)",
  "5161": "Caisses",
};

/** « 4441 — CNSS (organismes sociaux) » ; si le libellé est inconnu, renvoie le code seul. */
export function describeCompte(code: string): string {
  const label = PCGE_LABELS[code];
  return label ? `${code} — ${label}` : code;
}

/**
 * Marche à suivre CONCRÈTE d'un constat : les étapes de la correction si elles existent, sinon une
 * checklist minimale dérivée de la recommandation + de l'action Odoo. Garantit que CHAQUE anomalie
 * indique « comment procéder », même sans écriture. PURE.
 */
export function findingSteps(f: AuditFinding): string[] {
  if (f.correction?.etapes?.length) return f.correction.etapes;
  return [f.recommandation, f.action_odoo].map((s) => (s ?? "").trim()).filter(Boolean);
}

/** Extrait les comptes PCGE réellement cités dans le texte d'un constat (allowlist, avec suffixe « x » toléré). */
export function extractComptes(detail: string, recommandation: string, action_odoo: string): string[] {
  const hay = `${detail} ${recommandation} ${action_odoo}`;
  const found: string[] = [];
  for (const code of PCGE_ACCOUNTS) {
    if (found.some((c) => c.startsWith(code))) continue; // déjà couvert par un code plus long
    if (new RegExp(`\\b${code}x?\\b`).test(hay)) found.push(code);
  }
  return found.sort();
}

function F(
  categorie_assertion: AssertionCategory, assertion: string, cycle: string, gravite: Gravite,
  titre: string, detail: string, recommandation: string, reference_normative: string, action_odoo: string,
): AuditFinding {
  return {
    categorie_assertion, assertion, cycle, gravite, titre, detail, recommandation, reference_normative, action_odoo,
    comptes: extractComptes(detail, recommandation, action_odoo),
  };
}

/* ------------------------------------------------------------------ */
/* Constats PAIE (local)                                              */
/* ------------------------------------------------------------------ */

export function localPayrollFindings(year: number, month: number): AuditFinding[] {
  const s = getState();
  const firm = currentFirm(s);
  const p = getParams(year);
  const active = employeesOfFirm(s, firm.id).filter((e) => e.is_active);
  const snap = buildAuditSnapshot(year, month);
  const totals = snap.totals;
  const entries = snap.entries;
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);

  // Bases des écritures de correction (calculées une fois).
  const cnssTotal = round2(totals.cnssSalarie + totals.amoSalarie + totals.cnssPatronal + totals.amoPatronal + totals.af);
  const totalPatronalRate = p.cnssEmployerRate + p.familyAllocRate + p.amoEmployerRate + p.tfpRate;
  // Provision congés payés = Σ (solde de congés acquis non pris × salaire journalier) + charges patronales.
  const congesBase = round2(
    active.reduce((sum, e) => {
      const solde = Math.max(0, leaveBalance(e, s.leaves, periodEnd).balance);
      const sj = ((e.base_hourly_rate || 0) * (e.monthly_hours || 0)) / 26; // salaire journalier (26 j)
      return sum + solde * sj;
    }, 0),
  );
  const congesCharges = round2(congesBase * totalPatronalRate);

  const out: AuditFinding[] = [];

  const noRate = active.filter((e) => !e.base_hourly_rate || e.base_hourly_rate <= 0);
  if (noRate.length)
    out.push(F("flux", "Réalité", "paie", "eleve", `${noRate.length} salarié(s) sans taux horaire`,
      `Salarié(s) actif(s) sans base de rémunération : ${names(noRate)}. La charge de paie ne repose sur aucun montant réel.`,
      "Renseigner le salaire de base ou désactiver le salarié s'il n'est plus payé.",
      "CGNC (réalité) ; Code du travail (contrat de travail).",
      "hr.employee/hr.contract : compléter le salaire ; désactiver le contrat inactif."));

  const sousSmig = active.filter((e) => e.base_hourly_rate > 0 && e.base_hourly_rate < p.smigHourly);
  if (sousSmig.length)
    out.push(F("flux", "Mesure", "paie", "critique", `${sousSmig.length} salarié(s) sous le SMIG horaire (${p.smigHourly} DH)`,
      `Taux horaire inférieur au minimum légal : ${names(sousSmig)}.`,
      `Relever le taux horaire à ≥ ${p.smigHourly} DH (SMIG en vigueur).`,
      "SMIG (décret) ; Code du travail art. 356.",
      "Contrôler les règles salariales ; corriger hr.contract.wage."));

  const badHours = active.filter((e) => e.monthly_hours && e.monthly_hours !== p.legalMonthlyHours);
  if (badHours.length)
    out.push(F("flux", "Mesure", "paie", "info", `${badHours.length} salarié(s) avec heures mensuelles ≠ ${p.legalMonthlyHours} h`,
      `Base mensuelle non standard : ${names(badHours)}. À justifier (temps partiel, convention).`,
      "Vérifier la cohérence heures/temps de travail contractuel.",
      "Base légale mensuelle 191 h (Code du travail).",
      "hr.contract : paramétrer le temps de travail (resource.calendar)."));

  if (totals.salaireBrut > 0 && (totals.cnssPatronal === 0 || totals.af === 0 || totals.tfp === 0))
    out.push(withCorrection(
      F("flux", "Exhaustivité", "dettes sociales", "critique", "Charges patronales incomplètes",
        `Salaires bruts comptabilisés (${dh(totals.salaireBrut)}) mais une charge patronale est nulle (CNSS ${dh(totals.cnssPatronal)} / AF ${dh(totals.af)} / TFP ${dh(totals.tfp)}).`,
        "Comptabiliser l'intégralité des charges patronales (CNSS, AMO, AF, TFP).",
        "CGNC (exhaustivité) ; CNSS (cotisation patronale obligatoire).",
        "Vérifier les taxes de paie et leur comptabilisation dans account.move."),
      {
        comprendre:
          "Une charge patronale nulle alors qu'il y a du brut = soit une exonération LÉGITIME (dispositif ANAPEC/stage), "
          + "soit une OMISSION (charges sous-évaluées, dette organisme minorée, risque de rappel + majorations). "
          + "À qualifier AVANT toute écriture : ne pas constater une charge qui est légalement exonérée.",
        etapes: [
          "Vérifier si les salariés concernés sont exonérés (ANAPEC/TAHFIZ/stage) — dans ce cas, aucune écriture.",
          "Si omission réelle : recalculer chaque charge manquante = assiette × taux (part patronale).",
          "Passer D 617411/617412/61744 (charge) / C 4441, et D 61671 / C 4457 pour la TFP.",
        ],
        ecriture: null, // pas d'écriture automatique : le 0 peut être une exonération légitime — à qualifier d'abord.
      },
    ));

  const cddNoEnd = active.filter((e) => e.contract_type === "CDD" && !e.contract_end);
  if (cddNoEnd.length)
    out.push(F("flux", "Exhaustivité", "paie", "moyen", `${cddNoEnd.length} CDD sans date d'échéance`,
      `CDD sans terme renseigné : ${names(cddNoEnd)}.`,
      "Renseigner la date de fin du CDD.", "Code du travail art. 16-17 (CDD).", "hr.contract : renseigner date_end."));

  const expired = active.filter((e) => e.contract_end && new Date(e.contract_end) < periodStart);
  if (expired.length)
    out.push(F("flux", "Séparation des exercices", "paie", "eleve", `${expired.length} contrat(s) échu(s) avant la période`,
      `Salarié(s) actif(s) dont le contrat s'est terminé avant ${snap.period} : ${names(expired)}. Charge à ne plus constater.`,
      "Clôturer le contrat et arrêter la paie, ou justifier le renouvellement.",
      "CGNC (spécialisation des exercices).", "hr.contract : état 'Terminé' ; contrôler la date comptable."));

  const futureHire = active.filter((e) => new Date(e.hire_date) > periodEnd);
  if (futureHire.length)
    out.push(F("flux", "Séparation des exercices", "paie", "moyen", `${futureHire.length} embauche(s) postérieure(s) à la période`,
      `Date d'embauche après ${snap.period} : ${names(futureHire)}.`,
      "Ne pas comptabiliser de charge avant la date d'embauche.",
      "CGNC (spécialisation des exercices).", "Contrôler la date de l'account.move."));

  const expiring = active.filter((e) => {
    if (e.contract_type !== "CDD" || !e.contract_end) return false;
    const d = (new Date(e.contract_end).getTime() - periodEnd.getTime()) / 8.64e7;
    return d >= 0 && d <= 30;
  });
  if (expiring.length)
    out.push(F("flux", "Séparation des exercices", "paie", "info", `${expiring.length} CDD arrivant à échéance sous 30 j`,
      `Échéances proches : ${names(expiring)}.`,
      "Préparer le cut-off (indemnités, congés) et la décision de renouvellement.",
      "Code du travail ; CGNC (rattachement).", "Provisionner via OD datée à la clôture si nécessaire."));

  const acc = DEFAULT_ACCOUNTS;
  if (acc.etatTfp === acc.cnssOrganisme)
    out.push(withCorrection(
      F("flux", "Classification", "paie", "eleve", "TFP imputée avec les organismes sociaux",
        "La TFP (taxe) est comptabilisée dans le compte CNSS au lieu d'un compte d'État (4457).",
        "Reclasser la TFP en 4457 (État – impôts et taxes).", "PCGE (classification).",
        "Mapper la taxe TFP sur le compte 4457 (plan l10n_ma)."),
      {
        comprendre:
          "La TFP est une TAXE due à l'État (OFPPT), pas une cotisation sociale. Logée avec la CNSS (4441), "
          + "elle fausse le solde des organismes sociaux et le rapprochement du bordereau CNSS.",
        etapes: [
          "Isoler le montant de TFP inclus dans le compte 4441.",
          "Passer l'OD de reclassement D 4441 / C 4457.",
          "Corriger le plan de comptes (mapper la TFP sur 4457) pour éviter la récidive.",
        ],
        ecriture: mkEntry("OD", "Reclassement de la TFP (organismes sociaux → État)", [
          { compte: "4441", libelle: "CNSS — organismes sociaux", debit: totals.tfp, credit: 0 },
          { compte: "4457", libelle: "État — TFP à payer", debit: 0, credit: totals.tfp },
        ]),
      },
    ));

  const noCnss = active.filter((e) => !e.cnss_number);
  if (noCnss.length)
    out.push(F("soldes", "Existence", "dettes sociales", "critique", `${noCnss.length} salarié(s) non immatriculé(s) CNSS`,
      `Sans n° CNSS, la dette sociale ne peut être ni déclarée ni justifiée : ${names(noCnss)}.`,
      "Immatriculer les salariés à la CNSS et compléter le dossier.",
      "Dahir 1-72-184 (régime CNSS) — immatriculation obligatoire.",
      "hr.employee : renseigner l10n_ma_cnss_number ; déclarer via DAMANCOM."));

  if (!firm.cnss_affiliation && active.length)
    out.push(F("soldes", "Droits et obligations", "dettes sociales", "critique", "Société sans n° d'affiliation CNSS",
      `${active.length} salarié(s) mais aucun numéro d'affiliation CNSS pour la société.`,
      "Renseigner/obtenir l'affiliation CNSS de l'entité.", "CNSS (affiliation employeur obligatoire).",
      "res.company : renseigner l'identifiant CNSS."));

  if (!firm.ice)
    out.push(F("soldes", "Droits et obligations", "presentation", "eleve", "ICE manquant",
      "L'Identifiant Commun de l'Entreprise n'est pas renseigné.",
      "Renseigner l'ICE (obligatoire sur factures et déclarations).", "Arrêté ICE.", "res.company : champ ICE (l10n_ma)."));
  if (!firm.if_fiscal)
    out.push(F("soldes", "Droits et obligations", "dettes fiscales", "moyen", "Identifiant fiscal (IF) manquant",
      "L'IF n'est pas renseigné, indispensable aux déclarations fiscales.",
      "Renseigner l'IF de l'entité.", "CGI (identification fiscale).", "res.company : identifiant fiscal."));

  const congesTotal = round2(congesBase + congesCharges);
  out.push(withCorrection(
    F("soldes", "Exhaustivité", "paie", "moyen", "Provision pour congés payés non constatée",
      "L'application ne comptabilise pas la provision pour congés payés (1,5 j/mois) ni les charges sociales afférentes.",
      "Constituer une provision congés payés à la clôture (dette envers le personnel).",
      "CGNC (spécialisation, prudence).", "OD de provision datée à la clôture ; contre-passation à l'ouverture."),
    {
      comprendre:
        `Les congés acquis non pris sont une DETTE CERTAINE envers le personnel (+ charges patronales), rattachable à l'exercice. `
        + `Non constatée, elle minore les charges de personnel et surévalue le résultat et l'IS. `
        + (congesBase > 0
          ? `Estimation à fin ${snap.period} : base congés ${dh(congesBase)} + charges patronales (${(totalPatronalRate * 100).toFixed(2)} %) ${dh(congesCharges)} = ${dh(congesTotal)}.`
          : `Aucun solde de congés à provisionner sur les salariés actifs à fin ${snap.period}.`),
      etapes: [
        "Arrêter le solde de congés acquis non pris par salarié (volet Congés).",
        "Base = Σ (solde jours × salaire journalier 1/26) ; charges patronales = base × taux patronal.",
        "Passer l'OD de dotation à la clôture, puis la CONTRE-PASSER au 1er jour de l'exercice suivant.",
      ],
      ecriture: congesBase > 0
        ? mkEntry("OD", "Dotation — provision congés payés (clôture)", [
            { compte: "6171", libelle: "Rémunérations — congés payés à payer", debit: congesBase, credit: 0 },
            { compte: "617x", libelle: "Charges patronales sur congés (CNSS/AMO/AF/TFP)", debit: congesCharges, credit: 0 },
            { compte: "4437", libelle: "Charges de personnel à payer (congés)", debit: 0, credit: congesTotal },
          ],
          `Méthode « charges à payer » (CGNC). Taux patronal ${(totalPatronalRate * 100).toFixed(2)} % (hors plafond CNSS — à ajuster si le plafond joue). À CONTRE-PASSER à l'ouverture : D 4437 / C 6171 & 617x. Ventiler 617x selon vos sous-comptes (617411/617412/61744/61671).`)
        : null,
    },
  ));

  out.push(withCorrection(
    F("soldes", "Évaluation et imputation", "dettes sociales", "info", "Rapprocher le solde 4441 avec le bordereau CNSS",
      "Le solde des organismes sociaux (4441) à la clôture doit correspondre au bordereau CNSS du mois.",
      "Rapprocher et lettrer le compte 4441 avec le bordereau et le paiement.",
      "CNSS ; CGNC (évaluation).", "Lettrage des account.move.line 4441."),
    {
      comprendre:
        `Le solde 4441 (${dh(cnssTotal)} : CNSS + AMO + AF, parts salariale et patronale) doit être réglé à la CNSS (DAMANCOM) `
        + `et correspondre au bordereau du mois. Un écart = cotisation oubliée, double comptabilisation ou TFP encore logée en 4441.`,
      etapes: [
        "Rapprocher le solde 4441 au montant du bordereau CNSS du mois.",
        "Télédéclarer et télépayer via DAMANCOM dans le délai légal.",
        "Lettrer le règlement ; un résidu = la TFP si elle n'a pas été reclassée en 4457.",
      ],
      ecriture: cnssTotal > 0
        ? mkEntry("BQ", "Règlement des cotisations CNSS (bordereau)", [
            { compte: "4441", libelle: "CNSS — organismes sociaux", debit: cnssTotal, credit: 0 },
            { compte: "5141", libelle: "Banque", debit: 0, credit: cnssTotal },
          ])
        : null,
    },
  ));

  if (totals.ir > 0)
    out.push(withCorrection(
      F("soldes", "Existence", "dettes fiscales", "info", "IR retenu (44525) à verser le mois suivant",
        `IR salarial retenu : ${dh(totals.ir)}. Versement à la DGI dû avant la fin du mois suivant.`,
        "Verser l'IR retenu dans le délai légal (éviter les pénalités).",
        "CGI (retenue à la source sur salaires).", "Lettrer le versement (account.move.line 44525)."),
      {
        comprendre:
          `IR retenu à la source sur salaires (${dh(totals.ir)}) : c'est une dette envers l'État à décaisser `
          + `(télépaiement SIMPL-IR) avant la fin du mois suivant. Retard = majorations de retard.`,
        etapes: [
          "Rapprocher l'IR retenu du cumul des bulletins du mois.",
          "Télépayer l'IR à la DGI (SIMPL-IR) dans le délai légal.",
          "Solder le compte 44525 après paiement (lettrage).",
        ],
        ecriture: mkEntry("BQ", "Versement de l'IR retenu à la source (DGI)", [
          { compte: "44525", libelle: "État — IR retenu à la source", debit: totals.ir, credit: 0 },
          { compte: "5141", libelle: "Banque", debit: 0, credit: totals.ir },
        ]),
      },
    ));

  const unbalanced = entries.filter((e) => !e.balanced);
  if (unbalanced.length)
    out.push(F("presentation", "Exactitude et évaluation", "tresorerie", "critique", "Écriture(s) de paie déséquilibrée(s)",
      `Σ débit ≠ Σ crédit (${unbalanced.map((e) => e.reference).join(", ")}).`,
      "Rétablir l'équilibre de la partie double avant intégration.",
      "CGNC (partie double).", "Reconstruire une account.move équilibrée."));

  const noCin = active.filter((e) => !e.cin);
  if (noCin.length)
    out.push(F("presentation", "Exactitude et évaluation", "paie", "moyen", `${noCin.length} salarié(s) sans CIN au dossier`,
      `Pièce d'identité manquante : ${names(noCin)}.`,
      "Compléter la CIN dans les dossiers salariés.", "Code du travail (registre du personnel).", "hr.employee : renseigner la CIN."));

  const minorsHaz = active.filter((e) => e.birth_date && e.hazardous_site && ageYears(e.birth_date, periodEnd) < 18);
  if (minorsHaz.length)
    out.push(F("flux", "Réalité", "paie", "critique", `${minorsHaz.length} mineur(s) sur site dangereux`,
      `Salarié(s) de moins de 18 ans affecté(s) à un site dangereux : ${names(minorsHaz)}.`,
      "Retirer immédiatement le mineur du site dangereux (interdiction légale).",
      "Code du travail art. 143-147.", "hr.employee : contrôler l'âge et l'affectation."));

  return out.map((f) => ({ ...f, source: "paie" as const }));
}

/* ------------------------------------------------------------------ */
/* Constats COMPTABILITÉ ODOO (lecture seule)                         */
/* ------------------------------------------------------------------ */

const startsWithAny = (code: string, prefixes: string[]) => prefixes.some((p) => code.startsWith(p));

export function odooFindings(d: OdooAccountingData): AuditFinding[] {
  const out: AuditFinding[] = [];
  const sum = (list: { balance: number }[]) => list.reduce((s, b) => s + b.balance, 0);

  // Présentation — Exactitude & évaluation : équilibre de la balance générale.
  const delta = Math.round((d.totalDebit - d.totalCredit) * 100) / 100;
  if (Math.abs(delta) > 0.01)
    out.push(F("presentation", "Exactitude et évaluation", "comptabilité générale", "critique",
      "Balance générale déséquilibrée",
      `Σ débit ${dh(d.totalDebit)} ≠ Σ crédit ${dh(d.totalCredit)} (écart ${dh(delta)}) sur ${d.year}.`,
      "Identifier l'écriture ou l'import à l'origine du déséquilibre.",
      "CGNC (partie double).", "Balance générale Odoo ; contrôler les imports/écritures manuelles."));
  else
    out.push(F("presentation", "Exactitude et évaluation", "comptabilité générale", "info",
      "Balance générale équilibrée",
      `Σ débit = Σ crédit = ${dh(d.totalDebit)} (écritures postées ${d.year}).`,
      "Aucune action ; contrôle satisfait.", "CGNC (partie double).", "RAS."));

  // Existence / Exhaustivité : aucune écriture postée sur l'exercice.
  if (d.postedMoves === 0)
    out.push(F("soldes", "Exhaustivité", "comptabilité générale", "eleve",
      "Aucune écriture postée sur l'exercice",
      `Aucun account.move posté pour la société sur ${d.year} : exercice vierge ou mauvais paramétrage société/période.`,
      "Vérifier la société sélectionnée et la période comptable.",
      "CGNC (exhaustivité).", "Contrôler company_id et l'exercice fiscal."));

  // Réalité : écritures en brouillon non validées.
  if (d.draftMoves > 0)
    out.push(F("flux", "Réalité", "comptabilité générale", "moyen",
      `${d.draftMoves} écriture(s) en brouillon`,
      `${d.draftMoves} account.move non postée(s) sur ${d.year} : opérations non actées, exclues de la balance.`,
      "Revoir, justifier puis valider (ou supprimer) les brouillons avant clôture.",
      "CGNC (réalité, exhaustivité).", "Comptabilité → Écritures : filtrer state=draft, poster ou annuler."));

  // Exhaustivité : journaux sans écriture postée.
  const emptyJournals = d.journals.filter((j) => !d.journalsWithPosted.has(j.id));
  if (emptyJournals.length && d.postedMoves > 0)
    out.push(F("flux", "Exhaustivité", "comptabilité générale", "info",
      `${emptyJournals.length} journal(aux) sans écriture postée`,
      `Journaux inactifs sur ${d.year} : ${emptyJournals.map((j) => j.code || j.name).slice(0, 8).join(", ")}. À justifier (activité réelle ?).`,
      "Vérifier qu'aucune opération n'a été omise dans ces journaux.",
      "CGNC (exhaustivité).", "account.journal : contrôler l'activité par journal."));

  // Classification : charges (classe 6) au solde créditeur / produits (classe 7) au solde débiteur.
  const chargesAbn = d.balances.filter((b) => b.code.startsWith("6") && b.balance < -0.01);
  if (chargesAbn.length) {
    const totalAbn = round2(chargesAbn.reduce((s, b) => s + -b.balance, 0));
    out.push(withElements(withCorrection(
      F("flux", "Classification", "achats/charges", "eleve",
        `${chargesAbn.length} compte(s) de charges au solde créditeur`,
        `Solde anormal (créditeur) sur des comptes de classe 6 : ${chargesAbn.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
        "Vérifier l'imputation (avoir mal classé, produit en charge, écriture inversée).",
        "PCGE (classification).", "Grand livre du compte ; reclasser via OD."),
      {
        comprendre:
          "Une charge (classe 6) est débitrice par nature. Un solde CRÉDITEUR révèle un avoir mal classé, un produit "
          + "logé en charge, ou une écriture inversée → charges minorées et résultat (donc IS) surévalué.",
        etapes: [
          "Sortir le grand-livre de chaque compte pour identifier l'écriture anormale.",
          "Solder provisoirement en compte d'attente 471, puis réimputer au bon compte (produit 7xxx, tiers…).",
          "Documenter la cause pour éviter la récidive.",
        ],
        ecriture: mkEntry("OD", "Mise en attente des charges au solde créditeur (à réimputer)", [
          ...chargesAbn.map((b) => ({ compte: b.code, libelle: `${b.name}`.slice(0, 58), debit: round2(-b.balance), credit: 0 })),
          { compte: "471", libelle: "Compte d'attente — à réimputer après analyse", debit: 0, credit: totalAbn },
        ], "Écriture de MISE EN ATTENTE : le compte définitif dépend de l'analyse pièce par pièce. Réimputer depuis 471 vers le bon compte."),
      },
    ), elts(chargesAbn)));
  }
  const produitsAbn = d.balances.filter((b) => b.code.startsWith("7") && b.balance > 0.01);
  if (produitsAbn.length) {
    const totalPrAbn = round2(produitsAbn.reduce((s, b) => s + b.balance, 0));
    out.push(withElements(withCorrection(
      F("flux", "Classification", "ventes/produits", "eleve",
        `${produitsAbn.length} compte(s) de produits au solde débiteur`,
        `Solde anormal (débiteur) sur des comptes de classe 7 : ${produitsAbn.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
        "Vérifier l'imputation (avoir client, charge en produit, écriture inversée).",
        "PCGE (classification).", "Grand livre du compte ; reclasser via OD."),
      {
        comprendre:
          "Un produit (classe 7) est créditeur par nature. Un solde DÉBITEUR révèle un avoir client mal classé, "
          + "une charge logée en produit, ou une écriture inversée → produits minorés et résultat (donc IS) sous-évalué.",
        etapes: [
          "Sortir le grand-livre de chaque compte de produit concerné pour identifier l'écriture anormale.",
          "Solder provisoirement en compte d'attente 471, puis réimputer au bon compte (charge 6xxx, avoir client 3421…).",
          "Documenter la cause (avoir non rattaché, saisie inversée) pour éviter la récidive.",
        ],
        ecriture: mkEntry("OD", "Mise en attente des produits au solde débiteur (à réimputer)", [
          { compte: "471", libelle: "Compte d'attente — à réimputer après analyse", debit: totalPrAbn, credit: 0 },
          ...produitsAbn.map((b) => ({ compte: b.code, libelle: `${b.name}`.slice(0, 58), debit: 0, credit: round2(b.balance) })),
        ], "Écriture de MISE EN ATTENTE : le compte définitif dépend de l'analyse pièce par pièce. Réimputer depuis 471 vers le bon compte."),
      },
    ), elts(produitsAbn)));
  }

  // Existence / Évaluation : clients créditeurs (342x) / fournisseurs débiteurs (441x).
  const clientsCred = d.balances.filter((b) => startsWithAny(b.code, ["342", "3421"]) && b.balance < -0.01);
  if (clientsCred.length) {
    const totalCred = round2(clientsCred.reduce((s, b) => s + -b.balance, 0));
    out.push(withElements(withCorrection(
      F("soldes", "Existence", "ventes/clients", "moyen",
        `${clientsCred.length} compte(s) client au solde créditeur`,
        `Clients (342x) au solde créditeur : ${clientsCred.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}. Avances/avoirs ou erreur d'imputation.`,
        "Analyser et lettrer ; reclasser les avances en 4421 si nécessaire.",
        "CGNC (existence, évaluation).", "Lettrage des écritures clients ; reclassement des avances."),
      {
        comprendre:
          "Un compte client créditeur = une AVANCE reçue (ou un avoir) logée à l'actif. Le bilan ne peut compenser "
          + "actif et passif : cette avance doit figurer au passif (4421), sinon les créances clients sont sous-évaluées.",
        etapes: [
          "Analyser chaque solde créditeur (avance réelle vs erreur d'imputation).",
          "Reclasser les avances en 4421 (Clients — avances et acomptes reçus).",
          "Contre-passer à l'ouverture N+1 lorsque l'avance se dénoue par facturation.",
        ],
        ecriture: mkEntry("OD", "Reclassement des avances clients (soldes créditeurs)", [
          ...clientsCred.map((b) => ({ compte: b.code, libelle: `Client ${b.name}`.slice(0, 58), debit: round2(-b.balance), credit: 0 })),
          { compte: "4421", libelle: "Clients — avances et acomptes reçus", debit: 0, credit: totalCred },
        ]),
      },
    ), elts(clientsCred)));
  }
  const fournDeb = d.balances.filter((b) => startsWithAny(b.code, ["441", "4411"]) && b.balance > 0.01);
  if (fournDeb.length) {
    const totalDeb = round2(fournDeb.reduce((s, b) => s + b.balance, 0));
    out.push(withElements(withCorrection(
      F("soldes", "Existence", "achats/fournisseurs", "moyen",
        `${fournDeb.length} compte(s) fournisseur au solde débiteur`,
        `Fournisseurs (441x) au solde débiteur : ${fournDeb.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}. Avances/avoirs ou erreur d'imputation.`,
        "Analyser et lettrer ; reclasser les avances en 3411 si nécessaire.",
        "CGNC (existence, évaluation).", "Lettrage des écritures fournisseurs ; reclassement des avances."),
      {
        comprendre:
          "Un compte fournisseur débiteur = une AVANCE versée (ou un avoir) logée au passif. Elle doit figurer à l'actif "
          + "(3411), sinon les dettes fournisseurs sont sous-évaluées et la présentation du bilan est faussée.",
        etapes: [
          "Analyser chaque solde débiteur (avance réelle vs erreur d'imputation).",
          "Reclasser les avances en 3411 (Fournisseurs — avances et acomptes versés).",
          "Contre-passer à l'ouverture N+1 au dénouement (réception de la facture).",
        ],
        ecriture: mkEntry("OD", "Reclassement des avances fournisseurs (soldes débiteurs)", [
          { compte: "3411", libelle: "Fournisseurs — avances et acomptes versés", debit: totalDeb, credit: 0 },
          ...fournDeb.map((b) => ({ compte: b.code, libelle: `Fournisseur ${b.name}`.slice(0, 58), debit: 0, credit: round2(b.balance) })),
        ]),
      },
    ), elts(fournDeb)));
  }

  // Évaluation : comptes d'attente / transitoires non soldés.
  const suspense = d.balances.filter(
    (b) => (/attente|suspens|transit|transfert|à\s*r[ée]gulariser/i.test(b.name) || startsWithAny(b.code, ["471", "472", "3491", "4491"])) && Math.abs(b.balance) > 0.01,
  );
  if (suspense.length)
    out.push(withElements(withCorrection(
      F("soldes", "Évaluation et imputation", "comptabilité générale", "eleve",
        `${suspense.length} compte(s) d'attente non soldé(s)`,
        `Comptes transitoires avec un solde résiduel : ${suspense.slice(0, 6).map((b) => `${b.code} ${b.name} (${dh(b.balance)})`).join(", ")}.`,
        "Solder les comptes d'attente avant clôture (imputation définitive).",
        "CGNC (évaluation) ; comptes de régularisation.", "Grand livre ; réimputer via OD, lettrer."),
      {
        comprendre:
          "Un compte d'attente (471/472) doit être VIDE à la clôture. Un solde résiduel = opération non qualifiée : "
          + "charge/produit potentiellement non rattaché à l'exercice → réserve d'audit.",
        etapes: [
          "Lister les mouvements non soldés des comptes 471/472.",
          "Qualifier chaque ligne (charge, produit, immobilisation, tiers…).",
          "Réimputer au compte définitif : si 471 débiteur → C 471 / D compte définitif ; si 472 créditeur → D 472 / C compte définitif.",
        ],
        ecriture: null, // pas d'écriture automatique : le compte de contrepartie exige une analyse humaine.
      },
    ), elts(suspense)));

  // TVA : cohérence collectée (4455) vs déductible (3455).
  const tvaColl = d.balances.filter((b) => b.code.startsWith("4455"));
  const tvaDed = d.balances.filter((b) => b.code.startsWith("3455"));
  if (tvaColl.length || tvaDed.length) {
    const coll = -sum(tvaColl); // TVA facturée = compte créditeur → montant positif = -balance
    const ded = sum(tvaDed);    // TVA déductible = compte débiteur → balance positive
    const due = Math.round((coll - ded) * 100) / 100;
    // Écriture de liquidation : TVA due (4456, passif) si positif ; crédit de TVA (3456, actif) sinon.
    const tvaEcriture = due >= 0
      ? mkEntry("OD", "Liquidation de la TVA — TVA due", [
          { compte: "4455", libelle: "État — TVA facturée (collectée)", debit: coll, credit: 0 },
          { compte: "3455", libelle: "État — TVA récupérable (déductible)", debit: 0, credit: ded },
          { compte: "4456", libelle: "État — TVA due (à décaisser)", debit: 0, credit: due },
        ], "Paiement ensuite : D 4456 / C 5141 (échéance mensuelle SIMPL-TVA, à confirmer selon le régime).")
      : mkEntry("OD", "Liquidation de la TVA — crédit reportable", [
          { compte: "4455", libelle: "État — TVA facturée (collectée)", debit: coll, credit: 0 },
          { compte: "3456", libelle: "État — crédit de TVA (report)", debit: round2(-due), credit: 0 },
          { compte: "3455", libelle: "État — TVA récupérable (déductible)", debit: 0, credit: ded },
        ], "Crédit de TVA reportable sur la période suivante — ne jamais compenser d'un mois à l'autre sans report explicite.");
    out.push(withCorrection(
      F("presentation", "Exactitude et évaluation", "dettes fiscales", "info",
        "TVA — rapprochement collectée / déductible",
        `TVA collectée (4455) ≈ ${dh(coll)} ; TVA déductible (3455) ≈ ${dh(ded)} ; TVA due estimée ≈ ${dh(due)} sur ${d.year}.`,
        "Rapprocher avec les déclarations de TVA déposées ; vérifier le régime (encaissements/débits).",
        "CGI (TVA) ; CGNC.", "États de TVA Odoo ; rapprocher les déclarations."),
      {
        comprendre:
          `Confronter la TVA collectée (${dh(coll)}) et déductible (${dh(ded)}) donne la TVA ${due >= 0 ? "DUE" : "en CRÉDIT"} `
          + `(${dh(Math.abs(due))}). Une liquidation non passée fausse la dette fiscale et le résultat de trésorerie prévisionnel. `
          + `Rappel CGNC : la TVA DUE est un passif (4456), le CRÉDIT de TVA un actif (3456).`,
        etapes: [
          "Rapprocher les soldes 4455/3455 avec les déclarations de TVA déposées.",
          `Router le net vers ${due >= 0 ? "4456 (TVA due à décaisser)" : "3456 (crédit reportable)"}.`,
          due >= 0 ? "Décaisser la TVA due (D 4456 / C 5141) à l'échéance." : "Reporter le crédit sur la déclaration suivante.",
        ],
        ecriture: (coll > 0 || ded > 0) ? tvaEcriture : null,
      },
    ));
    const collAbn = tvaColl.filter((b) => b.balance > 0.01);
    if (collAbn.length)
      out.push(withElements(F("flux", "Classification", "dettes fiscales", "moyen",
        "TVA facturée (4455) au solde débiteur",
        `Solde anormal (débiteur) : ${collAbn.map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
        "Vérifier l'imputation de la TVA collectée.", "CGI (TVA) ; PCGE.", "Grand livre 4455 ; corriger l'imputation."), elts(collAbn)));
  }

  // Lettrage : créances clients postées non rapprochées.
  if (d.unreconciledReceivable && d.unreconciledReceivable.count > 0)
    out.push(F("soldes", "Existence", "ventes/clients", "moyen",
      `${d.unreconciledReceivable.count} écriture(s) client non lettrée(s)`,
      `Créances clients postées non rapprochées : résidu ≈ ${dh(d.unreconciledReceivable.amount)}. Un solde non lettré fragilise l'existence/l'évaluation des créances et le suivi des impayés.`,
      "Lettrer les règlements avec les factures ; analyser les résidus anciens.",
      "CGNC (existence, évaluation) ; assertions clients.", "Comptabilité → Lettrage des comptes clients (account.move.line non rapprochées)."));

  // Lettrage : dettes fournisseurs postées non rapprochées.
  if (d.unreconciledPayable && d.unreconciledPayable.count > 0)
    out.push(F("soldes", "Exhaustivité", "achats/fournisseurs", "moyen",
      `${d.unreconciledPayable.count} écriture(s) fournisseur non lettrée(s)`,
      `Dettes fournisseurs postées non rapprochées : résidu ≈ ${dh(d.unreconciledPayable.amount)}. Le passif fournisseur peut être sur/sous-évalué tant que le lettrage n'est pas fait.`,
      "Lettrer les paiements avec les factures ; solder les résidus justifiés.",
      "CGNC (exhaustivité, évaluation) ; assertions fournisseurs.", "Comptabilité → Lettrage des comptes fournisseurs."));

  // Cut-off / évaluation : factures clients échues impayées.
  if (d.overdueReceivable && d.overdueReceivable.count > 0)
    out.push(F("soldes", "Évaluation et imputation", "ventes/clients", "eleve",
      `${d.overdueReceivable.count} facture(s) client échue(s) impayée(s)`,
      `Créances clients échues et non soldées : résidu ≈ ${dh(d.overdueReceivable.amount)}. Risque de non-recouvrement → dépréciation possible à la clôture.`,
      "Relancer le recouvrement ; évaluer une provision pour dépréciation des créances douteuses.",
      "CGNC (prudence, évaluation) ; CGI (créances irrécouvrables).", "Analyse balance âgée clients (aged receivable) ; provisionner via OD."));

  // Cut-off : factures fournisseurs échues impayées.
  if (d.overduePayable && d.overduePayable.count > 0)
    out.push(F("soldes", "Exhaustivité", "achats/fournisseurs", "moyen",
      `${d.overduePayable.count} facture(s) fournisseur échue(s) impayée(s)`,
      `Dettes fournisseurs échues non réglées : résidu ≈ ${dh(d.overduePayable.amount)}. À rapprocher de la trésorerie disponible et des échéanciers.`,
      "Planifier les règlements ; vérifier qu'aucune facture n'a été omise (rattachement à l'exercice).",
      "CGNC (exhaustivité, rattachement).", "Analyse balance âgée fournisseurs (aged payable)."));

  // Exhaustivité : ventilation réelle des écritures postées par type (globalité de la compta).
  if (d.postedByType && d.postedByType.length) {
    const total = d.postedByType.reduce((s, x) => s + x.count, 0);
    const ventil = d.postedByType
      .map((x) => `${MOVE_TYPE_FR[x.move_type] ?? x.move_type} : ${x.count}`)
      .join(" · ");
    out.push(F("presentation", "Exhaustivité", "comptabilité générale", "info",
      "Ventilation des écritures postées par type de pièce",
      `${total} pièce(s) postée(s) sur ${d.year} — ${ventil}. Vue d'ensemble de l'activité comptable réellement enregistrée (ventes, achats, banque, divers).`,
      "Contrôler que tous les cycles attendus sont présents (aucune activité omise).",
      "CGNC (exhaustivité).", "Comptabilité → Écritures : recouper par type/journal."));
  }

  return out.map((f) => ({ ...f, source: "odoo" as const }));
}

/** Mappe des lignes de balance Odoo en éléments anormaux (code + intitulé + montant + id). */
const elts = (rows: { id: number; code: string; name: string; balance: number }[]): ElementAnormal[] =>
  rows.map((b) => ({ id: b.id, code: b.code, name: b.name, montant: b.balance }));

/** Libellés FR des types de pièce Odoo (account.move.move_type). */
const MOVE_TYPE_FR: Record<string, string> = {
  entry: "OD / divers",
  out_invoice: "Factures clients",
  out_refund: "Avoirs clients",
  in_invoice: "Factures fournisseurs",
  in_refund: "Avoirs fournisseurs",
  out_receipt: "Reçus de vente",
  in_receipt: "Reçus d'achat",
};

/* ------------------------------------------------------------------ */
/* Assemblage du rapport                                              */
/* ------------------------------------------------------------------ */

const RANK: Record<Gravite, number> = { critique: 0, eleve: 1, moyen: 2, info: 3 };

function assembleReport(findings: AuditFinding[], firmName: string, scope: string): AuditReport {
  const by = { critique: 0, eleve: 0, moyen: 0, info: 0 };
  for (const c of findings) by[c.gravite] += 1;
  const score = Math.max(0, 100 - (by.critique * 20 + by.eleve * 10 + by.moyen * 5 + by.info * 1));
  const synthese =
    `${firmName} — périmètre : ${scope}. ${by.critique} constat(s) critique(s), ${by.eleve} élevé(s), ` +
    `${by.moyen} moyen(s), ${by.info} pour information (${findings.length} au total).`;
  const sorted = [...findings].sort((a, b) => RANK[a.gravite] - RANK[b.gravite]);
  return { synthese, score_fiabilite: score, scope, constats: sorted };
}

/* ------------------------------------------------------------------ dossier de régularisation ------------------------------------------------------------------ */

/**
 * Construit un DOSSIER DE RÉGULARISATION lisible à partir du rapport d'audit — une PROPOSITION
 * traçable, PAS une écriture appliquée. Chaque constat devient une fiche : comptes concernés,
 * problème, correction proposée, référence normative et action Odoo. L'exécution réelle dans Odoo
 * reste faite par le comptable (ou via le skill `odoo-correction-anomalies`), jamais en aveugle.
 * Fonction PURE (texte Markdown).
 */
export function buildRegularisationDossier(report: AuditReport, firmName: string, period: string): string {
  const lines: string[] = [];
  lines.push(`# Dossier de régularisation — ${firmName}`);
  lines.push(`Période : ${period} · Périmètre : ${report.scope} · Fiabilité : ${report.score_fiabilite}/100`);
  lines.push("");
  lines.push("> PROPOSITION de régularisation (non appliquée). Chaque écriture doit être contrôlée pièce");
  lines.push("> à l'appui puis passée dans Odoo par le comptable — aucune écriture n'est faite en aveugle.");
  lines.push("");
  const ordered = [...report.constats].sort((a, b) => RANK[a.gravite] - RANK[b.gravite]);
  ordered.forEach((c, i) => {
    lines.push(`## ${i + 1}. [${c.gravite.toUpperCase()}] ${c.titre}`);
    lines.push(`- Cycle / assertion : ${c.cycle} · ${c.assertion} (${c.categorie_assertion})`);
    if (c.comptes.length) lines.push(`- Comptes concernés : ${c.comptes.map(describeCompte).join(" ; ")}`);
    lines.push(`- Problème : ${c.detail}`);
    if (c.correction) {
      lines.push(`- Comprendre : ${c.correction.comprendre}`);
    }
    // Marche à suivre : toujours présente (étapes de la correction, sinon recommandation + action Odoo).
    const steps = findingSteps(c);
    if (steps.length) {
      lines.push(`- Comment procéder :`);
      steps.forEach((s, k) => lines.push(`  ${k + 1}. ${s}`));
    }
    if (c.correction) {
      const e = c.correction.ecriture;
      if (e) {
        lines.push(`- Écriture de correction (journal ${e.journal}) — ${e.libelle} :`);
        lines.push("");
        lines.push("  | Compte | Libellé | Débit | Crédit |");
        lines.push("  |---|---|---:|---:|");
        for (const l of e.lignes) {
          lines.push(`  | ${l.compte} | ${l.libelle} | ${l.debit ? l.debit.toFixed(2) : ""} | ${l.credit ? l.credit.toFixed(2) : ""} |`);
        }
        lines.push(`  | | **Total** | **${e.totalDebit.toFixed(2)}** | **${e.totalCredit.toFixed(2)}** |`);
        lines.push("");
        if (e.note) lines.push(`  > ${e.note}`);
      }
    }
    lines.push(`- Référence : ${c.reference_normative}`);
    lines.push(`- Action Odoo : ${c.action_odoo}`);
    lines.push("");
  });
  lines.push("---");
  lines.push("Exécution réelle : skill Claude Code `odoo-correction-anomalies` (lecture Odoo réelle,");
  lines.push("correction sûre, rapport de régularité) ou passage manuel par le comptable.");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Classement des corrections : AUTO (sans jugement) vs HUMAIN         */
/* ------------------------------------------------------------------ */

export type RemediationMode = "auto" | "humain";
export interface Remediation {
  mode: RemediationMode;
  reason: string;
}

/**
 * Détermine si un constat peut être corrigé AUTOMATIQUEMENT (sans intervention humaine).
 *
 * Doctrine (skill `odoo-correction-anomalies`) : n'est auto-corrigeable QUE ce qui est
 * mécanique, non ambigu et RÉVERSIBLE dans Odoo. En pratique, cela se limite au LETTRAGE
 * de lignes d'un même tiers qui s'apurent exactement (rapprochement `reconcile`, annulable).
 * Toute anomalie de FOND ou nécessitant un choix d'imputation, un contrôle de pièce, ou une
 * écriture nouvelle en production reste du ressort HUMAIN — jamais d'écriture en aveugle.
 */
export function classifyRemediation(f: AuditFinding): Remediation {
  if (/\bnon\s+lettr/i.test(f.titre)) {
    return {
      mode: "auto",
      reason: "Rapprochement automatique des écritures d'un même tiers qui s'apurent exactement — opération mécanique et réversible dans Odoo (account.move.line reconcile).",
    };
  }
  return {
    mode: "humain",
    reason: "Nécessite un jugement comptable (choix d'imputation, contrôle de pièce, base réelle, écriture nouvelle) : la correction est documentée et exécutée par le comptable.",
  };
}

/** Sépare les constats en deux volets : corrections automatiques vs intervention humaine. */
export function buildRemediationPlan(report: AuditReport): { auto: AuditFinding[]; humain: AuditFinding[] } {
  const auto: AuditFinding[] = [];
  const humain: AuditFinding[] = [];
  for (const c of report.constats) {
    (classifyRemediation(c).mode === "auto" ? auto : humain).push(c);
  }
  return { auto, humain };
}

/** Audit PAIE seule (synchrone, 100 % local). */
export function runLocalAudit(year: number, month: number): AuditReport {
  const firm = currentFirm(getState());
  return assembleReport(localPayrollFindings(year, month), firm.name, `Paie locale (${year}-${String(month).padStart(2, "0")})`);
}

/** Audit COMPLET : paie locale + toute la comptabilité Odoo (si connectée). Asynchrone. */
export async function runFullAudit(year: number, month: number): Promise<AuditReport> {
  const s = getState();
  const firm = currentFirm(s);
  const cfg = s.odoo;
  const findings = localPayrollFindings(year, month);

  const notReady = odooReadiness(cfg, { name: firm.name, odoo_company_id: firm.odoo_company_id });
  let scope = `Paie locale (${year}-${String(month).padStart(2, "0")})`;

  if (notReady) {
    findings.push(F("presentation", "Exhaustivité", "comptabilité générale", "info",
      "Comptabilité Odoo non incluse",
      `Périmètre limité à la paie locale — ${notReady}`,
      "Configurer/mapper Odoo pour auditer tous les cycles (achats, ventes, trésorerie, TVA).",
      "Information à obtenir.", "Paramètres → Connexion Odoo."));
  } else {
    try {
      const data = await fetchOdooAccounting(cfg!, firm.odoo_company_id!, year);
      findings.push(...odooFindings(data));
      scope = `Paie locale + comptabilité Odoo ${year}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      findings.push(F("presentation", "Exhaustivité", "comptabilité générale", "moyen",
        "Comptabilité Odoo inaccessible",
        `La lecture de la comptabilité Odoo a échoué : ${odooErrorHint(msg)}`,
        "Vérifier la connexion Odoo puis relancer pour couvrir tous les cycles.",
        "Information à obtenir.", "Paramètres → Connexion Odoo (Tester la connexion)."));
    }
  }

  return assembleReport(findings, firm.name, scope);
}
