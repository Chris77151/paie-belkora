import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "@/data/types";
import { seed } from "@/data/seed";

// Stockage minimal (suite Node, sans DOM) pour pouvoir charger le store.
const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage };
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
if (typeof g.localStorage === "undefined") g.localStorage = memoryStorage();
if (typeof g.sessionStorage === "undefined") g.sessionStorage = memoryStorage();

beforeEach(() => {
  g.localStorage!.clear();
  g.sessionStorage!.clear();
  vi.resetModules();
});
import { ensureFicheEmargementSidiYahya } from "./import-fiche-sidi-yahya";
import { ensureFicheEmargementChakir } from "./import-fiche-chakir";
import { ensureFicheEmargementPepiniere } from "./import-fiche-pepiniere";

/**
 * Preuve d'exécution groupée : les 3 fiches de la quinzaine 20/09–03/10/2026
 * alimentent la paie non-déclarée de SEPTEMBRE 2026 dans les 3 entités.
 */
describe("paie non-déclarée septembre 2026 — 3 entités", () => {
  it("MIYA 33 / CHAKIR 17 / Pépinière 50, jours et montants exacts de chaque fiche", () => {
    const s = { ...seed(), employees: [], nonDeclarePayments: [] } as unknown as AppState;
    // L'entité CHAKIR n'existe pas dans le seed : créée depuis sa fiche.
    const rm = ensureFicheEmargementSidiYahya(s);
    const rc = ensureFicheEmargementChakir(s);
    const rp = ensureFicheEmargementPepiniere(s);
    expect([rm.employeesAdded, rm.paymentsAdded]).toEqual([33, 33]);
    expect([rc.employeesAdded, rc.paymentsAdded]).toEqual([17, 17]);
    expect([rp.employeesAdded, rp.paymentsAdded]).toEqual([50, 50]);

    const net09 = (firmId: string): number =>
      Math.round(
        s.nonDeclarePayments!.filter((p) => p.firm_id === firmId && p.year === 2026 && p.month === 9)
          .reduce((a, p) => a + p.net_verse, 0) * 100,
      ) / 100;
    // Totaux NETS de septembre par entité = totaux des 3 fiches.
    expect(net09("firm_miya")).toBe(21842);
    expect(net09(rc.firmId!)).toBe(19906);
    expect(net09("firm_pep")).toBe(41748);

    // Jours et montants fidèles aux fiches (exemples de contrôle).
    const empOf = (payId: string): string => {
      const pay = s.nonDeclarePayments!.find((p) => p.id === payId)!;
      const e = s.employees.find((x) => x.id === pay.employee_id)!;
      return `${e.first_name} ${e.last_name}`;
    };
    expect(empOf("ndp-sy-2026-09-01")).toBe("hassan neaija");
    expect(s.nonDeclarePayments!.find((p) => p.id === "ndp-sy-2026-09-01")!.jours).toBe(12);
    expect(empOf("ndp-ch-2026-09-04")).toBe("Aziz chlima");
    expect(s.nonDeclarePayments!.find((p) => p.id === "ndp-ch-2026-09-04")!.net_verse).toBe(325);
    expect(empOf("ndp-pep-2026-09-50")).toBe("abdelmotalib salih");

    // Étanchéité : aucun sans-CNSS en paie normale (tous créés sans CNSS).
    for (const e of s.employees) expect(e.cnss_number ?? "").toBe("");
  });

  it("installation fraîche : le chargement applique les 3 imports (pas de seed nu)", async () => {
    // Aucun localStorage → load() part du seed : migrate doit y appliquer les fiches.
    const st = await import("@/data/store");
    const s = st.getState();
    const chakirId = s.firms.find((f) => f.name.toLowerCase().includes("chakir"))!.id;
    const count = (firmId: string): number =>
      (s.nonDeclarePayments ?? []).filter((p) => p.firm_id === firmId && p.year === 2026 && p.month === 9).length;
    expect(count("firm_miya")).toBe(33);
    expect(count(chakirId)).toBe(17);
    expect(count("firm_pep")).toBe(50);
    expect(s.nonDeclarePayments!.filter((p) => p.year === 2026 && p.month === 9).length).toBe(100);
  });
});
