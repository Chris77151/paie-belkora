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

/**
 * Éléments importables depuis Odoo, à cocher dans le dialogue d'import. Chaque élément regroupe
 * un ou plusieurs champs du salarié. « identite » (nom) est toujours importé (clé de création).
 * Le choix pilote CE QUI EST ÉCRIT dans l'app : un élément décoché n'est jamais appliqué aux
 * salariés existants (import non destructif).
 */
export type ImportElement =
  | "identite" | "matricule" | "cin" | "cnss" | "poste" | "salaire" | "naissance" | "situation" | "contact" | "contrat";

export const IMPORT_ELEMENTS: { key: ImportElement; label: string; fields: (keyof Employee)[]; hint?: string }[] = [
  { key: "identite", label: "Identité (nom, prénom)", fields: ["first_name", "last_name"], hint: "Toujours importé — nécessaire à la création." },
  { key: "matricule", label: "Matricule", fields: ["matricule"] },
  { key: "cin", label: "CIN", fields: ["cin"] },
  { key: "cnss", label: "N° CNSS", fields: ["cnss_number"] },
  { key: "poste", label: "Poste & département", fields: ["position", "site"] },
  { key: "salaire", label: "Salaire (→ taux horaire)", fields: ["base_hourly_rate", "monthly_hours"] },
  { key: "naissance", label: "Date de naissance", fields: ["birth_date"] },
  { key: "situation", label: "Situation familiale & personnes à charge", fields: ["marital_status", "dependents"] },
  { key: "contact", label: "Téléphone", fields: ["phone"] },
  { key: "contrat", label: "Type de contrat (employé / stagiaire)", fields: ["contract_type"] },
];

/** Champs Employee réellement écrits pour la sélection donnée (= union, sans doublon, des champs cochés). */
export function importUpdateFields(selection: ImportElement[]): (keyof Employee)[] {
  const set = new Set(selection);
  const fields = IMPORT_ELEMENTS.filter((el) => set.has(el.key)).flatMap((el) => el.fields);
  return Array.from(new Set(fields));
}

const ALL_IMPORT_ELEMENTS = IMPORT_ELEMENTS.map((el) => el.key);

/**
 * Importe les salariés d'une société Odoo et les mappe vers le modèle de l'application.
 * `selection` = éléments à importer (défaut : tous). Les champs des éléments NON cochés reçoivent
 * une valeur par défaut sûre (utile à la création d'un nouveau salarié) mais ne sont PAS écrits sur
 * un salarié existant — c'est la fusion (`mergeEmployees`) qui n'applique que les champs choisis.
 * Les clés de rapprochement (_odoo_id, matricule, CIN, nom) sont toujours portées pour l'appariement.
 */
export async function odooImportEmployees(
  config: OdooConfig,
  odooCompanyId: number,
  firmId: string,
  selection: ImportElement[] = ALL_IMPORT_ELEMENTS,
): Promise<Employee[]> {
  const has = (el: ImportElement) => selection.includes(el);
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

    // Clés d'appariement (matricule, CIN, nom) et champs obligatoires : TOUJOURS portés — la
    // fusion (`mergeEmployees`) n'écrira que les champs des éléments cochés sur un salarié existant.
    const emp: Employee & { _odoo_id: number } = {
      id: uid("emp"),
      firm_id: firmId,
      _odoo_id: r.id,
      first_name: first,
      last_name: last || first,
      matricule: val(r.registration_number) ?? `ODOO-${r.id}`,
      cin: val(r.identification_id) ?? val(r.l10n_ma_cin_number),
      hire_date: new Date().toISOString().slice(0, 10), // à compléter (date de version Odoo)
      monthly_hours: monthlyHours,
      is_active: true,
      // Défauts sûrs pour une création ; valeur Odoo appliquée seulement si l'élément est coché.
      contract_type: has("contrat") ? (isStagiaire ? "Stagiaire" : "CDI") : "CDI",
      base_hourly_rate: has("salaire") ? baseHourlyRate : (isStagiaire ? 0 : p.smigHourly),
      dependents: has("situation") ? (r.children ?? 0) : 0,
    };
    // Champs optionnels : importés UNIQUEMENT si l'élément correspondant est coché.
    if (has("cnss")) emp.cnss_number = val(r.l10n_ma_cnss_number) ?? val(r.registration_number);
    if (has("poste")) {
      emp.position = jobTitle;
      emp.site = r.department_id ? r.department_id[1] : undefined;
    }
    if (has("naissance")) emp.birth_date = val(r.birthday);
    if (has("situation")) emp.marital_status = r.marital ? MARITAL[r.marital] ?? undefined : undefined;
    if (has("contact")) emp.phone = val(r.work_phone);
    return emp;
  });
}

/* ============================================================================
 * CONGÉS — lecture (read-only) des soldes de congés depuis Odoo (hr.employee).
 * Les noms de champs varient d'une version à l'autre : on détecte par fields_get
 * puis on lit ceux qui existent (allocation_count / allocation_used_count /
 * remaining_leaves) et on en déduit acquis / pris / solde. ODOO FAIT FOI.
 * ========================================================================== */

/** Solde de congés d'un salarié tel que lu dans Odoo (jours), + identité pour l'appariement. */
export interface OdooLeaveBalance {
  odoo_id: number;
  /** Jours alloués (allocation_count). */
  allocated: number;
  /** Jours pris (allocation_used_count, sinon alloué − restant). */
  taken: number;
  /** Jours restants (remaining_leaves, sinon alloué − pris). */
  remaining: number;
  /* --- identité Odoo (facultative selon la version/les modules) : sert à apparier sans _odoo_id --- */
  name?: string;
  matricule?: string;
  cin?: string;
  cnss?: string;
}

/** Ligne hr.employee partielle (congés + identité) — champs optionnels selon la version Odoo. */
export interface OdooLeaveRow {
  id: number;
  allocation_count?: number | false;
  allocation_used_count?: number | false;
  remaining_leaves?: number | false;
  name?: string | false;
  registration_number?: string | false;
  identification_id?: string | false;
  l10n_ma_cin_number?: string | false;
  l10n_ma_cnss_number?: string | false;
}

/**
 * Déduit (acquis / pris / solde) d'une ligne hr.employee, en gérant l'absence de tel ou tel champ
 * selon la version Odoo. PURE & testable. Priorité : valeurs Odoo explicites, sinon complément par
 * différence (alloué − pris = restant, et réciproquement). Porte l'identité pour l'appariement.
 */
export function mapOdooLeave(r: OdooLeaveRow): OdooLeaveBalance {
  const n = (v: number | false | undefined) => (typeof v === "number" && isFinite(v) ? v : undefined);
  const str = (v: string | false | undefined) => (v ? String(v) : undefined);
  const allocated = n(r.allocation_count) ?? 0;
  const usedGiven = n(r.allocation_used_count);
  const remainGiven = n(r.remaining_leaves);
  const taken = usedGiven ?? (remainGiven != null ? Math.max(0, allocated - remainGiven) : 0);
  const remaining = remainGiven ?? Math.max(0, allocated - taken);
  return {
    odoo_id: r.id,
    allocated: round2(allocated),
    taken: round2(taken),
    remaining: round2(remaining),
    name: str(r.name),
    matricule: str(r.registration_number),
    cin: str(r.identification_id) ?? str(r.l10n_ma_cin_number),
    cnss: str(r.l10n_ma_cnss_number),
  };
}

export type LeaveMatchMethod = "odoo_id" | "matricule" | "cin" | "cnss" | "nom";

/** Un appariement salarié-app ↔ solde Odoo, avec la clé utilisée et le niveau de confiance. */
export interface LeaveMatch {
  employee_id: string;
  odoo_id: number;
  method: LeaveMatchMethod;
  confidence: "forte" | "faible";
  balance: OdooLeaveBalance;
}

export interface LeaveMatchResult {
  matches: LeaveMatch[];
  /** Salariés de l'app sans correspondance Odoo (jamais devinés). */
  unmatched: Employee[];
}

/**
 * Apparie les salariés de l'app aux soldes de congés Odoo par clés STABLES, sans rien inventer :
 * `_odoo_id` → matricule → CIN → CNSS → nom normalisé (le nom marqué « faible »). Un solde Odoo
 * déjà revendiqué n'est pas réutilisé (anti-doublon). PURE & testable — c'est la « reconnaissance »
 * fiable des salariés (pas d'OCR : les données sont structurées, l'OCR introduirait des erreurs).
 */
export function matchOdooLeaves(employees: Employee[], balances: OdooLeaveBalance[]): LeaveMatchResult {
  const byId = new Map<number, OdooLeaveBalance>();
  const byReg = new Map<string, OdooLeaveBalance>();
  const byCin = new Map<string, OdooLeaveBalance>();
  const byCnss = new Map<string, OdooLeaveBalance>();
  const byName = new Map<string, OdooLeaveBalance>();
  const byNameSorted = new Map<string, OdooLeaveBalance>(); // nom insensible à l'ordre des mots
  for (const b of balances) {
    if (!byId.has(b.odoo_id)) byId.set(b.odoo_id, b);
    const reg = norm(b.matricule); if (reg && !byReg.has(reg)) byReg.set(reg, b);
    const cin = norm(b.cin); if (cin && !byCin.has(cin)) byCin.set(cin, b);
    const cnss = norm(b.cnss); if (cnss && !byCnss.has(cnss)) byCnss.set(cnss, b);
    const nm = normName(b.name); if (nm && !byName.has(nm)) byName.set(nm, b);
    const nms = normNameSorted(b.name); if (nms && !byNameSorted.has(nms)) byNameSorted.set(nms, b);
  }

  const claimed = new Set<number>(); // un solde Odoo n'est apparié qu'une fois
  const matches: LeaveMatch[] = [];
  const unmatched: Employee[] = [];

  for (const e of employees) {
    const oid = (e as Employee & { _odoo_id?: number })._odoo_id;
    let b: OdooLeaveBalance | undefined;
    let method: LeaveMatchMethod | undefined;
    let confidence: "forte" | "faible" = "forte";

    if (oid != null && byId.has(oid)) { b = byId.get(oid); method = "odoo_id"; }
    else if (norm(e.matricule) && byReg.has(norm(e.matricule))) { b = byReg.get(norm(e.matricule)); method = "matricule"; }
    else if (norm(e.cin) && byCin.has(norm(e.cin))) { b = byCin.get(norm(e.cin)); method = "cin"; }
    else if (norm(e.cnss_number) && byCnss.has(norm(e.cnss_number))) { b = byCnss.get(norm(e.cnss_number)); method = "cnss"; }
    else {
      const full = `${e.first_name ?? ""} ${e.last_name ?? ""}`;
      const nm = normName(full);
      const nms = normNameSorted(full);
      if (nm && byName.has(nm)) { b = byName.get(nm); method = "nom"; confidence = "faible"; }
      // Repli insensible à l'ordre : « Fadwa Semlani » (app) ↔ « SEMLANI Fadwa » (Odoo).
      else if (nms && byNameSorted.has(nms)) { b = byNameSorted.get(nms); method = "nom"; confidence = "faible"; }
    }

    if (b && method && !claimed.has(b.odoo_id)) {
      claimed.add(b.odoo_id);
      matches.push({ employee_id: e.id, odoo_id: b.odoo_id, method, confidence, balance: b });
    } else {
      unmatched.push(e);
    }
  }
  return { matches, unmatched };
}

/**
 * Somme (jours) des enregistrements VALIDÉS d'un modèle de congés (`hr.leave` = pris,
 * `hr.leave.allocation` = alloué), regroupée par salarié via `read_group`. C'est la SOURCE FIABLE :
 * elle capte les congés que les compteurs résumés de `hr.employee` (`allocation_used_count`,
 * `remaining_leaves`) ignorent — congés d'un type « sans allocation », validés hors périmètre du
 * compteur, etc. (cause du congé de 9 jours non extrait). LECTURE SEULE.
 *
 * Renvoie `null` si le modèle n'est pas lisible (droits/version) → l'appelant retombe alors
 * proprement sur les compteurs résumés, sans jamais perdre l'affichage.
 */
async function odooSumLeaveDaysByEmployee(
  config: OdooConfig,
  userId: number,
  model: "hr.leave" | "hr.leave.allocation",
  employeeIds: number[],
): Promise<Map<number, number> | null> {
  if (!employeeIds.length) return new Map();
  try {
    const groups: Array<{ employee_id?: [number, string] | false; number_of_days?: number | false }> =
      await jsonRpc(config, "object", "execute_kw", [
        config.db, userId, config.apiKey, model, "read_group",
        [[["employee_id", "in", employeeIds], ["state", "=", "validate"]], ["number_of_days:sum"], ["employee_id"]],
        { lazy: false },
      ]);
    const map = new Map<number, number>();
    for (const g of groups) {
      const emp = g.employee_id;
      if (Array.isArray(emp) && typeof emp[0] === "number") {
        const days = typeof g.number_of_days === "number" && isFinite(g.number_of_days) ? g.number_of_days : 0;
        map.set(emp[0], round2((map.get(emp[0]) ?? 0) + days));
      }
    }
    return map;
  } catch {
    return null; // modèle indisponible / droits insuffisants → repli sur les compteurs résumés
  }
}

/**
 * Fusionne le socle lu sur `hr.employee` avec la SOMME RÉELLE des congés validés (`hr.leave`).
 *
 * L'ALLOUÉ garde la valeur du compteur résumé `allocation_count` (fiable pour l'alloué). Le PRIS est
 * remplacé par la somme réelle des `hr.leave` validés dès que la requête a réussi (`Map` non nulle) —
 * c'est ce qui capte le congé de 9 j que `allocation_used_count` ignorait ; un salarié absent de la
 * Map a alors 0 pris (absence d'enregistrement = 0 jour). Si la requête a échoué (`null`), on
 * conserve le compteur résumé `taken`. `remaining = alloué − pris`. PURE & testable.
 *
 * Réserve : la somme porte sur TOUS les types de congés validés du salarié. Si l'instance Odoo suit
 * des types non « congé payé » (maladie, sans solde…), ils entrent dans « pris ». Un filtrage par
 * `holiday_status_id` nécessiterait de connaître l'id du type « congé payé » de l'instance.
 */
export function combineOdooLeave(
  base: OdooLeaveBalance[],
  takenByEmp: Map<number, number> | null,
): OdooLeaveBalance[] {
  return base.map((b) => {
    const taken = takenByEmp ? (takenByEmp.get(b.odoo_id) ?? 0) : b.taken;
    const allocated = b.allocated; // compteur résumé `allocation_count`, fiable pour l'alloué
    return {
      ...b,
      taken: round2(taken),
      remaining: round2(allocated - taken),
    };
  });
}

/**
 * Lit les soldes de congés des salariés d'une société Odoo. Combine deux sources :
 *  1) `hr.employee` — identité (appariement) + compteurs résumés (REPLI) ;
 *  2) `hr.leave` / `hr.leave.allocation` VALIDÉS, sommés par salarié — SOURCE FIABLE qui capte les
 *     congés manqués par les compteurs résumés (congés « sans allocation », etc.).
 * Détecte les champs disponibles (fields_get) pour rester compatible entre versions. LECTURE SEULE.
 */
export async function odooFetchLeaveBalances(config: OdooConfig, odooCompanyId: number): Promise<OdooLeaveBalance[]> {
  const userId = await odooAuthenticate(config);
  // Champs de congés + identité (pour l'appariement sans _odoo_id). Détectés par fields_get :
  // ceux qui n'existent pas sur l'instance (module l10n_ma absent, version) sont simplement ignorés.
  const candidates = [
    "allocation_count", "allocation_used_count", "remaining_leaves",
    "name", "registration_number", "identification_id", "l10n_ma_cin_number", "l10n_ma_cnss_number",
  ];
  let available: Set<string>;
  try {
    const fg: Record<string, unknown> = await jsonRpc(config, "object", "execute_kw", [
      config.db, userId, config.apiKey, "hr.employee", "fields_get", [candidates], { attributes: ["type"] },
    ]);
    available = new Set(Object.keys(fg ?? {}));
  } catch {
    available = new Set(candidates); // repli : on tente les champs standard
  }
  const fields = ["id", ...candidates.filter((f) => available.has(f))];
  const rows: OdooLeaveRow[] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "hr.employee", "search_read",
    [[["company_id", "=", odooCompanyId]]],
    { fields, limit: 2000 },
  ]);
  const base = rows.map(mapOdooLeave);

  // « Pris » = somme réelle des hr.leave VALIDÉS par salarié (source fiable qui capte les congés
  // ignorés par allocation_used_count). Tolérant aux pannes : échec → null → repli sur le compteur.
  const ids = rows.map((r) => r.id);
  const takenByEmp = await odooSumLeaveDaysByEmployee(config, userId, "hr.leave", ids);
  return combineOdooLeave(base, takenByEmp);
}

/* ============================================================================
 * SYNCHRONISATION app -> Odoo (écriture) — lecture-avant-écriture, dry-run,
 * confirmation. Principe directeur : ODOO FAIT FOI. On ne remplace jamais une
 * valeur Odoo existante ; on ne comble QUE les trous (champ Odoo vide + valeur
 * saisie dans l'app). Aucune valeur n'est inventée. Un appariement (même faible
 * par le nom) bloque la création d'un doublon.
 * ========================================================================== */

/**
 * Champs hr.employee CANDIDATS à la synchronisation app → Odoo. Le nom identifie
 * l'enregistrement (jamais réécrit). Les champs réellement poussés sont l'intersection de
 * cette liste avec ceux qui EXISTENT sur l'instance (détectés par `fields_get`) : un champ
 * absent (ex. module l10n_ma non installé) est ignoré au lieu de faire échouer tout le write.
 */
const SYNC_CANDIDATES = [
  "name", "registration_number", "identification_id", "l10n_ma_cnss_number",
  "job_title", "birthday", "wage", "children", "mobile_phone", "private_street",
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
  children?: number | false;
  mobile_phone?: string | false;
  private_street?: string | false;
};

export type SyncOp = "create" | "update" | "unchanged" | "conflict";

export interface SyncFieldChange {
  field: string;
  label: string;
  odoo: string; // valeur Odoo actuelle, formatée ("(vide)" si absente)
  app: string;  // valeur qui sera écrite, formatée
  /** « fill » = champ Odoo vide comblé ; « diff » = valeur Odoo divergente corrigée (l'app fait foi). */
  kind: "fill" | "diff";
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
  children: "Personnes à charge", mobile_phone: "Téléphone", private_street: "Adresse",
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
/** Nom normalisé PUIS trié par mots : rend l'appariement insensible à l'ordre (« Prénom Nom » ↔ « Nom Prénom »). */
function normNameSorted(raw: string | false | undefined): string {
  const n = normName(raw);
  return n ? n.split(" ").filter(Boolean).sort().join(" ") : "";
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
    case "children": return typeof emp.dependents === "number" ? emp.dependents : undefined;
    case "mobile_phone": return norm(emp.phone) || undefined;
    case "private_street": return norm(emp.address) || undefined;
    default: return undefined;
  }
}

const fmt = (v: unknown): string =>
  isEmpty(v) ? "(vide)" : typeof v === "number" ? String(v) : String(v);

/** Un champ Odoo est-il « vide » ? (le salaire et les personnes à charge à 0 comptent comme vides). */
function fieldEmpty(field: string, current: unknown): boolean {
  if (isEmpty(current)) return true;
  if ((field === "wage" || field === "children") && current === 0) return true;
  return false;
}

/**
 * La valeur Odoo `current` DIVERGE-t-elle de la valeur app `app` ? (comparaison tolérante :
 * nombres arrondis au centime, textes sans casse ni espaces superflus). PUR & testable.
 * Sert à corriger une valeur Odoo obsolète (poste changé dans l'app, etc.) — l'app fait foi.
 */
export function syncDiffers(field: string, current: unknown, app: string | number): boolean {
  if (typeof app === "number") {
    if (isEmpty(current)) return true; // Odoo vide vs valeur app numérique → divergence
    const c = typeof current === "number" ? current : Number(current);
    if (!isFinite(c)) return true;
    return round2(c) !== round2(app);
  }
  const c = norm(current as string | false).toLowerCase();
  const a = String(app).trim().toLowerCase();
  return c !== a;
}

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

  // Robustesse : ne lire/écrire QUE des champs présents sur cette instance (évite qu'un champ
  // absent — ex. module l10n_ma non installé, ou renommage de version — fasse échouer l'appel).
  let available: Set<string>;
  try {
    const fg: Record<string, unknown> = await jsonRpc(config, "object", "execute_kw", [
      config.db, userId, config.apiKey, "hr.employee", "fields_get", [], { attributes: ["type"] },
    ]);
    available = new Set(Object.keys(fg ?? {}));
  } catch {
    available = new Set(SYNC_CANDIDATES); // repli : on tente les champs standard
  }
  // Champs synchronisés = candidats réellement disponibles.
  const syncFields = SYNC_CANDIDATES.filter((f) => available.has(f));
  // Champs supplémentaires utiles à l'appariement (CIN alternatif l10n_ma), s'ils existent.
  const readFields = Array.from(new Set([
    "id", ...syncFields, ...(available.has("l10n_ma_cin_number") ? ["l10n_ma_cin_number"] : []),
  ]));

  const existing: OdooEmp[] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "hr.employee", "search_read",
    [[["company_id", "=", odooCompanyId]]],
    { fields: readFields, limit: 2000 },
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
      for (const f of syncFields) {
        const v = appValue(emp, f);
        if (v !== undefined) {
          vals[f] = v;
          changes.push({ field: f, label: FIELD_LABEL[f], odoo: "(vide)", app: fmt(v), kind: "fill" });
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

    // --- UPDATE : combler les champs VIDES côté Odoo, ET corriger les DIVERGENCES (l'app fait
    //     foi). Le nom identifie l'enregistrement : jamais réécrit. Jamais d'écrasement par une
    //     valeur app vide (appValue renvoie undefined).
    const target = byId.get(odooId)!;
    const vals: Record<string, unknown> = {};
    const changes: SyncFieldChange[] = [];
    for (const f of syncFields) {
      if (f === "name") continue;
      const v = appValue(emp, f);
      if (v === undefined) continue; // rien de saisi dans l'app → on ne touche pas
      const current = (target as Record<string, unknown>)[f];
      if (fieldEmpty(f, current)) {
        vals[f] = v;
        changes.push({ field: f, label: FIELD_LABEL[f], odoo: fmt(current), app: fmt(v), kind: "fill" });
      } else if (syncDiffers(f, current, v)) {
        vals[f] = v;
        changes.push({ field: f, label: FIELD_LABEL[f], odoo: fmt(current), app: fmt(v), kind: "diff" });
      }
    }

    const nFill = changes.filter((c) => c.kind === "fill").length;
    const nDiff = changes.filter((c) => c.kind === "diff").length;
    items.push({
      employee_id: emp.id, name: displayName,
      op: changes.length ? "update" : "unchanged",
      odooId, matchKey, matchConfidence: confidence, changes, vals,
      note: changes.length
        ? `Apparié par ${matchKey} (#${odooId}) — ${nFill} à compléter, ${nDiff} à corriger.`
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

/* ================================================================= */
/* Lettrage automatique (rapprochement) — correction Odoo RÉELLE et   */
/* SÛRE : ne rapproche que des lignes d'un même tiers qui s'apurent   */
/* exactement (Σ résidu ≈ 0). Réversible dans Odoo (dé-lettrage).     */
/* ================================================================= */

/** Une ligne d'écriture ouverte (non lettrée) lue dans Odoo. */
export interface OdooOpenItem {
  id: number; // account.move.line id
  account_id: number;
  account_code: string;
  partner_id: number | null;
  partner: string;
  move_name: string;
  date: string;
  residual: number; // amount_residual (signé)
}

/** Un groupe de lignes d'un même (compte, tiers) qui s'apurent exactement → lettrable sans risque. */
export interface ReconcileGroup {
  account_id: number;
  account_code: string;
  partner_id: number | null;
  partner: string;
  line_ids: number[];
  sum_residual: number; // ≈ 0
  amount: number; // volume lettré = Σ des résidus positifs
}

export interface ReconcileOutcome {
  group: ReconcileGroup;
  ok: boolean;
  error?: string;
}

/**
 * Regroupe les lignes ouvertes par (compte, tiers) et NE RETIENT que les groupes qui
 * s'apurent EXACTEMENT (Σ résidu ≈ 0, à `eps` près) avec des sens opposés (≥1 débit et
 * ≥1 crédit). PUR & testable — c'est le seul sous-ensemble sûr à lettrer sans jugement :
 * un rapprochement qui laisse un résidu relèverait d'une analyse humaine.
 */
export function groupReconcilable(lines: OdooOpenItem[], eps = 0.01): ReconcileGroup[] {
  const buckets = new Map<string, OdooOpenItem[]>();
  for (const l of lines) {
    const key = `${l.account_id}|${l.partner_id ?? 0}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(l);
  }
  const groups: ReconcileGroup[] = [];
  for (const items of buckets.values()) {
    if (items.length < 2) continue; // une seule ligne ne se lettre pas
    const sum = items.reduce((a, l) => a + l.residual, 0);
    const hasDebit = items.some((l) => l.residual > 0);
    const hasCredit = items.some((l) => l.residual < 0);
    if (Math.abs(sum) >= eps || !hasDebit || !hasCredit) continue;
    const amount = Math.round(items.filter((l) => l.residual > 0).reduce((a, l) => a + l.residual, 0) * 100) / 100;
    const first = items[0];
    groups.push({
      account_id: first.account_id,
      account_code: first.account_code,
      partner_id: first.partner_id,
      partner: first.partner,
      line_ids: items.map((l) => l.id),
      sum_residual: Math.round(sum * 100) / 100,
      amount,
    });
  }
  return groups;
}

/** Lit les lignes ouvertes (postées, non lettrées, résidu ≠ 0) des comptes lettrables. Lecture seule. */
export async function odooReadOpenItems(config: OdooConfig, companyId: number): Promise<OdooOpenItem[]> {
  const userId = await odooAuthenticate(config);
  const rows: any[] = await jsonRpc(config, "object", "execute_kw", [
    config.db, userId, config.apiKey, "account.move.line", "search_read",
    [[
      ["parent_state", "=", "posted"],
      ["company_id", "=", companyId],
      ["account_id.reconcile", "=", true],
      ["full_reconcile_id", "=", false],
      ["amount_residual", "!=", 0],
    ]],
    { fields: ["id", "account_id", "partner_id", "amount_residual", "move_name", "date"], limit: 20000 },
  ]);
  return rows.map((r) => ({
    id: r.id as number,
    account_id: Array.isArray(r.account_id) ? (r.account_id[0] as number) : 0,
    account_code: Array.isArray(r.account_id) ? String(r.account_id[1] ?? "").split(" ")[0] : "",
    partner_id: Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : null,
    partner: Array.isArray(r.partner_id) ? String(r.partner_id[1] ?? "") : "(sans tiers)",
    move_name: String(r.move_name ?? ""),
    date: String(r.date ?? ""),
    residual: Math.round((Number(r.amount_residual) || 0) * 100) / 100,
  }));
}

/**
 * Applique le lettrage : appelle `account.move.line`.reconcile() sur chaque groupe équilibré.
 * Réversible dans Odoo. Chaque groupe est isolé (try/catch) : un échec n'interrompt pas les autres.
 */
export async function odooApplyReconcile(
  config: OdooConfig,
  groups: ReconcileGroup[],
): Promise<ReconcileOutcome[]> {
  const userId = await odooAuthenticate(config);
  const out: ReconcileOutcome[] = [];
  for (const g of groups) {
    try {
      await jsonRpc(config, "object", "execute_kw", [
        config.db, userId, config.apiKey, "account.move.line", "reconcile", [g.line_ids],
      ]);
      out.push({ group: g, ok: true });
    } catch (e) {
      out.push({ group: g, ok: false, error: (e as Error).message });
    }
  }
  return out;
}
