/**
 * Connecteur Odoo (API externe JSON-RPC) — import des salariés hr.employee par société.
 *
 * CORS : un navigateur ne peut appeler Odoo en cross-origin que si Odoo renvoie les en-têtes
 * CORS, OU via un proxy même origine. En développement, configurer `server.proxy` de Vite
 * (voir vite.config.ts) et renseigner l'URL "/odoo" ; en production, passer par une Edge
 * Function / reverse-proxy. Le code ci-dessous appelle l'endpoint tel quel.
 */
import type { Employee, OdooConfig } from "@/data/types";
import { uid } from "@/data/store";
import { getParams } from "./params";

interface OdooEmployee {
  id: number;
  name: string;
  identification_id?: string | false;
  l10n_ma_cin_number?: string | false;
  registration_number?: string | false;
  l10n_ma_cnss_number?: string | false;
  job_title?: string | false;
  employee_type?: string | false; // employee | student | trainee | contractor | freelance
  birthday?: string | false;
  marital?: string | false;
  children?: number;
  work_phone?: string | false;
  work_email?: string | false;
  department_id?: [number, string] | false;
  company_id?: [number, string] | false;
  // Salaire — Odoo 19 : le versioning a fusionné hr.contract dans hr.employee.
  wage?: number | false; // salaire mensuel de référence (source de vérité)
  wage_type?: "monthly" | "hourly" | string | false;
  hourly_wage?: number | false; // taux horaire (souvent incohérent -> repli seulement)
}

function endpoint(config: OdooConfig): string {
  const base = config.url.replace(/\/+$/, "");
  return `${base}/jsonrpc`;
}

async function jsonRpc(config: OdooConfig, service: string, method: string, args: unknown[]): Promise<any> {
  const res = await fetch(endpoint(config), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9),
    }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error?.data?.message || data.error?.message || "Erreur Odoo");
  return data.result;
}

/** Authentifie et renvoie l'uid Odoo. */
export async function odooAuthenticate(config: OdooConfig): Promise<number> {
  const uidRes = await jsonRpc(config, "common", "authenticate", [config.db, config.username, config.apiKey, {}]);
  if (!uidRes) throw new Error("Authentification refusée (db / identifiant / clé API).");
  return uidRes as number;
}

/** Teste la connexion : renvoie la version + l'uid. */
export async function odooTestConnection(config: OdooConfig): Promise<{ uid: number; version: string }> {
  const version = await jsonRpc(config, "common", "version", []);
  const userId = await odooAuthenticate(config);
  return { uid: userId, version: version?.server_version ?? "?" };
}

/**
 * Contrôle de complétude de la configuration Odoo AVANT tout appel réseau.
 * Renvoie un message d'erreur actionnable (où corriger) ou null si tout est prêt.
 * Évite l'échec cryptique « Authentification refusée » quand un identifiant ou la
 * clé API n'a jamais été saisi dans Paramètres → Connexion Odoo.
 */
export function odooReadiness(
  config: OdooConfig | undefined,
  firm?: { name: string; odoo_company_id?: number },
): string | null {
  if (!config?.url) return "Connexion Odoo non configurée : renseignez l'URL, la base, l'identifiant et la clé API dans Paramètres → Connexion Odoo.";
  if (!config.db) return "Base de données Odoo manquante : renseignez-la dans Paramètres → Connexion Odoo.";
  if (!config.username?.trim() || !config.apiKey?.trim())
    return "Identifiant ou clé API Odoo manquant. Ouvrez Paramètres → Connexion Odoo, saisissez votre identifiant (e-mail) et votre clé API, puis cliquez « Tester & enregistrer ».";
  if (firm && !firm.odoo_company_id)
    return `Renseignez l'« ID société Odoo (company_id) » de « ${firm.name} » dans Paramètres → Connexion Odoo (bouton « Lister les sociétés Odoo »).`;
  return null;
}

/** Complète un message d'erreur réseau/authentification par la marche à suivre. */
export function odooErrorHint(message: string): string {
  if (/authentifi|refus|access denied|login/i.test(message)) {
    return `${message}\n\nVérifiez l'identifiant (e-mail) et la CLÉ API dans Paramètres → Connexion Odoo. La clé API se génère dans Odoo : avatar → Préférences → onglet « Sécurité du compte » → « Nouvelle clé API ».`;
  }
  // Champ/modèle inexistant : écart de VERSION Odoo, pas un problème d'URL/CORS.
  if (/invalid field|unknown field|doesn't exist|does not exist|invalid model/i.test(message)) {
    return `${message}\n\nCe champ ou modèle n'existe pas dans cette version d'Odoo (les noms changent d'une version à l'autre). Ce n'est pas un problème d'URL ni de CORS. Signalez le message ci-dessus pour adapter la lecture à votre version.`;
  }
  return `${message}\n\nVérifiez l'URL/CORS (proxy « /odoo ») et la connexion dans Paramètres → Connexion Odoo.`;
}

/** Liste les sociétés Odoo (res.company) pour le mapping. */
export async function odooListCompanies(config: OdooConfig): Promise<{ id: number; name: string }[]> {
  const userId = await odooAuthenticate(config);
  const rows: [number, string][] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "res.company", "search_read", [[]], { fields: ["id", "name"] },
  ]).then((r) => (r as { id: number; name: string }[]).map((c) => [c.id, c.name] as [number, string]));
  return rows.map(([id, name]) => ({ id, name: name.trim() }));
}

const MARITAL: Record<string, string> = {
  single: "Célibataire", married: "Marié(e)", cohabitant: "Concubinage",
  widower: "Veuf(ve)", divorced: "Divorcé(e)",
};

function splitName(raw: string): { first: string; last: string } {
  const clean = raw.replace(/_[A-Za-z]{1,4}\d+\s*$/, "").trim(); // retire les suffixes type "_PB078"
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Importe les salariés d'une société Odoo et les mappe vers le modèle de l'application. */
export async function odooImportEmployees(
  config: OdooConfig,
  odooCompanyId: number,
  firmId: string,
): Promise<Employee[]> {
  const userId = await odooAuthenticate(config);
  const fields = [
    "name", "identification_id", "l10n_ma_cin_number", "registration_number",
    "l10n_ma_cnss_number", "job_title", "employee_type", "birthday", "marital",
    "children", "work_phone", "work_email", "department_id", "company_id",
    "wage", "wage_type", "hourly_wage",
  ];
  const records: OdooEmployee[] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "hr.employee", "search_read",
    [[["company_id", "=", odooCompanyId]]],
    { fields, limit: 500, order: "name asc" },
  ]);

  // Référentiel réglementaire (SMIG horaire, heures légales) — jamais en dur ici.
  const p = getParams(new Date().getFullYear());
  const monthlyHours = p.legalMonthlyHours; // 191 h/mois (standard légal Maroc)

  return records.map((r) => {
    const { first, last } = splitName(r.name || "");
    const val = (v: string | false | undefined) => (v ? String(v) : undefined);
    const num = (v: number | false | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

    // Salaire réel Odoo -> taux horaire. Le modèle encode le salaire via
    // base_hourly_rate × monthly_hours ; on choisit le taux pour que
    // salaireBase = wage exactement (arrondi 6 déc. : l'écart ×191 reste < 0,005 DH).
    // Stagiaire : employee_type n'est pas fiable ici (toujours "employee"),
    // le libellé de poste est le signal fiable.
    const jobTitle = val(r.job_title);
    const empType = typeof r.employee_type === "string" ? r.employee_type : "";
    const isStagiaire =
      empType === "student" || empType === "trainee" || /stagiaire/i.test(jobTitle ?? "");

    const wageMonthly = num(r.wage);
    const wageHourly = num(r.hourly_wage);
    let baseHourlyRate: number;
    if (wageMonthly > 0) {
      baseHourlyRate = Math.round((wageMonthly / monthlyHours) * 1e6) / 1e6;
    } else if (wageHourly > 0) {
      baseHourlyRate = wageHourly; // repli : ouvrier réellement payé à l'heure
    } else {
      // Stagiaire sans salaire Odoo : indemnité à saisir à la main (pas de SMIG fictif).
      baseHourlyRate = isStagiaire ? 0 : p.smigHourly;
    }

    return {
      id: uid("emp"),
      firm_id: firmId,
      matricule: val(r.registration_number) ?? `ODOO-${r.id}`,
      first_name: first,
      last_name: last || first,
      cin: val(r.identification_id) ?? val(r.l10n_ma_cin_number),
      cnss_number: val(r.l10n_ma_cnss_number) ?? val(r.registration_number),
      birth_date: val(r.birthday),
      hire_date: new Date().toISOString().slice(0, 10), // à compléter (date de version Odoo)
      contract_type: isStagiaire ? "Stagiaire" : "CDI",
      position: jobTitle,
      site: r.department_id ? r.department_id[1] : undefined,
      base_hourly_rate: baseHourlyRate,
      monthly_hours: monthlyHours,
      marital_status: r.marital ? MARITAL[r.marital] ?? undefined : undefined,
      dependents: r.children ?? 0,
      phone: val(r.work_phone),
      is_active: true,
      _odoo_id: r.id,
    } as Employee & { _odoo_id: number };
  });
}

/* ============================================================================
 * SYNCHRONISATION app -> Odoo (écriture) — lecture-avant-écriture, dry-run,
 * confirmation. Principe directeur : ODOO FAIT FOI. On ne remplace jamais une
 * valeur Odoo existante ; on ne comble QUE les trous (champ Odoo vide + valeur
 * saisie dans l'app). Aucune valeur n'est inventée. Un appariement (même faible
 * par le nom) bloque la création d'un doublon.
 * ========================================================================== */

/** Champs hr.employee que la sync peut alimenter (jamais écraser). */
const SYNC_FIELDS = [
  "name", "registration_number", "identification_id", "l10n_ma_cnss_number",
  "job_title", "birthday", "wage",
] as const;

type OdooEmp = {
  id: number;
  name?: string | false;
  registration_number?: string | false;
  identification_id?: string | false;
  l10n_ma_cin_number?: string | false;
  l10n_ma_cnss_number?: string | false;
  job_title?: string | false;
  birthday?: string | false;
  wage?: number | false;
};

export type SyncOp = "create" | "update" | "unchanged" | "conflict";

export interface SyncFieldChange {
  field: string;
  label: string;
  odoo: string; // valeur Odoo actuelle, formatée ("(vide)" si absente)
  app: string;  // valeur qui sera écrite, formatée
}

export interface SyncPlanItem {
  employee_id: string;                       // id app
  name: string;
  op: SyncOp;
  odooId?: number;                           // hr.employee.id apparié
  matchKey?: "odoo_id" | "matricule" | "cin" | "cnss" | "nom";
  matchConfidence: "forte" | "faible" | "aucune";
  changes: SyncFieldChange[];                // champs à écrire (create = tous ; update = trous)
  vals: Record<string, unknown>;             // payload Odoo effectif
  note?: string;
}

export interface SyncPlan {
  companyId: number;
  odooCount: number;                         // nb d'enregistrements Odoo lus
  items: SyncPlanItem[];
  summary: { create: number; update: number; unchanged: number; conflict: number };
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nom", registration_number: "Matricule", identification_id: "CIN",
  l10n_ma_cnss_number: "N° CNSS", job_title: "Poste", birthday: "Naissance", wage: "Salaire mensuel",
};

const isEmpty = (v: unknown): boolean => v === false || v == null || v === "";
const norm = (v: string | false | undefined) =>
  isEmpty(v) ? "" : String(v).trim();
/** Nom normalisé : minuscules, sans diacritiques, sans suffixe "_PB078", espaces compactés. */
function normName(raw: string | false | undefined): string {
  if (isEmpty(raw)) return "";
  return String(raw)
    .replace(/_[A-Za-z]{1,4}\d+\s*$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Valeur app cible pour chaque champ Odoo synchronisable (undefined = rien à pousser). */
function appValue(emp: Employee, field: string): string | number | undefined {
  switch (field) {
    case "name": {
      const n = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
      return n || undefined;
    }
    case "registration_number": return norm(emp.matricule) || undefined;
    case "identification_id": return norm(emp.cin) || undefined;
    case "l10n_ma_cnss_number": return norm(emp.cnss_number) || undefined;
    case "job_title": return norm(emp.position) || undefined;
    case "birthday": return norm(emp.birth_date) || undefined;
    case "wage": {
      const w = round2((emp.base_hourly_rate || 0) * (emp.monthly_hours || 0));
      return w > 0 ? w : undefined;
    }
    default: return undefined;
  }
}

const fmt = (v: unknown): string =>
  isEmpty(v) ? "(vide)" : typeof v === "number" ? String(v) : String(v);

/**
 * Construit le PLAN de synchronisation (DRY-RUN, aucune écriture).
 * Lit d'abord tous les hr.employee de la société, apparie par clé stable, puis
 * calcule create / update (gap-fill) / unchanged / conflict.
 */
export async function buildEmployeeSyncPlan(
  config: OdooConfig,
  odooCompanyId: number,
  employees: Employee[],
): Promise<SyncPlan> {
  const userId = await odooAuthenticate(config);
  const existing: OdooEmp[] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "hr.employee", "search_read",
    [[["company_id", "=", odooCompanyId]]],
    {
      fields: ["id", "name", "registration_number", "identification_id",
        "l10n_ma_cin_number", "l10n_ma_cnss_number", "job_title", "birthday", "wage"],
      limit: 2000,
    },
  ]);

  // Index d'appariement (clé -> id Odoo). Première occurrence gagnante.
  const byId = new Map<number, OdooEmp>(existing.map((e) => [e.id, e]));
  const byReg = new Map<string, number>();
  const byCin = new Map<string, number>();
  const byCnss = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const e of existing) {
    const reg = norm(e.registration_number); if (reg && !byReg.has(reg)) byReg.set(reg, e.id);
    const cin1 = norm(e.identification_id); if (cin1 && !byCin.has(cin1)) byCin.set(cin1, e.id);
    const cin2 = norm(e.l10n_ma_cin_number); if (cin2 && !byCin.has(cin2)) byCin.set(cin2, e.id);
    const cnss = norm(e.l10n_ma_cnss_number); if (cnss && !byCnss.has(cnss)) byCnss.set(cnss, e.id);
    const nm = normName(e.name); if (nm && !byName.has(nm)) byName.set(nm, e.id);
  }

  const claimed = new Set<number>(); // enregistrements Odoo déjà revendiqués (anti-doublon d'appariement)
  const items: SyncPlanItem[] = [];

  for (const emp of employees) {
    const displayName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "(sans nom)";

    // Appariement par priorité de fiabilité.
    let odooId: number | undefined;
    let matchKey: SyncPlanItem["matchKey"];
    let confidence: SyncPlanItem["matchConfidence"] = "aucune";
    const odooRef = (emp as Employee & { _odoo_id?: number })._odoo_id;

    if (odooRef != null && byId.has(odooRef)) { odooId = odooRef; matchKey = "odoo_id"; confidence = "forte"; }
    else if (norm(emp.matricule) && byReg.has(norm(emp.matricule))) { odooId = byReg.get(norm(emp.matricule)); matchKey = "matricule"; confidence = "forte"; }
    else if (norm(emp.cin) && byCin.has(norm(emp.cin))) { odooId = byCin.get(norm(emp.cin)); matchKey = "cin"; confidence = "forte"; }
    else if (norm(emp.cnss_number) && byCnss.has(norm(emp.cnss_number))) { odooId = byCnss.get(norm(emp.cnss_number)); matchKey = "cnss"; confidence = "forte"; }
    else if (normName(displayName) && byName.has(normName(displayName))) { odooId = byName.get(normName(displayName)); matchKey = "nom"; confidence = "faible"; }

    // --- CREATE : aucun appariement -> nouveau salarié Odoo (tous les champs saisis).
    if (odooId == null) {
      const vals: Record<string, unknown> = { company_id: odooCompanyId };
      const changes: SyncFieldChange[] = [];
      for (const f of SYNC_FIELDS) {
        const v = appValue(emp, f);
        if (v !== undefined) {
          vals[f] = v;
          changes.push({ field: f, label: FIELD_LABEL[f], odoo: "(vide)", app: fmt(v) });
        }
      }
      items.push({
        employee_id: emp.id, name: displayName, op: "create",
        matchConfidence: "aucune", changes, vals,
        note: "Absent d'Odoo — sera créé.",
      });
      continue;
    }

    // --- Enregistrement déjà revendiqué par un autre salarié app -> CONFLICT (jamais écrit).
    if (claimed.has(odooId)) {
      items.push({
        employee_id: emp.id, name: displayName, op: "conflict", odooId, matchKey, matchConfidence: confidence,
        changes: [], vals: {},
        note: `Enregistrement Odoo #${odooId} déjà apparié à un autre salarié — ignoré (à lever manuellement).`,
      });
      continue;
    }
    claimed.add(odooId);

    // --- UPDATE (gap-fill) : ne combler que les champs VIDES côté Odoo.
    const target = byId.get(odooId)!;
    const vals: Record<string, unknown> = {};
    const changes: SyncFieldChange[] = [];
    for (const f of SYNC_FIELDS) {
      if (f === "name") continue; // le nom identifie l'enregistrement : jamais réécrit
      const current = (target as Record<string, unknown>)[f];
      const wageEmpty = f === "wage" && (current === false || current == null || current === 0);
      if (isEmpty(current) || wageEmpty) {
        const v = appValue(emp, f);
        if (v !== undefined) {
          vals[f] = v;
          changes.push({ field: f, label: FIELD_LABEL[f], odoo: fmt(current), app: fmt(v) });
        }
      }
    }

    items.push({
      employee_id: emp.id, name: displayName,
      op: changes.length ? "update" : "unchanged",
      odooId, matchKey, matchConfidence: confidence, changes, vals,
      note: changes.length
        ? `Apparié par ${matchKey} (#${odooId}) — ${changes.length} champ(s) à compléter.`
        : `Apparié par ${matchKey} (#${odooId}) — déjà à jour.`,
    });
  }

  const summary = {
    create: items.filter((i) => i.op === "create").length,
    update: items.filter((i) => i.op === "update").length,
    unchanged: items.filter((i) => i.op === "unchanged").length,
    conflict: items.filter((i) => i.op === "conflict").length,
  };
  return { companyId: odooCompanyId, odooCount: existing.length, items, summary };
}

export interface SyncApplyResult {
  created: number;
  updated: number;
  errors: { name: string; message: string }[];
}

/**
 * APPLIQUE le plan (écriture réelle). À n'appeler qu'après confirmation utilisateur.
 * Ne touche qu'aux items "create" et "update" ; "unchanged"/"conflict" sont ignorés.
 * Renvoie aussi la liste des _odoo_id créés pour que l'app puisse les mémoriser.
 */
export async function applyEmployeeSyncPlan(
  config: OdooConfig,
  plan: SyncPlan,
): Promise<SyncApplyResult & { createdIds: { employee_id: string; odoo_id: number }[] }> {
  const userId = await odooAuthenticate(config);
  const res: SyncApplyResult & { createdIds: { employee_id: string; odoo_id: number }[] } = {
    created: 0, updated: 0, errors: [], createdIds: [],
  };

  for (const it of plan.items) {
    try {
      if (it.op === "create") {
        const newId: number = await jsonRpc(config, "object", "execute_kw", [
          config.db, userId, config.apiKey, "hr.employee", "create", [it.vals],
        ]);
        res.created += 1;
        res.createdIds.push({ employee_id: it.employee_id, odoo_id: newId });
      } else if (it.op === "update" && it.odooId != null && Object.keys(it.vals).length) {
        await jsonRpc(config, "object", "execute_kw", [
          config.db, userId, config.apiKey, "hr.employee", "write", [[it.odooId], it.vals],
        ]);
        res.updated += 1;
      }
    } catch (e) {
      res.errors.push({ name: it.name, message: (e as Error).message });
    }
  }
  return res;
}

/* ============================================================================
 * SÉCURITÉ — lecture (read-only) des coordonnées bancaires (res.partner.bank)
 * pour l'audit des modifications de RIB. Attribution par le compte Odoo
 * authentifié (res.users), jamais par capture clandestine de personne.
 * ========================================================================== */

/** Un compte bancaire Odoo enrichi (état courant), pour la détection d'écart. */
export interface OdooBankRecord {
  odoo_bank_id: number;
  acc_number: string;
  partner: string;
  partner_kind: "fournisseur" | "client" | "salarie";
  actor_name: string;      // dernier modificateur (write_uid) : nom
  actor_login: string;     // dernier modificateur : login / e-mail pro
  actor_authorized: boolean;
  on_payment: boolean;
  when: string;            // write_date (ISO)
  /** Empreinte cryptographique (HMAC-SHA-256 salée) pré-calculée — cf. ribFingerprint(). */
  acc_fingerprint?: string;
}

export interface OdooBankSnapshot {
  records: OdooBankRecord[];
  /** true si le groupe habilité a pu être résolu (sinon autorisations non vérifiées). */
  groupResolved: boolean;
  authorizedGroupLabel?: string;
}

const partnerKind = (p: { supplier_rank?: number; customer_rank?: number; employee?: boolean }) =>
  p.employee ? "salarie" : (p.supplier_rank ?? 0) > 0 ? "fournisseur" : "client";

/** Nom du champ « groupes » de `res.users` : `groups_id` (Odoo ≤ 18) renommé `group_ids` (Odoo ≥ 19). */
export type UserGroupsField = "group_ids" | "groups_id" | null;

/**
 * Choisit le nom RÉEL du champ « groupes » de `res.users` d'après la réponse de `fields_get`.
 * Préfère `group_ids` (Odoo ≥ 19), sinon `groups_id` (Odoo ≤ 18), sinon `null` (indéterminable).
 * Évite l'erreur « Invalid field 'groups_id' on 'res.users' » qui faisait échouer tout l'audit.
 * Fonction PURE (testable sans Odoo).
 */
export function pickUserGroupsField(fieldsMeta: unknown): UserGroupsField {
  if (!fieldsMeta || typeof fieldsMeta !== "object") return null;
  const meta = fieldsMeta as Record<string, unknown>;
  if ("group_ids" in meta) return "group_ids";
  if ("groups_id" in meta) return "groups_id";
  return null;
}

/**
 * Lit l'état courant des comptes bancaires d'une société (LECTURE SEULE) et
 * enrichit chaque compte avec le tiers, le dernier modificateur et son
 * habilitation (appartenance au groupe autorisé à modifier les RIB).
 *
 * @param authorizedGroupQuery  motif recherché dans res.groups.full_name
 *   (défaut : "account.group_account_manager" — Comptabilité / Conseiller).
 */
export async function odooFetchBankSnapshot(
  config: OdooConfig,
  odooCompanyId: number,
  authorizedGroupQuery = "Accounting / Adviser",
): Promise<OdooBankSnapshot> {
  const userId = await odooAuthenticate(config);
  const call = (model: string, method: string, args: unknown[], kwargs: object) =>
    jsonRpc(config, "object", "execute_kw", [config.db, userId, config.apiKey, model, method, args, kwargs]);

  // 1) Comptes bancaires de la société.
  const banks: Array<{
    id: number; acc_number?: string | false; partner_id?: [number, string] | false;
    write_uid?: [number, string] | false; write_date?: string | false; allow_out_payment?: boolean;
  }> = await call("res.partner.bank", "search_read",
    // Dans Odoo, les RIB de TIERS (fournisseurs / clients / salariés) ont company_id = false
    // (comptes partagés) ; seuls les comptes propres de la société portent un company_id.
    // On audite donc TOUS les RIB de tiers + ceux de la société active.
    [["|", ["company_id", "=", false], ["company_id", "=", odooCompanyId]]],
    { fields: ["id", "acc_number", "partner_id", "write_uid", "write_date", "allow_out_payment"], limit: 20000 });

  // 2) Tiers (rangs fournisseur/client, salarié) et utilisateurs (acteurs).
  const partnerIds = Array.from(new Set(banks.map((b) => (b.partner_id ? b.partner_id[0] : 0)).filter(Boolean)));
  const userIds = Array.from(new Set(banks.map((b) => (b.write_uid ? b.write_uid[0] : 0)).filter(Boolean)));

  const partners: Array<{ id: number; name?: string; supplier_rank?: number; customer_rank?: number; employee?: boolean }> =
    partnerIds.length
      ? await call("res.partner", "read", [partnerIds], { fields: ["id", "name", "supplier_rank", "customer_rank", "employee"] })
      : [];
  // Le champ « groupes » de res.users s'appelle `groups_id` (Odoo <= 18) et `group_ids` (Odoo >= 19).
  // On le détecte pour éviter « Invalid field 'groups_id' on 'res.users' » qui faisait échouer TOUT l'audit.
  let groupsField: UserGroupsField = null;
  try {
    const meta = await call("res.users", "fields_get", [["group_ids", "groups_id"]], { attributes: ["type"] });
    groupsField = pickUserGroupsField(meta as Record<string, unknown>);
  } catch {
    groupsField = null; // introspection indisponible : on dégrade au lieu d'échouer
  }

  const userFields = ["id", "name", "login", ...(groupsField ? [groupsField] : [])];
  let users: Array<{ id: number; name?: string; login?: string; [k: string]: unknown }> = [];
  if (userIds.length) {
    try {
      users = await call("res.users", "read", [userIds], { fields: userFields });
    } catch {
      users = []; // lecture des acteurs impossible : l'audit continue avec le nom de write_uid
    }
  }

  // 3) Groupe habilité à modifier les RIB.
  const groups: Array<{ id: number; full_name?: string }> =
    await call("res.groups", "search_read", [[["full_name", "ilike", authorizedGroupQuery]]], { fields: ["id", "full_name"] });
  const authGroupIds = new Set(groups.map((g) => g.id));
  // L'habilitation n'est vérifiable que si le groupe ET le champ « groupes » sont disponibles.
  const groupResolved = authGroupIds.size > 0 && !!groupsField && users.length > 0;

  const pById = new Map(partners.map((p) => [p.id, p]));
  const uById = new Map(users.map((u) => [u.id, u]));

  const records: OdooBankRecord[] = banks
    .filter((b) => b.acc_number) // un compte sans numéro n'a rien à auditer
    .map((b) => {
      const p = b.partner_id ? pById.get(b.partner_id[0]) : undefined;
      const u = b.write_uid ? uById.get(b.write_uid[0]) : undefined;
      const userGroups = groupsField && u ? (u[groupsField] as number[] | undefined) : undefined;
      const inGroup = userGroups?.some((g) => authGroupIds.has(g)) ?? false;
      return {
        odoo_bank_id: b.id,
        acc_number: String(b.acc_number),
        partner: p?.name ?? (b.partner_id ? b.partner_id[1] : "—"),
        partner_kind: partnerKind(p ?? {}),
        actor_name: u?.name ?? (b.write_uid ? b.write_uid[1] : "—"),
        actor_login: u?.login ?? "—",
        // Si le groupe habilité n'a pas pu être résolu, ne pas crier « non autorisé »
        // à tort : on considère l'acteur autorisé et on signale l'incertitude en amont.
        actor_authorized: groupResolved ? inGroup : true,
        on_payment: b.allow_out_payment ?? false,
        when: (b.write_date ? String(b.write_date) : "").replace(" ", "T"),
      };
    });

  return { records, groupResolved, authorizedGroupLabel: groups[0]?.full_name };
}
