import { describe, expect, it } from "vitest";
import type { AppState } from "@/data/types";
import {
  FICHE_MONTH, FICHE_PAID_ROWS, FICHE_TOTAL, FICHE_YEAR,
  ensureFicheEmargementSidiYahya,
} from "./import-fiche-sidi-yahya";

const base = (): AppState =>
  ({
    firms: [{ id: "firm_miya", name: "Miya Belkora Design SARL AU" }],
    employees: [],
    nonDeclarePayments: [],
  }) as unknown as AppState;

describe("import fiche Sidi Yahya 20/09–03/10/2026", () => {
  it("33 salariés + 33 versements de septembre, total 21 842 DH", () => {
    const s = base();
    const r = ensureFicheEmargementSidiYahya(s);
    expect(r.employeesAdded).toBe(33);
    expect(r.paymentsAdded).toBe(33);
    expect(r.totalNet).toBe(FICHE_TOTAL);
    expect(FICHE_PAID_ROWS.length).toBe(33);
    const sum = s.nonDeclarePayments!.reduce((a, p) => a + p.net_verse, 0);
    expect(Math.round(sum)).toBe(21842);
    // Tous en septembre, espèces, sans CNSS, site + chantier tracés.
    for (const pay of s.nonDeclarePayments!) {
      expect(pay.year).toBe(FICHE_YEAR);
      expect(pay.month).toBe(FICHE_MONTH);
      expect(pay.mode).toBe("especes");
      expect(pay.note).toContain("12/EM-2026-10-MIYA");
      expect(pay.note).toContain("Sidi Yahya");
    }
    for (const e of s.employees) {
      expect(e.cnss_number ?? "").toBe("");
      expect(e.site).toBe("Sidi Yahya");
      expect(e.position).toBe("Ouvrier");
      expect(e.contract_type).toBe("CDD");
    }
  });

  it("idempotent : rejoué sans doublon", () => {
    const s = base();
    ensureFicheEmargementSidiYahya(s);
    const r2 = ensureFicheEmargementSidiYahya(s);
    expect(r2.employeesAdded).toBe(0);
    expect(r2.paymentsAdded).toBe(0);
    expect(s.employees.length).toBe(33);
    expect(s.nonDeclarePayments!.length).toBe(33);
  });

  it("un salarié déjà immatriculé CNSS est ignoré (paie normale)", () => {
    const s = base();
    ensureFicheEmargementSidiYahya(s);
    // Régularisation simulée du 1er salarié.
    s.employees[0].cnss_number = "999";
    s.nonDeclarePayments = [];
    const r = ensureFicheEmargementSidiYahya(s);
    expect(r.paymentsSkippedDeclared).toBe(1);
    expect(r.paymentsAdded).toBe(32);
  });
});
