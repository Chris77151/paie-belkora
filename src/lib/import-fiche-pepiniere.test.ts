import { describe, expect, it } from "vitest";
import type { AppState } from "@/data/types";
import {
  PEP_MONTH, PEP_PAID_ROWS, PEP_NET_TOTAL, PEP_YEAR,
  ensureFicheEmargementPepiniere,
} from "./import-fiche-pepiniere";

const base = (withPep = true): AppState =>
  ({
    firms: withPep
      ? [{ id: "firm_pep", name: "Pépinière Belkora" }]
      : [{ id: "f_x", name: "Autre entité" }],
    employees: [],
    nonDeclarePayments: [],
  }) as unknown as AppState;

describe("import fiche Pépinière 20/09–03/10/2026", () => {
  it("50 ouvriers + 50 versements d'octobre, net 41 748 DH", () => {
    const s = base();
    const r = ensureFicheEmargementPepiniere(s);
    expect(r.firmMissing).toBe(false);
    expect(r.employeesAdded).toBe(50);
    expect(r.paymentsAdded).toBe(50);
    expect(r.totalNet).toBe(PEP_NET_TOTAL);
    expect(PEP_PAID_ROWS.length).toBe(50);
    const sum = s.nonDeclarePayments!.reduce((a, p) => a + p.net_verse, 0);
    expect(Math.round(sum * 100) / 100).toBe(41748);
    // Avance d'Aziz chlima : 1825 − 1500 = 325.
    const aziz = s.nonDeclarePayments!.find((p) => {
      const e = s.employees.find((x) => x.id === p.employee_id)!;
      return `${e.first_name} ${e.last_name}`.toLowerCase() === "aziz chlima";
    })!;
    expect(aziz.brut_verse).toBe(1825);
    expect(aziz.avance_deduite).toBe(1500);
    expect(aziz.net_verse).toBe(325);
    for (const pay of s.nonDeclarePayments!) {
      expect(pay.year).toBe(PEP_YEAR);
      expect(pay.month).toBe(PEP_MONTH);
      expect(pay.mode).toBe("especes");
      expect(pay.note).toContain("12/EM-2026-10");
    }
    for (const e of s.employees) {
      expect(e.cnss_number ?? "").toBe("");
      expect(e.site).toBe("Sidi Yahya");
      expect(e.position).toBe("Ouvrier");
    }
  });

  it("sans entité Pépinière : rien importé, rien inventé", () => {
    const s = base(false);
    const r = ensureFicheEmargementPepiniere(s);
    expect(r.firmMissing).toBe(true);
    expect(s.employees.length).toBe(0);
    expect(s.nonDeclarePayments!.length).toBe(0);
  });

  it("idempotent : rejoué sans doublon", () => {
    const s = base();
    ensureFicheEmargementPepiniere(s);
    const r2 = ensureFicheEmargementPepiniere(s);
    expect(r2.employeesAdded).toBe(0);
    expect(r2.paymentsAdded).toBe(0);
    expect(s.employees.length).toBe(50);
    expect(s.nonDeclarePayments!.length).toBe(50);
  });
});
