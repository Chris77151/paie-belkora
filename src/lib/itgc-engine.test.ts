import { describe, expect, it } from "vitest";
import { DOMAINS, buildItgcReport, prioritise, ITGC_THRESHOLDS } from "./itgc-engine";
import { SUPER_ADMIN } from "@/data/seed";
import type { AppState, AppUser, Firm, LoginEvent } from "@/data/types";

const FIRM: Firm = { id: "f1", name: "MBD", regime: "SMIG", validation_pin_hash: "abc" };
const ASOF = "2026-09-10";

const user = (id: string, o: Partial<AppUser> = {}): AppUser => ({
  id, username: `u${id}`, role: "gestionnaire_paie", password_hash: "changed",
  is_active: true, created_at: "2026-01-01T00:00:00.000Z", ...o,
});

const login = (userId: string, at: string, outcome: LoginEvent["outcome"] = "success"): LoginEvent => ({
  id: `l_${userId}_${at}`, at, outcome, username: `u${userId}`, user_id: userId,
});

const state = (o: Partial<AppState> = {}): AppState => ({
  firms: [FIRM], employees: [], periods: [], payslips: [], leaves: [], currentFirmId: "f1",
  users: [user("1", { role: "super_admin" }), user("2")],
  loginEvents: [login("1", "2026-09-09T08:00:00.000Z"), login("2", "2026-09-09T09:00:00.000Z")],
  ...o,
});

const ENV = { cloudConfigured: true, aiKeyInBrowser: false, localOnlyAttachments: 0 };

/** Verdict d'un contrôle par son identifiant. */
const verdict = (s: AppState, id: string, env = ENV) =>
  buildItgcReport(s, ASOF, env).findings.find((f) => f.id === id)?.verdict;

describe("ITGC — accès aux programmes et aux données", () => {
  it("signale un mot de passe racine resté à la valeur documentée", () => {
    const withRoot = state({ users: [user("1", { is_super: true, role: "super_admin", password_hash: SUPER_ADMIN.password_hash }), user("2")] });
    expect(verdict(withRoot, "ACC-01")).toBe("anomalie");
    const changed = state({ users: [user("1", { is_super: true, role: "super_admin", password_hash: "autre" }), user("2")] });
    expect(verdict(changed, "ACC-01")).toBe("satisfait");
  });

  it("compte les comptes à privilèges et alerte au-delà du seuil", () => {
    const many = Array.from({ length: ITGC_THRESHOLDS.maxPrivileged + 1 }, (_, i) => user(`p${i}`, { role: "super_admin" }));
    expect(verdict(state({ users: many }), "ACC-02")).toBe("anomalie");
    expect(verdict(state(), "ACC-02")).toBe("satisfait");
  });

  it("détecte les comptes dormants au-delà du seuil, en partant de la dernière connexion RÉUSSIE", () => {
    const old = state({ loginEvents: [login("1", "2026-09-09T08:00:00.000Z"), login("2", "2026-01-01T09:00:00.000Z")] });
    expect(verdict(old, "ACC-03")).toBe("anomalie");
    expect(verdict(state(), "ACC-03")).toBe("satisfait");
  });

  it("ne compte pas un échec de connexion comme une preuve d'activité", () => {
    const failedOnly = state({
      loginEvents: [login("1", "2026-09-09T08:00:00.000Z"), login("2", "2026-09-09T09:00:00.000Z", "failed")],
    });
    expect(verdict(failedOnly, "ACC-03")).toBe("anomalie");
  });

  it("déclare l'ancienneté des accès NON ÉVALUÉE quand le journal est vide", () => {
    expect(verdict(state({ loginEvents: [] }), "ACC-03")).toBe("non_evalue");
    expect(verdict(state({ loginEvents: [] }), "ACC-07")).toBe("non_evalue");
  });

  it("exige deux rôles DISTINCTS pour la séparation des tâches, pas deux comptes", () => {
    const sameRole = state({ users: [user("1", { role: "super_admin" }), user("2", { role: "super_admin" })] });
    expect(verdict(sameRole, "ACC-04")).toBe("anomalie");
    expect(verdict(state(), "ACC-04")).toBe("satisfait");
  });

  it("signale une société sans code de validation", () => {
    const noPin = state({ firms: [FIRM, { id: "f2", name: "Ahmed", regime: "SMIG" }] });
    expect(verdict(noPin, "ACC-05")).toBe("anomalie");
    expect(verdict(state(), "ACC-05")).toBe("satisfait");
  });

  it("détecte une série anormale d'échecs sur la fenêtre d'observation", () => {
    const burst = Array.from({ length: ITGC_THRESHOLDS.bruteForceThreshold }, (_, i) =>
      ({ ...login("2", `2026-09-08T0${i % 10}:00:00.000Z`, "failed"), id: `b${i}` }));
    expect(verdict(state({ loginEvents: [login("1", "2026-09-09T08:00:00.000Z"), ...burst] }), "ACC-07")).toBe("anomalie");
  });

  it("ignore les échecs hors de la fenêtre d'observation", () => {
    const old = Array.from({ length: 30 }, (_, i) =>
      ({ ...login("2", "2026-01-01T00:00:00.000Z", "failed"), id: `o${i}` }));
    expect(verdict(state({ loginEvents: [login("1", "2026-09-09T08:00:00.000Z"), ...old] }), "ACC-07")).toBe("satisfait");
  });
});

describe("ITGC — exploitation", () => {
  it("signale l'absence de sauvegarde hors du poste", () => {
    expect(verdict(state(), "EXP-01", { ...ENV, cloudConfigured: false })).toBe("anomalie");
    expect(verdict(state(), "EXP-01")).toBe("satisfait");
  });

  it("garde la restauration NON ÉVALUÉE — une sauvegarde jamais restaurée est une hypothèse", () => {
    expect(verdict(state(), "EXP-02")).toBe("non_evalue");
  });

  it("signale un secret stocké dans le navigateur", () => {
    expect(verdict(state(), "EXP-04", { ...ENV, aiKeyInBrowser: true })).toBe("anomalie");
    expect(verdict(state(), "EXP-04")).toBe("satisfait");
  });

  it("signale les pièces jointes qui ne vivent que sur ce poste", () => {
    expect(verdict(state(), "EXP-03", { ...ENV, localOnlyAttachments: 4 })).toBe("anomalie");
  });

  it("détecte les bulletins et congés orphelins", () => {
    const orphan = state({
      payslips: [{ id: "s1", period_id: "p1", employee_id: "disparu", input: {
        days_worked: 26, hours_normal: 191, hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
        panier: 0, transport: 0, salissure: 0, other_gross: 0,
      }, result: null }],
    });
    expect(verdict(orphan, "EXP-05")).toBe("anomalie");
    expect(verdict(state(), "EXP-05")).toBe("satisfait");
  });

  it("détecte un matricule en double — deux salariés confondus dans une déclaration", () => {
    const dup = state({
      employees: [
        { id: "e1", firm_id: "f1", first_name: "A", last_name: "B", hire_date: "2020-01-01", contract_type: "CDI", base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true, matricule: "007" },
        { id: "e2", firm_id: "f1", first_name: "C", last_name: "D", hire_date: "2020-01-01", contract_type: "CDI", base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true, matricule: "007" },
      ],
    });
    expect(verdict(dup, "EXP-06")).toBe("anomalie");
  });
});

describe("ITGC — maturité", () => {
  it("EXCLUT les contrôles non évalués du dénominateur", () => {
    const r = buildItgcReport(state(), ASOF, ENV);
    const evaluables = r.findings.length - r.notAssessed.length;
    const satisfaits = r.findings.filter((f) => f.verdict === "satisfait").length;
    expect(r.maturityPct).toBe(Math.round((satisfaits / evaluables) * 100));
    // La règle qui compte : un score sur le TOTAL serait plus bas, donc plus flatteur à mesure
    // que l'outil devient aveugle.
    expect(r.notAssessed.length).toBeGreaterThan(0);
  });

  it("calcule une maturité par domaine, chacune sur ses propres évaluables", () => {
    const r = buildItgcReport(state(), ASOF, ENV);
    expect(r.byDomain.map((d) => d.domain)).toEqual(DOMAINS);
    for (const d of r.byDomain) {
      const dom = r.findings.filter((f) => f.domain === d.domain);
      expect(d.applicable + d.notAssessed).toBe(dom.length);
      expect(d.pct).toBe(d.applicable === 0 ? 0 : Math.round((d.satisfied / d.applicable) * 100));
    }
  });

  it("n'atteint jamais 100 % : le référentiel porte des contrôles structurellement ouverts", () => {
    expect(buildItgcReport(state(), ASOF, ENV).maturityPct).toBeLessThan(100);
  });

  it("ventile les anomalies par gravité sans en perdre", () => {
    const r = buildItgcReport(state(), ASOF, { cloudConfigured: false, aiKeyInBrowser: true, localOnlyAttachments: 2 });
    const somme = r.counts.critique + r.counts.majeur + r.counts.mineur;
    expect(somme).toBe(r.anomalies.length);
    expect(r.counts.critique).toBeGreaterThan(0);
  });
});

describe("ITGC — référentiel", () => {
  it("n'a aucun identifiant en double", () => {
    const ids = buildItgcReport(state(), ASOF, ENV).findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rattache chaque contrôle à un domaine connu", () => {
    for (const f of buildItgcReport(state(), ASOF, ENV).findings) expect(DOMAINS).toContain(f.domain);
  });

  it("donne à chaque constat sa conséquence, son action et sa preuve de clôture", () => {
    for (const f of buildItgcReport(state(), ASOF, ENV).findings) {
      expect(f.control.length, f.id).toBeGreaterThan(10);
      expect(f.observed.length, f.id).toBeGreaterThan(5);
      expect(f.consequence.length, f.id).toBeGreaterThan(10);
      expect(f.action.length, f.id).toBeGreaterThan(5);
      expect(f.evidence.length, f.id).toBeGreaterThan(5);
    }
  });
});

describe("prioritise", () => {
  it("ordonne par rapport gravité / effort — ce qui coûte peu et rapporte beaucoup d'abord", () => {
    const r = buildItgcReport(state(), ASOF, { cloudConfigured: false, aiKeyInBrowser: true, localOnlyAttachments: 1 });
    const ordered = prioritise(r.anomalies);
    const sev = { critique: 3, majeur: 2, mineur: 1 } as const;
    const eff = { immediat: 3, court_terme: 2, projet: 1 } as const;
    for (let i = 1; i < ordered.length; i += 1) {
      const w = (x: (typeof ordered)[number]) => sev[x.severity] * eff[x.effort];
      expect(w(ordered[i - 1])).toBeGreaterThanOrEqual(w(ordered[i]));
    }
  });

  it("ne perd ni n'ajoute aucune anomalie", () => {
    const r = buildItgcReport(state(), ASOF, ENV);
    expect(prioritise(r.anomalies)).toHaveLength(r.anomalies.length);
  });
});
