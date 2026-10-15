import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "./types";

/**
 * Purge des journaux — la garde vit dans le STORE, pas seulement dans l'interface.
 *
 * Un bouton masqué se contourne par un appel direct ; ces conditions, non. Ces tests appellent
 * donc l'action du store SANS passer par l'écran, exactement comme le ferait un contournement.
 *
 * Le rôle est lu depuis `sessionStorage` + la liste des comptes : on reconstruit donc les deux
 * avant chaque cas, puis on ré-importe le module pour qu'il reparte d'un état propre.
 */

const SESSION_KEY = "gca-paie-session-user";
const STATE_KEY = "gca-paie-rh-state-v1";

/**
 * Stockage web minimal en mémoire. La suite tourne sous Node (moteurs purs, aucun DOM) : plutôt
 * que d'imposer jsdom à tout le projet pour ce seul fichier, on fournit ici les deux API que le
 * store utilise réellement.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
  } as Storage;
}

const g = globalThis as unknown as { localStorage: Storage; sessionStorage: Storage };
if (typeof g.localStorage === "undefined") g.localStorage = memoryStorage();
if (typeof g.sessionStorage === "undefined") g.sessionStorage = memoryStorage();

/** Installe un état persisté avec un unique compte connecté du rôle voulu. */
async function bootWithRole(role: AppRole) {
  const user = {
    id: "u1", username: "test", role, password_hash: "h",
    is_active: true, created_at: "2026-01-01T00:00:00.000Z",
  };
  const state = {
    firms: [{ id: "f1", name: "MBD", regime: "SMIG" }],
    employees: [], periods: [], payslips: [], leaves: [],
    currentFirmId: "f1",
    users: [user],
    loginEvents: [
      { id: "l1", at: "2026-09-01T08:00:00.000Z", outcome: "success", username: "test", user_id: "u1" },
    ],
    docGenerations: [
      { id: "d1", at: "2026-09-01T08:00:00.000Z", firm_id: "f1", doc_type: "attestation", format: "pdf" },
    ],
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  sessionStorage.setItem(SESSION_KEY, "u1");

  // Le store lit localStorage À L'IMPORT : il faut donc un module neuf par scénario, sinon
  // l'état du cas précédent persiste et le rôle testé n'est jamais celui qu'on croit.
  vi.resetModules();
  return import("./store");
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("purge du journal des DOCUMENTS — réservée aux administrateurs", () => {
  it("le super administrateur peut vider", async () => {
    const st = await bootWithRole("super_admin");
    st.actions.clearDocGenerations();
    expect(st.getState().docGenerations).toHaveLength(0);
  });

  it("l'administrateur de société peut vider", async () => {
    const st = await bootWithRole("firm_admin");
    st.actions.clearDocGenerations();
    expect(st.getState().docGenerations).toHaveLength(0);
  });

  it("le gestionnaire de paie NE PEUT PAS vider, même par appel direct", async () => {
    const st = await bootWithRole("gestionnaire_paie");
    st.actions.clearDocGenerations();
    expect(st.getState().docGenerations).toHaveLength(1);
  });

  it("la lecture seule ne peut pas vider", async () => {
    const st = await bootWithRole("lecture_seule");
    st.actions.clearDocGenerations();
    expect(st.getState().docGenerations).toHaveLength(1);
  });
});

describe("purge du journal des CONNEXIONS — réservée au super administrateur", () => {
  it("le super administrateur peut vider", async () => {
    const st = await bootWithRole("super_admin");
    st.actions.clearLoginEvents();
    expect(st.getState().loginEvents).toHaveLength(0);
  });

  it("l'administrateur de société NE PEUT PAS vider — c'est le journal qu'un intrus efface en premier", async () => {
    const st = await bootWithRole("firm_admin");
    st.actions.clearLoginEvents();
    expect(st.getState().loginEvents).toHaveLength(1);
  });

  it("le gestionnaire de paie ne peut pas vider", async () => {
    const st = await bootWithRole("gestionnaire_paie");
    st.actions.clearLoginEvents();
    expect(st.getState().loginEvents).toHaveLength(1);
  });
});

describe("helpers de rôle", () => {
  it("reconnaissent l'administrateur et le super administrateur", async () => {
    const sa = await bootWithRole("super_admin");
    expect(sa.canAdminister()).toBe(true);
    expect(sa.isSuperAdmin()).toBe(true);

    const fa = await bootWithRole("firm_admin");
    expect(fa.canAdminister()).toBe(true);
    expect(fa.isSuperAdmin()).toBe(false);

    const gp = await bootWithRole("gestionnaire_paie");
    expect(gp.canAdminister()).toBe(false);
    expect(gp.isSuperAdmin()).toBe(false);
  });

  it("la restriction de purge n'entrave pas les écritures ordinaires du gestionnaire", async () => {
    const st = await bootWithRole("gestionnaire_paie");
    st.actions.upsertEmployee({
      id: "e1", firm_id: "f1", first_name: "A", last_name: "B",
      hire_date: "2026-01-01", contract_type: "CDI",
      base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
    });
    // Périmètre de l'entité testée : les backfills d'import (fiches d'émargement
    // d'autres entités) peuvent ajouter leurs propres salariés — on ne les compte pas ici.
    expect(st.getState().employees.filter((e) => e.firm_id === "f1")).toHaveLength(1);
  });
});
