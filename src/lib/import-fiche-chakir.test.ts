import { describe, expect, it } from "vitest";
import type { AppState } from "@/data/types";
import {
  CHAKIR_MONTH, CHAKIR_PAID_ROWS, CHAKIR_NET_TOTAL, CHAKIR_YEAR,
  ensureFicheEmargementChakir, resolveChakirFirmId,
} from "./import-fiche-chakir";

const base = (firms: { id: string; name: string }[] = [{ id: "f_ch", name: "BELKORA CHAKIR" }]): AppState =>
  ({ firms, employees: [], nonDeclarePayments: [] }) as unknown as AppState;

describe("import fiche CHAKIR 20/09–03/10/2026", () => {
  it("17 ouvriers + 17 versements d'octobre, net 19 906 DH", () => {
    const s = base();
    expect(resolveChakirFirmId(s)).toBe("f_ch");
    const r = ensureFicheEmargementChakir(s);
    expect(r.firmId).toBe("f_ch");
    expect(r.employeesAdded).toBe(17);
    expect(r.paymentsAdded).toBe(17);
    expect(r.totalNet).toBe(CHAKIR_NET_TOTAL);
    expect(CHAKIR_PAID_ROWS.length).toBe(17);
    const sum = s.nonDeclarePayments!.reduce((a, p) => a + p.net_verse, 0);
    expect(Math.round(sum * 100) / 100).toBe(19906);
    // Avance d'Aziz chlima : 1825 − 1500 = 325.
    const aziz = s.nonDeclarePayments!.find((p) => {
      const e = s.employees.find((x) => x.id === p.employee_id)!;
      return `${e.first_name} ${e.last_name}`.toLowerCase() === "aziz chlima";
    })!;
    expect(aziz.brut_verse).toBe(1825);
    expect(aziz.avance_deduite).toBe(1500);
    expect(aziz.net_verse).toBe(325);
    for (const pay of s.nonDeclarePayments!) {
      expect(pay.year).toBe(CHAKIR_YEAR);
      expect(pay.month).toBe(CHAKIR_MONTH);
      expect(pay.mode).toBe("especes");
      expect(pay.note).toContain("12/EM-2026-10-CHAKIR");
    }
    for (const e of s.employees) {
      expect(e.cnss_number ?? "").toBe("");
      expect(e.site).toBe("Kénitra");
      expect(e.position).toBe("Ouvrier");
    }
  });

  it("lignes non salariales exclues (pas de fiches 3attach / transport)", () => {
    const s = base();
    ensureFicheEmargementChakir(s);
    const names = s.employees.map((e) => `${e.first_name} ${e.last_name}`.toLowerCase());
    expect(names.some((n) => n.includes("attach") || n.includes("transport"))).toBe(false);
    expect(s.employees.length).toBe(17);
  });

  it("sans entité CHAKIR : entité créée depuis la fiche, puis import complet", () => {
    const s = base([{ id: "f_x", name: "Autre entité" }]);
    const r = ensureFicheEmargementChakir(s);
    expect(r.firmCreated).toBe(true);
    expect(r.firmId).not.toBeNull();
    const created = s.firms.find((f) => f.id === r.firmId)!;
    expect(created.name).toBe("BELKORA CHAKIR");
    expect(created.cnss_affiliation).toBe("5776458");
    expect(r.employeesAdded).toBe(17);
    expect(r.paymentsAdded).toBe(17);
    // Rejoué : entité réutilisée, aucun doublon.
    const r2 = ensureFicheEmargementChakir(s);
    expect(r2.firmCreated).toBe(false);
    expect(r2.employeesAdded).toBe(0);
    expect(s.firms.filter((f) => f.name === "BELKORA CHAKIR").length).toBe(1);
  });

  it("idempotent : rejoué sans doublon", () => {
    const s = base();
    ensureFicheEmargementChakir(s);
    const r2 = ensureFicheEmargementChakir(s);
    expect(r2.employeesAdded).toBe(0);
    expect(r2.paymentsAdded).toBe(0);
    expect(s.employees.length).toBe(17);
    expect(s.nonDeclarePayments!.length).toBe(17);
  });
});
