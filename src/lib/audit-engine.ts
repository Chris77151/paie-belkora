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
import type { PayrollResult } from "@/lib/payroll-engine";
import { computeFor, defaultInput } from "@/lib/payroll-helpers";
import {
  buildPayrollEntry, buildSettlementEntry, sumResults, type JournalEntry,
} from "@/lib/payroll-accounting";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting-accounts";
import { getParams } from "@/lib/params";
import { odooReadiness, odooErrorHint } from "@/lib/odoo";
import { fetchOdooAccounting, type OdooAccountingData } from "@/lib/odoo-accounting";

export type AssertionCategory = "flux" | "soldes" | "presentation";
export type Gravite = "critique" | "eleve" | "moyen" | "info";

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
  const active = employeesOfFirm(s, firm.id).filter((e) => e.is_active);
  if (period) {
    const frozen = payslipsOfPeriod(s, period.id).filter((sl) => sl.result).map((sl) => sl.result as PayrollResult);
    if (frozen.length) return frozen;
  }
  return active.map((e) => computeFor(e, firm, year, month, defaultInput(e)));
}

export function buildAuditSnapshot(year: number, month: number): AuditSnapshot {
  const s = getState();
  const firm = currentFirm(s);
  const totals = sumResults(resultsFor(year, month));
  const entries = [
    buildPayrollEntry(totals, DEFAULT_ACCOUNTS, year, month),
    buildSettlementEntry(totals, DEFAULT_ACCOUNTS, year, month),
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
  "617411", "617412", "61671", "61744", "61741", "44525", "4455", "3455", "4432", "4441", "4457",
  "5141", "3421", "3411", "4421", "4411", "4434", "3431", "3491", "4491", "6171", "471", "472",
  "342", "441", "445",
].sort((a, b) => b.length - a.length);

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
    out.push(F("flux", "Exhaustivité", "dettes sociales", "critique", "Charges patronales incomplètes",
      `Salaires bruts comptabilisés (${dh(totals.salaireBrut)}) mais une charge patronale est nulle (CNSS ${dh(totals.cnssPatronal)} / AF ${dh(totals.af)} / TFP ${dh(totals.tfp)}).`,
      "Comptabiliser l'intégralité des charges patronales (CNSS, AMO, AF, TFP).",
      "CGNC (exhaustivité) ; CNSS (cotisation patronale obligatoire).",
      "Vérifier les taxes de paie et leur comptabilisation dans account.move."));

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
    out.push(F("flux", "Classification", "paie", "eleve", "TFP imputée avec les organismes sociaux",
      "La TFP (taxe) est comptabilisée dans le compte CNSS au lieu d'un compte d'État (4457).",
      "Reclasser la TFP en 4457 (État – impôts et taxes).", "PCGE (classification).",
      "Mapper la taxe TFP sur le compte 4457 (plan l10n_ma)."));

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

  out.push(F("soldes", "Exhaustivité", "paie", "moyen", "Provision pour congés payés non constatée",
    "L'application ne comptabilise pas la provision pour congés payés (1,5 j/mois) ni les charges sociales afférentes.",
    "Constituer une provision congés payés à la clôture (dette envers le personnel).",
    "CGNC (spécialisation, prudence).", "OD de provision datée à la clôture ; contre-passation à l'ouverture."));

  out.push(F("soldes", "Évaluation et imputation", "dettes sociales", "info", "Rapprocher le solde 4441 avec le bordereau CNSS",
    "Le solde des organismes sociaux (4441) à la clôture doit correspondre au bordereau CNSS du mois.",
    "Rapprocher et lettrer le compte 4441 avec le bordereau et le paiement.",
    "CNSS ; CGNC (évaluation).", "Lettrage des account.move.line 4441."));

  if (totals.ir > 0)
    out.push(F("soldes", "Existence", "dettes fiscales", "info", "IR retenu (44525) à verser le mois suivant",
      `IR salarial retenu : ${dh(totals.ir)}. Versement à la DGI dû avant la fin du mois suivant.`,
      "Verser l'IR retenu dans le délai légal (éviter les pénalités).",
      "CGI (retenue à la source sur salaires).", "Lettrer le versement (account.move.line 44525)."));

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

  return out;
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
  if (chargesAbn.length)
    out.push(F("flux", "Classification", "achats/charges", "eleve",
      `${chargesAbn.length} compte(s) de charges au solde créditeur`,
      `Solde anormal (créditeur) sur des comptes de classe 6 : ${chargesAbn.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
      "Vérifier l'imputation (avoir mal classé, produit en charge, écriture inversée).",
      "PCGE (classification).", "Grand livre du compte ; reclasser via OD."));
  const produitsAbn = d.balances.filter((b) => b.code.startsWith("7") && b.balance > 0.01);
  if (produitsAbn.length)
    out.push(F("flux", "Classification", "ventes/produits", "eleve",
      `${produitsAbn.length} compte(s) de produits au solde débiteur`,
      `Solde anormal (débiteur) sur des comptes de classe 7 : ${produitsAbn.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
      "Vérifier l'imputation (avoir client, charge en produit, écriture inversée).",
      "PCGE (classification).", "Grand livre du compte ; reclasser via OD."));

  // Existence / Évaluation : clients créditeurs (342x) / fournisseurs débiteurs (441x).
  const clientsCred = d.balances.filter((b) => startsWithAny(b.code, ["342", "3421"]) && b.balance < -0.01);
  if (clientsCred.length)
    out.push(F("soldes", "Existence", "ventes/clients", "moyen",
      `${clientsCred.length} compte(s) client au solde créditeur`,
      `Clients (342x) au solde créditeur : ${clientsCred.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}. Avances/avoirs ou erreur d'imputation.`,
      "Analyser et lettrer ; reclasser les avances en 4421 si nécessaire.",
      "CGNC (existence, évaluation).", "Lettrage des écritures clients ; reclassement des avances."));
  const fournDeb = d.balances.filter((b) => startsWithAny(b.code, ["441", "4411"]) && b.balance > 0.01);
  if (fournDeb.length)
    out.push(F("soldes", "Existence", "achats/fournisseurs", "moyen",
      `${fournDeb.length} compte(s) fournisseur au solde débiteur`,
      `Fournisseurs (441x) au solde débiteur : ${fournDeb.slice(0, 6).map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}. Avances/avoirs ou erreur d'imputation.`,
      "Analyser et lettrer ; reclasser les avances en 3411 si nécessaire.",
      "CGNC (existence, évaluation).", "Lettrage des écritures fournisseurs ; reclassement des avances."));

  // Évaluation : comptes d'attente / transitoires non soldés.
  const suspense = d.balances.filter(
    (b) => (/attente|suspens|transit|transfert|à\s*r[ée]gulariser/i.test(b.name) || startsWithAny(b.code, ["471", "472", "3491", "4491"])) && Math.abs(b.balance) > 0.01,
  );
  if (suspense.length)
    out.push(F("soldes", "Évaluation et imputation", "comptabilité générale", "eleve",
      `${suspense.length} compte(s) d'attente non soldé(s)`,
      `Comptes transitoires avec un solde résiduel : ${suspense.slice(0, 6).map((b) => `${b.code} ${b.name} (${dh(b.balance)})`).join(", ")}.`,
      "Solder les comptes d'attente avant clôture (imputation définitive).",
      "CGNC (évaluation) ; comptes de régularisation.", "Grand livre ; réimputer via OD, lettrer."));

  // TVA : cohérence collectée (4455) vs déductible (3455).
  const tvaColl = d.balances.filter((b) => b.code.startsWith("4455"));
  const tvaDed = d.balances.filter((b) => b.code.startsWith("3455"));
  if (tvaColl.length || tvaDed.length) {
    const coll = -sum(tvaColl); // TVA facturée = compte créditeur → montant positif = -balance
    const ded = sum(tvaDed);    // TVA déductible = compte débiteur → balance positive
    const due = Math.round((coll - ded) * 100) / 100;
    out.push(F("presentation", "Exactitude et évaluation", "dettes fiscales", "info",
      "TVA — rapprochement collectée / déductible",
      `TVA collectée (4455) ≈ ${dh(coll)} ; TVA déductible (3455) ≈ ${dh(ded)} ; TVA due estimée ≈ ${dh(due)} sur ${d.year}.`,
      "Rapprocher avec les déclarations de TVA déposées ; vérifier le régime (encaissements/débits).",
      "CGI (TVA) ; CGNC.", "États de TVA Odoo ; rapprocher les déclarations."));
    const collAbn = tvaColl.filter((b) => b.balance > 0.01);
    if (collAbn.length)
      out.push(F("flux", "Classification", "dettes fiscales", "moyen",
        "TVA facturée (4455) au solde débiteur",
        `Solde anormal (débiteur) : ${collAbn.map((b) => `${b.code} (${dh(b.balance)})`).join(", ")}.`,
        "Vérifier l'imputation de la TVA collectée.", "CGI (TVA) ; PCGE.", "Grand livre 4455 ; corriger l'imputation."));
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

  return out;
}

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
    if (c.comptes.length) lines.push(`- Comptes PCGE : ${c.comptes.join(", ")}`);
    lines.push(`- Problème : ${c.detail}`);
    lines.push(`- Correction proposée : ${c.recommandation}`);
    lines.push(`- Référence : ${c.reference_normative}`);
    lines.push(`- Action Odoo : ${c.action_odoo}`);
    lines.push("");
  });
  lines.push("---");
  lines.push("Exécution réelle : skill Claude Code `odoo-correction-anomalies` (lecture Odoo réelle,");
  lines.push("correction sûre, rapport de régularité) ou passage manuel par le comptable.");
  return lines.join("\n");
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
