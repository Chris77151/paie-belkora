/**
 * Store applicatif — persistance locale (localStorage), API remplaçable par Supabase.
 * Fournit un état réactif via `useStore()` et des mutations typées.
 */
import { useSyncExternalStore } from "react";
import type {
  AccountingClosure,
  AppRole,
  AppState,
  AppUser,
  BankAuditEvent,
  BankBaseline,
  ComplianceAlert,
  Employee,
  Firm,
  Payslip,
  PayrollPeriod,
  WorkAccident,
} from "./types";
import { seed, SUPER_ADMIN } from "./seed";
import { isSupabaseConfigured, loadRemoteState, saveRemoteState } from "@/lib/supabase";

const KEY = "gca-paie-rh-state-v1";

/**
 * Réconcilie un état persisté avec le seed courant : backfill des champs ajoutés
 * APRÈS la 1re écriture localStorage. Sans cela, un localStorage ancien masque
 * définitivement les nouveaux défauts du seed (ex. `odoo_company_id`), et l'import
 * Odoo échoue alors même que le seed fournit l'ID. Idempotent, ne touche pas aux
 * données saisies, ignore les firmes créées à la main (id absent du seed).
 */
/**
 * Identifiants des salariés de DÉMONSTRATION des versions antérieures. Le seed courant ne
 * charge plus aucun salarié fictif (cf. seed.ts), mais un localStorage écrit par une ancienne
 * version les conserve. On les purge ici, ainsi que leurs données rattachées (bulletins,
 * congés, accidents) devenues orphelines. Les salariés réels (id généré par `uid()`, ex.
 * `id_xxx`) ne matchent jamais ces clés et sont donc préservés.
 */
const DEMO_EMPLOYEE_IDS = new Set(["emp_1", "emp_2", "emp_3", "emp_4", "emp_5", "emp_6", "emp_7"]);

function migrate(s: AppState): AppState {
  const byId = new Map(seed().firms.map((f) => [f.id, f]));

  // Purge des salariés de démonstration persistés (versions antérieures).
  if (Array.isArray(s.employees) && s.employees.some((e) => DEMO_EMPLOYEE_IDS.has(e.id))) {
    s.employees = s.employees.filter((e) => !DEMO_EMPLOYEE_IDS.has(e.id));
    const liveIds = new Set(s.employees.map((e) => e.id));
    s.payslips = (s.payslips ?? []).filter((p) => liveIds.has(p.employee_id));
    s.leaves = (s.leaves ?? []).filter((l) => liveIds.has(l.employee_id));
    s.workAccidents = (s.workAccidents ?? []).filter((a) => liveIds.has(a.employee_id));
  }

  // Champs légaux ajoutés après coup : on ne comble QUE les valeurs absentes (jamais d'écrasement d'une saisie).
  const LEGAL_BACKFILL: (keyof Firm)[] = [
    "legal_form", "share_capital", "rc_city", "patente", "phone", "email", "brand_color",
  ];
  for (const f of s.firms) {
    const seeded = byId.get(f.id);
    if (!seeded) continue;
    if (f.odoo_company_id == null && seeded.odoo_company_id != null) {
      f.odoo_company_id = seeded.odoo_company_id;
    }
    for (const k of LEGAL_BACKFILL) {
      const cur = f[k];
      if ((cur == null || cur === "") && seeded[k] != null) {
        (f[k] as Firm[keyof Firm]) = seeded[k];
      }
    }
  }
  // Backfill des champs ajoutés après la 1re écriture localStorage.
  if (s.currentRole == null) s.currentRole = "firm_admin";
  if (s.bankAudit == null) s.bankAudit = [];
  if (s.bankBaseline == null) s.bankBaseline = [];
  if (!Array.isArray(s.workAccidents)) s.workAccidents = [];
  if (!Array.isArray(s.accountingClosures)) s.accountingClosures = [];
  // Comptes utilisateurs : garantir la présence ET les credentials du super utilisateur.
  // Le compte racine est « indestructible » (cf. seed.ts) : par conception anti-lockout,
  // ses identifiants documentés font autorité. On réaffirme donc depuis le seed son
  // username ET son password_hash — sinon un localStorage issu d'une version antérieure
  // fige un ancien hash et provoque « Mot de passe incorrect » malgré le bon mot de passe.
  // Les comptes secondaires (non is_super) ne sont jamais touchés.
  if (!Array.isArray(s.users)) s.users = [];
  const superUser = s.users.find((u) => u.is_super || u.id === SUPER_ADMIN.id);
  if (!superUser) {
    s.users.unshift(structuredClone(SUPER_ADMIN));
  } else {
    superUser.username = SUPER_ADMIN.username;
    superUser.password_hash = SUPER_ADMIN.password_hash;
    superUser.is_super = true;
    superUser.is_active = true;
    superUser.role = "super_admin";
  }
  return s;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw) as AppState);
  } catch {
    /* ignore */
  }
  return seed();
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore (quota / mode privé) */
  }
}

function persist() {
  persistLocal();
  listeners.forEach((l) => l());
  scheduleRemoteSave();
}

/* ---- Synchronisation cloud (Supabase) — permanente et partagée, offline-first ---- */
export type SyncStatus = "off" | "syncing" | "saved" | "error";
let syncStatus: SyncStatus = isSupabaseConfigured() ? "syncing" : "off";
let syncError = "";
const syncListeners = new Set<() => void>();

function setSync(st: SyncStatus, err = "") {
  syncStatus = st;
  syncError = err;
  syncListeners.forEach((l) => l());
}
export function subscribeSync(cb: () => void): () => void {
  syncListeners.add(cb);
  return () => {
    syncListeners.delete(cb);
  };
}
export const getSyncStatus = () => syncStatus;
export const getSyncError = () => syncError;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Pousse l'état vers Supabase, débouncé (évite un appel par frappe). No-op si non configuré. */
function scheduleRemoteSave() {
  if (!isSupabaseConfigured()) return;
  if (saveTimer) clearTimeout(saveTimer);
  setSync("syncing");
  saveTimer = setTimeout(async () => {
    const res = await saveRemoteState(state);
    setSync(res.ok ? "saved" : "error", res.error);
  }, 800);
}

/**
 * Hydrate l'état depuis Supabase au démarrage (ou après configuration). Le cloud est la source
 * de vérité partagée : si une ligne distante existe, elle est adoptée ; sinon l'état local
 * courant est poussé comme graine initiale. Ne casse jamais l'app en cas d'échec.
 */
export async function hydrateFromRemote(): Promise<void> {
  if (!isSupabaseConfigured()) {
    setSync("off");
    return;
  }
  setSync("syncing");
  const remote = await loadRemoteState();
  if (remote) {
    state = migrate(remote.data);
    persistLocal(); // cache local du snapshot distant
    listeners.forEach((l) => l());
    setSync("saved");
  } else {
    const res = await saveRemoteState(state); // première initialisation du cloud
    setSync(res.ok ? "saved" : "error", res.error);
  }
}

/**
 * Rôle du compte connecté — lu directement depuis sessionStorage + l'état, SANS importer
 * auth.ts (qui importe déjà ce module : on évite un cycle d'import). La clé de session est
 * la même que celle définie dans auth.ts (`gca-paie-session-user`).
 */
function sessionRole(): AppRole | null {
  try {
    const id = sessionStorage.getItem("gca-paie-session-user");
    if (!id) return null;
    return state.users?.find((u) => u.id === id && u.is_active)?.role ?? null;
  } catch {
    return null;
  }
}

/** Un compte « lecture seule » ne peut effectuer AUCUNE écriture de données (garde app-wide). */
export function canWriteData(): boolean {
  return sessionRole() !== "lecture_seule";
}

/**
 * Applique une mutation à l'état.
 * @param opts.view  Mutation de simple ÉTAT DE VUE (ex. société active) : autorisée même en
 *                   lecture seule. Par défaut une mutation est une écriture de DONNÉES et se
 *                   trouve neutralisée pour le rôle « lecture_seule » (défense en profondeur,
 *                   en complément de la désactivation des boutons côté UI).
 */
function set(mutator: (s: AppState) => void, opts?: { view?: boolean }) {
  if (!opts?.view && !canWriteData()) return; // lecture seule : écriture de données ignorée
  const next: AppState = structuredClone(state);
  mutator(next);
  state = next;
  persist();
}

/* ---- abonnement React ---- */
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/* ---- identifiants ---- */
let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/* ---- sélecteurs ---- */
export const getState = () => state;
export const currentFirm = (s: AppState): Firm =>
  s.firms.find((f) => f.id === s.currentFirmId) ?? s.firms[0];
export const employeesOfFirm = (s: AppState, firmId: string) =>
  s.employees.filter((e) => e.firm_id === firmId);
export const periodsOfFirm = (s: AppState, firmId: string) =>
  s.periods.filter((p) => p.firm_id === firmId);
export const payslipsOfPeriod = (s: AppState, periodId: string) =>
  s.payslips.filter((p) => p.period_id === periodId);

/* ---- mutations ---- */
export const actions = {
  setCurrentFirm(id: string) {
    set((s) => {
      s.currentFirmId = id;
    }, { view: true }); // navigation entre sociétés : autorisée en lecture seule
  },
  upsertFirm(firm: Firm) {
    set((s) => {
      const i = s.firms.findIndex((f) => f.id === firm.id);
      if (i >= 0) s.firms[i] = firm;
      else s.firms.push(firm);
    });
  },
  upsertEmployee(emp: Employee) {
    set((s) => {
      const i = s.employees.findIndex((e) => e.id === emp.id);
      if (i >= 0) s.employees[i] = emp;
      else s.employees.push(emp);
    });
  },
  removeEmployee(id: string) {
    set((s) => {
      s.employees = s.employees.filter((e) => e.id !== id);
    });
  },
  ensurePeriod(firmId: string, year: number, month: number): PayrollPeriod {
    let found = state.periods.find(
      (p) => p.firm_id === firmId && p.year === year && p.month === month,
    );
    if (!found) {
      const period: PayrollPeriod = { id: uid("per"), firm_id: firmId, year, month, status: "draft" };
      set((s) => {
        s.periods.push(period);
      });
      found = period;
    }
    return found;
  },
  setPeriodStatus(periodId: string, status: PayrollPeriod["status"]) {
    set((s) => {
      const p = s.periods.find((x) => x.id === periodId);
      if (p) p.status = status;
    });
  },
  upsertPayslip(slip: Payslip) {
    set((s) => {
      const i = s.payslips.findIndex(
        (p) => p.period_id === slip.period_id && p.employee_id === slip.employee_id,
      );
      if (i >= 0) s.payslips[i] = slip;
      else s.payslips.push(slip);
    });
  },
  bulkUpsertPayslips(slips: Payslip[]) {
    set((s) => {
      for (const slip of slips) {
        const i = s.payslips.findIndex(
          (p) => p.period_id === slip.period_id && p.employee_id === slip.employee_id,
        );
        if (i >= 0) s.payslips[i] = slip;
        else s.payslips.push(slip);
      }
    });
  },
  setOdooConfig(cfg: AppState["odoo"]) {
    set((s) => {
      s.odoo = cfg;
    });
  },
  /** Mémorise l'id hr.employee renvoyé par Odoo après une création (sync app -> Odoo),
   *  pour que les synchronisations suivantes apparient par clé forte et n'insèrent pas de doublon. */
  attachOdooIds(pairs: { employee_id: string; odoo_id: number }[]) {
    if (!pairs.length) return;
    const byEmp = new Map(pairs.map((p) => [p.employee_id, p.odoo_id]));
    set((s) => {
      for (const e of s.employees) {
        const oid = byEmp.get(e.id);
        if (oid != null) (e as Employee & { _odoo_id?: number })._odoo_id = oid;
      }
    });
  },
  /** Fusionne des salariés importés : met à jour l'existant (clé matricule ou CIN), sinon ajoute. */
  mergeEmployees(list: Employee[]): { added: number; updated: number } {
    let added = 0;
    let updated = 0;
    set((s) => {
      for (const emp of list) {
        const i = s.employees.findIndex(
          (e) =>
            e.firm_id === emp.firm_id &&
            ((emp.matricule && e.matricule === emp.matricule) || (emp.cin && e.cin === emp.cin)),
        );
        if (i >= 0) {
          s.employees[i] = { ...s.employees[i], ...emp, id: s.employees[i].id };
          updated += 1;
        } else {
          s.employees.push(emp);
          added += 1;
        }
      }
    });
    return { added, updated };
  },
  removeFirm(id: string) {
    set((s) => {
      if (s.firms.length <= 1) return; // garder au moins une société
      s.firms = s.firms.filter((f) => f.id !== id);
      s.employees = s.employees.filter((e) => e.firm_id !== id);
      if (s.currentFirmId === id) s.currentFirmId = s.firms[0].id;
    });
  },
  /* ---- Utilisateurs (authentification locale) ---- */
  addUser(user: AppUser) {
    set((s) => {
      s.users = s.users ?? [];
      s.users.push(user);
    });
  },
  updateUser(user: AppUser) {
    set((s) => {
      const list = s.users ?? [];
      const i = list.findIndex((u) => u.id === user.id);
      if (i < 0) return;
      // Le super utilisateur ne peut être ni désactivé ni rétrogradé (anti-lockout).
      list[i] = list[i].is_super ? { ...user, is_super: true, is_active: true, role: "super_admin" } : user;
      s.users = list;
    });
  },
  removeUser(id: string) {
    set((s) => {
      s.users = (s.users ?? []).filter((u) => u.id !== id || u.is_super); // jamais le super
    });
  },
  /* ---- Sécurité / audit RIB ---- */
  setCurrentRole(role: AppRole) {
    set((s) => {
      s.currentRole = role;
    }, { view: true }); // simple miroir du rôle de session (non sécuritaire) : toujours permis
  },
  /** Remplace le rapport d'audit d'une société (les autres sociétés sont conservées). */
  setBankAudit(firmId: string, events: BankAuditEvent[]) {
    set((s) => {
      const others = (s.bankAudit ?? []).filter((e) => e.firm_id !== firmId);
      s.bankAudit = [...others, ...events];
    });
  },
  /** Établit/rafraîchit la base de référence des RIB validés d'une société. */
  setBankBaseline(firmId: string, baseline: BankBaseline[]) {
    set((s) => {
      const others = (s.bankBaseline ?? []).filter((b) => b.firm_id !== firmId);
      s.bankBaseline = [...others, ...baseline];
    });
  },
  /* ---- Registre des accidents du travail ---- */
  upsertWorkAccident(a: WorkAccident) {
    set((s) => {
      s.workAccidents = s.workAccidents ?? [];
      const i = s.workAccidents.findIndex((x) => x.id === a.id);
      if (i >= 0) s.workAccidents[i] = a;
      else s.workAccidents.push(a);
    });
  },
  removeWorkAccident(id: string) {
    set((s) => {
      s.workAccidents = (s.workAccidents ?? []).filter((x) => x.id !== id);
    });
  },
  /* ---- Clôture comptable (validation/verrou d'une période) ---- */
  /** Fige les écritures d'une période (validation). Écrase une clôture existante de même id. */
  validateAccounting(closure: AccountingClosure) {
    set((s) => {
      s.accountingClosures = s.accountingClosures ?? [];
      const i = s.accountingClosures.findIndex((c) => c.id === closure.id);
      if (i >= 0) s.accountingClosures[i] = closure;
      else s.accountingClosures.push(closure);
    });
  },
  /** Remet une période en brouillon : supprime le verrou et le snapshot figé. */
  revertAccounting(id: string) {
    set((s) => {
      s.accountingClosures = (s.accountingClosures ?? []).filter((c) => c.id !== id);
    });
  },
  reset() {
    if (!canWriteData()) return; // lecture seule : réinitialisation interdite
    state = seed();
    persist();
  },
  /**
   * Réparation d'intégrité (volet « Stabilisation & Calculs ») — IDEMPOTENTE : purge les
   * données orphelines (bulletins/congés/accidents rattachés à un salarié ou une période
   * inexistants) et recale la société active si elle est invalide. Ne touche jamais aux taux
   * ni au code ; ne supprime aucune donnée réelle rattachée à des entités existantes.
   * Renvoie le détail de ce qui a été réparé.
   */
  repairIntegrity(): { payslips: number; leaves: number; accidents: number; currentFirm: boolean } {
    const empIds = new Set(state.employees.map((e) => e.id));
    const firmIds = new Set(state.firms.map((f) => f.id));
    const periodIds = new Set(state.periods.map((p) => p.id));
    const badSlips = state.payslips.filter((p) => !empIds.has(p.employee_id) || !periodIds.has(p.period_id)).length;
    const badLeaves = (state.leaves ?? []).filter((l) => !empIds.has(l.employee_id)).length;
    const badAcc = (state.workAccidents ?? []).filter((a) => !empIds.has(a.employee_id)).length;
    const badFirm = !firmIds.has(state.currentFirmId);
    set((s) => {
      s.payslips = s.payslips.filter((p) => empIds.has(p.employee_id) && periodIds.has(p.period_id));
      s.leaves = (s.leaves ?? []).filter((l) => empIds.has(l.employee_id));
      s.workAccidents = (s.workAccidents ?? []).filter((a) => empIds.has(a.employee_id));
      if (!firmIds.has(s.currentFirmId) && s.firms.length) s.currentFirmId = s.firms[0].id;
    });
    return { payslips: badSlips, leaves: badLeaves, accidents: badAcc, currentFirm: badFirm };
  },
};

/* ---- moteur d'alertes de conformité (dérivé, non persisté) ---- */
export function deriveAlerts(s: AppState, firmId: string): ComplianceAlert[] {
  const out: ComplianceAlert[] = [];
  const today = new Date();
  for (const e of employeesOfFirm(s, firmId).filter((x) => x.is_active)) {
    const name = `${e.first_name} ${e.last_name}`;
    if (!e.cnss_number)
      out.push(alert(firmId, e.id, "cnss_missing", "critical", `${name} : non immatriculé CNSS (obligation légale)`));
    if (!e.cin)
      out.push(alert(firmId, e.id, "cin_missing", "warning", `${name} : CIN absente du dossier`));
    if (e.birth_date && e.hazardous_site) {
      const age = (today.getTime() - new Date(e.birth_date).getTime()) / 3.15576e10;
      if (age < 18)
        out.push(alert(firmId, e.id, "minor_hazardous", "critical", `${name} : mineur sur site dangereux (art. 143-147)`));
    }
    if (e.contract_type === "CDD" && e.contract_end) {
      const days = (new Date(e.contract_end).getTime() - today.getTime()) / 8.64e7;
      if (days >= 0 && days <= 30)
        out.push(alert(firmId, e.id, "cdd_expiring", "warning", `${name} : CDD expirant dans ${Math.round(days)} j`));
    }
  }
  return out;
}

function alert(
  firm_id: string,
  employee_id: string,
  type: ComplianceAlert["type"],
  severity: ComplianceAlert["severity"],
  message: string,
): ComplianceAlert {
  return { id: `${type}_${employee_id}`, firm_id, employee_id, type, severity, message, resolved: false };
}
