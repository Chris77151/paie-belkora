/**
 * Registre d'outils de l'assistant IA — chaque outil expose un schéma JSON à Claude
 * (tool-use) et un exécuteur branché sur le store applicatif (src/data/store.ts).
 *
 * SÉCURITÉ : les mutations (create/update/delete) passent par `actions` du store, qui
 * persiste en localStorage. Les suppressions sont marquées `destructive` : la couche UI
 * demande une confirmation avant de les exécuter. Aucun taux de paie n'est codé ici — le
 * calcul délègue à computeFor/getParams (source unique params.ts).
 */
import {
  actions,
  currentFirm,
  deriveAlerts,
  employeesOfFirm,
  getState,
  uid,
} from "@/data/store";
import type { Employee, Firm } from "@/data/types";
import { computeFor, defaultInput } from "@/lib/payroll-helpers";
import { getParams } from "@/lib/params";

/** Définition d'un outil : schéma exposé à Claude + exécuteur local. */
export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** true -> la couche UI demande une confirmation explicite avant exécution. */
  destructive?: boolean;
  run: (input: Record<string, unknown>) => unknown;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const strip = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Retrouve un salarié de la société courante par nom, matricule, CIN ou id. */
function findEmployee(query: string): Employee | undefined {
  const s = getState();
  const firm = currentFirm(s);
  const list = employeesOfFirm(s, firm.id);
  const q = strip(String(query).trim());
  return (
    list.find((e) => e.id === query || e.matricule === query || e.cin === query) ??
    list.find((e) => strip(`${e.first_name} ${e.last_name}`).includes(q)) ??
    list.find((e) => strip(`${e.last_name} ${e.first_name}`).includes(q))
  );
}

/** Vue publique d'un salarié (mêmes champs que le store, pas de secret ajouté). */
function employeeView(e: Employee) {
  return e;
}

/* ------------------------------------------------------------------ */
/* Outils                                                             */
/* ------------------------------------------------------------------ */

export const AI_TOOLS: AiTool[] = [
  {
    name: "list_firms",
    description:
      "Liste toutes les sociétés (entités) de l'application avec leurs identifiants légaux et le régime (SMIG/SMAG). Indique aussi la société actuellement sélectionnée.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const s = getState();
      return {
        current_firm_id: s.currentFirmId,
        firms: s.firms.map((f) => ({
          id: f.id,
          name: f.name,
          regime: f.regime,
          ice: f.ice,
          rc: f.rc,
          if_fiscal: f.if_fiscal,
          cnss_affiliation: f.cnss_affiliation,
          city: f.city,
        })),
      };
    },
  },

  {
    name: "set_current_firm",
    description:
      "Sélectionne la société active de l'application. Toutes les opérations sur les salariés portent sur cette société.",
    input_schema: {
      type: "object",
      properties: { firm_id: { type: "string", description: "id de la société" } },
      required: ["firm_id"],
      additionalProperties: false,
    },
    run: (input) => {
      const firmId = String(input.firm_id);
      const s = getState();
      if (!s.firms.some((f) => f.id === firmId))
        return { ok: false, error: `Société introuvable: ${firmId}` };
      actions.setCurrentFirm(firmId);
      return { ok: true, current_firm_id: firmId };
    },
  },

  {
    name: "list_employees",
    description:
      "Liste les salariés de la société active (ou d'une société précise via firm_id). Renvoie tous les champs du dossier (poste, CIN, CNSS, salaire horaire, contrat, etc.).",
    input_schema: {
      type: "object",
      properties: {
        firm_id: { type: "string", description: "société ciblée (défaut : société active)" },
        active_only: { type: "boolean", description: "ne garder que les salariés actifs" },
      },
      additionalProperties: false,
    },
    run: (input) => {
      const s = getState();
      const firmId = input.firm_id ? String(input.firm_id) : currentFirm(s).id;
      let list = employeesOfFirm(s, firmId);
      if (input.active_only) list = list.filter((e) => e.is_active);
      return { firm_id: firmId, count: list.length, employees: list.map(employeeView) };
    },
  },

  {
    name: "get_employee",
    description:
      "Retrouve un salarié de la société active par nom, matricule, CIN ou id, et renvoie son dossier complet.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "nom, matricule, CIN ou id" } },
      required: ["query"],
      additionalProperties: false,
    },
    run: (input) => {
      const e = findEmployee(String(input.query));
      return e ? { found: true, employee: employeeView(e) } : { found: false };
    },
  },

  {
    name: "create_employee",
    description:
      "Crée un nouveau salarié dans la société active. Champs obligatoires : first_name, last_name, hire_date (ISO AAAA-MM-JJ), base_hourly_rate. Renvoie l'id créé. Ne pas inventer de CIN/CNSS : les laisser vides si inconnus.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        hire_date: { type: "string", description: "ISO AAAA-MM-JJ" },
        base_hourly_rate: { type: "number", description: "taux horaire de base en DH" },
        matricule: { type: "string" },
        cin: { type: "string" },
        cnss_number: { type: "string" },
        birth_date: { type: "string" },
        contract_type: { type: "string", enum: ["CDI", "CDD", "ANAPEC", "Interim", "Stagiaire"] },
        contract_end: { type: "string" },
        position: { type: "string" },
        site: { type: "string" },
        monthly_hours: { type: "number", description: "défaut 191 h" },
        marital_status: { type: "string" },
        dependents: { type: "integer", description: "nombre de personnes à charge" },
        phone: { type: "string" },
        is_active: { type: "boolean" },
        hazardous_site: { type: "boolean" },
      },
      required: ["first_name", "last_name", "hire_date", "base_hourly_rate"],
      additionalProperties: false,
    },
    run: (input) => {
      const s = getState();
      const firm = currentFirm(s);
      const emp: Employee = {
        id: uid("emp"),
        firm_id: firm.id,
        first_name: String(input.first_name),
        last_name: String(input.last_name),
        hire_date: String(input.hire_date),
        base_hourly_rate: Number(input.base_hourly_rate),
        monthly_hours: input.monthly_hours != null ? Number(input.monthly_hours) : 191,
        contract_type: (input.contract_type as Employee["contract_type"]) ?? "CDI",
        dependents: input.dependents != null ? Number(input.dependents) : 0,
        is_active: input.is_active != null ? Boolean(input.is_active) : true,
        matricule: input.matricule ? String(input.matricule) : undefined,
        cin: input.cin ? String(input.cin) : undefined,
        cnss_number: input.cnss_number ? String(input.cnss_number) : undefined,
        birth_date: input.birth_date ? String(input.birth_date) : undefined,
        contract_end: input.contract_end ? String(input.contract_end) : undefined,
        position: input.position ? String(input.position) : undefined,
        site: input.site ? String(input.site) : undefined,
        marital_status: input.marital_status ? String(input.marital_status) : undefined,
        phone: input.phone ? String(input.phone) : undefined,
        hazardous_site: input.hazardous_site != null ? Boolean(input.hazardous_site) : undefined,
      };
      actions.upsertEmployee(emp);
      return { ok: true, id: emp.id, employee: emp };
    },
  },

  {
    name: "update_employee",
    description:
      "Met à jour un salarié existant. `query` identifie le salarié (nom/matricule/CIN/id), `patch` contient uniquement les champs à changer. Ne réécrit que les champs fournis.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "nom, matricule, CIN ou id du salarié" },
        patch: {
          type: "object",
          description: "champs à modifier (mêmes noms que create_employee)",
          additionalProperties: true,
        },
      },
      required: ["query", "patch"],
      additionalProperties: false,
    },
    run: (input) => {
      const e = findEmployee(String(input.query));
      if (!e) return { ok: false, error: "Salarié introuvable." };
      const patch = (input.patch ?? {}) as Partial<Employee>;
      // Champs protégés : ne pas laisser le modèle changer l'identité technique.
      const { id: _i, firm_id: _f, ...safe } = patch as Record<string, unknown>;
      const updated: Employee = { ...e, ...(safe as Partial<Employee>) };
      actions.upsertEmployee(updated);
      return { ok: true, id: updated.id, employee: updated };
    },
  },

  {
    name: "delete_employee",
    description:
      "Supprime définitivement un salarié de la société active. Opération sensible : une confirmation est demandée à l'utilisateur avant exécution.",
    destructive: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "nom, matricule, CIN ou id" } },
      required: ["query"],
      additionalProperties: false,
    },
    run: (input) => {
      const e = findEmployee(String(input.query));
      if (!e) return { ok: false, error: "Salarié introuvable." };
      actions.removeEmployee(e.id);
      return { ok: true, deleted_id: e.id, name: `${e.first_name} ${e.last_name}` };
    },
  },

  {
    name: "compute_payslip",
    description:
      "Calcule le bulletin de paie d'un salarié pour un mois/année donné (brut, SBI, cotisations CNSS/AMO, abattement frais professionnels, IR, net à payer, coût employeur). Lecture seule : n'enregistre rien. Utilise le moteur légal Maroc (params.ts).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "salarié (nom/matricule/CIN/id)" },
        year: { type: "integer" },
        month: { type: "integer", description: "1-12" },
        days_worked: { type: "number" },
        hours_ot_25: { type: "number", description: "heures sup +25 %" },
        hours_ot_50: { type: "number", description: "heures sup +50 %" },
        hours_ot_100: { type: "number", description: "heures sup +100 %" },
        panier: { type: "number" },
        transport: { type: "number" },
        salissure: { type: "number" },
        other_gross: { type: "number", description: "primes diverses imposables" },
      },
      required: ["query", "year", "month"],
      additionalProperties: false,
    },
    run: (input) => {
      const e = findEmployee(String(input.query));
      if (!e) return { ok: false, error: "Salarié introuvable." };
      const s = getState();
      const firm = currentFirm(s);
      const base = defaultInput(e);
      const inp = {
        ...base,
        days_worked: input.days_worked != null ? Number(input.days_worked) : base.days_worked,
        hours_ot_25: input.hours_ot_25 != null ? Number(input.hours_ot_25) : 0,
        hours_ot_50: input.hours_ot_50 != null ? Number(input.hours_ot_50) : 0,
        hours_ot_100: input.hours_ot_100 != null ? Number(input.hours_ot_100) : 0,
        panier: input.panier != null ? Number(input.panier) : 0,
        transport: input.transport != null ? Number(input.transport) : 0,
        salissure: input.salissure != null ? Number(input.salissure) : 0,
        other_gross: input.other_gross != null ? Number(input.other_gross) : 0,
      };
      const r = computeFor(e, firm, Number(input.year), Number(input.month), inp);
      return {
        ok: true,
        employee: `${e.first_name} ${e.last_name}`,
        firm: firm.name,
        period: `${input.year}-${String(input.month).padStart(2, "0")}`,
        result: r,
      };
    },
  },

  {
    name: "get_params",
    description:
      "Renvoie les paramètres réglementaires (taux, plafonds, barème IR, frais professionnels, SMIG/SMAG, indemnités exonérées) applicables à une année. Source unique de vérité.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer" } },
      required: ["year"],
      additionalProperties: false,
    },
    run: (input) => getParams(Number(input.year)),
  },

  {
    name: "update_firm",
    description:
      "Met à jour les informations d'une société (nom, ICE, RC, IF, affiliation CNSS, ville, signataire par défaut, régime). `firm_id` cible la société, `patch` les champs à changer.",
    input_schema: {
      type: "object",
      properties: {
        firm_id: { type: "string" },
        patch: { type: "object", additionalProperties: true },
      },
      required: ["firm_id", "patch"],
      additionalProperties: false,
    },
    run: (input) => {
      const s = getState();
      const f = s.firms.find((x) => x.id === String(input.firm_id));
      if (!f) return { ok: false, error: "Société introuvable." };
      const patch = (input.patch ?? {}) as Record<string, unknown>;
      const { id: _i, ...safe } = patch;
      const updated: Firm = { ...f, ...(safe as Partial<Firm>) };
      actions.upsertFirm(updated);
      return { ok: true, firm: updated };
    },
  },

  {
    name: "get_compliance_alerts",
    description:
      "Renvoie les alertes de conformité de la société active (CNSS manquante, CIN absente, mineur sur site dangereux, CDD expirant). Lecture seule.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const s = getState();
      const firm = currentFirm(s);
      return { firm: firm.name, alerts: deriveAlerts(s, firm.id) };
    },
  },
];

export const TOOLS_BY_NAME: Record<string, AiTool> = Object.fromEntries(
  AI_TOOLS.map((t) => [t.name, t]),
);
