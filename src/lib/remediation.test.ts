import { describe, it, expect } from "vitest";
import { classifyRemediation, buildRemediationPlan, type AuditFinding, type AuditReport } from "./audit-engine";
import { groupReconcilable, type OdooOpenItem } from "./odoo";

const finding = (over: Partial<AuditFinding>): AuditFinding => ({
  categorie_assertion: "soldes",
  assertion: "Existence",
  cycle: "ventes/clients",
  gravite: "moyen",
  titre: "Constat",
  detail: "…",
  recommandation: "…",
  reference_normative: "CGNC",
  action_odoo: "…",
  comptes: [],
  ...over,
});

describe("classifyRemediation — AUTO (lettrage) vs HUMAIN", () => {
  it("un constat de lettrage non rapproché est AUTO", () => {
    expect(classifyRemediation(finding({ titre: "3 écriture(s) client non lettrée(s)" })).mode).toBe("auto");
    expect(classifyRemediation(finding({ titre: "5 écriture(s) fournisseur non lettrée(s)" })).mode).toBe("auto");
  });
  it("toute autre anomalie est HUMAIN (jugement/fond)", () => {
    expect(classifyRemediation(finding({ titre: "Balance générale déséquilibrée" })).mode).toBe("humain");
    expect(classifyRemediation(finding({ titre: "Compte d'attente 471 non soldé" })).mode).toBe("humain");
    expect(classifyRemediation(finding({ titre: "Écriture en brouillon" })).mode).toBe("humain");
  });
});

describe("buildRemediationPlan — répartition en 2 volets", () => {
  it("sépare auto et humain sans perte", () => {
    const report: AuditReport = {
      synthese: "", score_fiabilite: 70, scope: "test",
      constats: [
        finding({ titre: "2 écriture(s) client non lettrée(s)" }),
        finding({ titre: "Charge au solde créditeur" }),
        finding({ titre: "4 écriture(s) fournisseur non lettrée(s)" }),
      ],
    };
    const { auto, humain } = buildRemediationPlan(report);
    expect(auto).toHaveLength(2);
    expect(humain).toHaveLength(1);
    expect(auto.length + humain.length).toBe(report.constats.length);
  });
});

describe("groupReconcilable — sous-ensemble SÛR (s'apure exactement)", () => {
  const item = (over: Partial<OdooOpenItem>): OdooOpenItem => ({
    id: 0, account_id: 3421, account_code: "3421", partner_id: 10, partner: "Client A",
    move_name: "FAC/1", date: "2026-03-01", residual: 0, ...over,
  });

  it("retient un groupe (même compte + tiers) dont le résidu net = 0 avec sens opposés", () => {
    const lines = [
      item({ id: 1, residual: 1000 }),   // facture
      item({ id: 2, residual: -1000 }),  // règlement
    ];
    const g = groupReconcilable(lines);
    expect(g).toHaveLength(1);
    expect(g[0].line_ids.sort()).toEqual([1, 2]);
    expect(g[0].amount).toBe(1000);
    expect(g[0].sum_residual).toBe(0);
  });

  it("IGNORE un groupe qui laisse un résidu (≠ 0) — relève du jugement humain", () => {
    const lines = [item({ id: 1, residual: 1000 }), item({ id: 2, residual: -600 })];
    expect(groupReconcilable(lines)).toHaveLength(0);
  });

  it("IGNORE un groupe à sens unique (aucune contrepartie)", () => {
    const lines = [item({ id: 1, residual: 500 }), item({ id: 2, residual: 500 })];
    expect(groupReconcilable(lines)).toHaveLength(0);
  });

  it("ne mélange pas deux tiers différents", () => {
    const lines = [
      item({ id: 1, partner_id: 10, residual: 1000 }),
      item({ id: 2, partner_id: 20, residual: -1000 }),
    ];
    expect(groupReconcilable(lines)).toHaveLength(0);
  });

  it("ne mélange pas deux comptes différents", () => {
    const lines = [
      item({ id: 1, account_id: 3421, account_code: "3421", residual: 1000 }),
      item({ id: 2, account_id: 4411, account_code: "4411", residual: -1000 }),
    ];
    expect(groupReconcilable(lines)).toHaveLength(0);
  });

  it("tolère un écart d'arrondi < 1 centime", () => {
    const lines = [item({ id: 1, residual: 1000 }), item({ id: 2, residual: -1000.004 })];
    expect(groupReconcilable(lines)).toHaveLength(1);
  });

  it("une seule ligne n'est jamais lettrable", () => {
    expect(groupReconcilable([item({ id: 1, residual: 0 })])).toHaveLength(0);
  });
});
