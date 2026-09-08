import { describe, expect, it } from "vitest";
import {
  abate,
  assessRisk,
  buildRiskMap,
  controlAbatement,
  controlAxis,
  controlGaps,
  criticityMatrix,
  exposure,
  isProven,
  RISK_CATALOGUE,
  STEPS,
  type RiskControl,
  type RiskDefinition,
  type RiskFacts,
} from "./risk-engine";
import { AXIS_FLOOR, DEFAULT_APPETITE, levelOf, MAX_ABATEMENT_POINTS } from "./risk-params";
import { collectRiskFacts, declarationOverdue, previousMonth } from "./risk-facts";
import type { AppState, Employee, Firm } from "@/data/types";

/* -------------------------------------------------- fixtures -------------------------------------------------- */

const ctrl = (patch: Partial<RiskControl> = {}): RiskControl => ({
  id: "c1",
  label: "Contrôle",
  type: "preventif",
  automation: "automatique",
  strength: "moyen",
  ...patch,
});

const def = (patch: Partial<RiskDefinition> = {}): RiskDefinition => ({
  ref: "RXX",
  step: "calcul",
  category: "financier",
  event: "événement",
  basis: "base",
  grossLikelihood: 4,
  grossImpact: 5,
  controls: [],
  ...patch,
});

/* -------------------------------------------------- échelles -------------------------------------------------- */

describe("niveaux", () => {
  it("place chaque score dans son niveau, bornes incluses", () => {
    expect(levelOf(1)).toBe("faible");
    expect(levelOf(4)).toBe("faible");
    expect(levelOf(5)).toBe("modere");
    expect(levelOf(9)).toBe("modere");
    expect(levelOf(10)).toBe("eleve");
    expect(levelOf(14)).toBe("eleve");
    expect(levelOf(15)).toBe("critique");
    expect(levelOf(25)).toBe("critique");
  });
});

/* -------------------------------------------------- preuve -------------------------------------------------- */

describe("preuve d'un contrôle", () => {
  it("crédite un contrôle intégré au code sans rien demander aux faits", () => {
    expect(isProven(ctrl({ proof: "builtIn" }), {})).toBe(true);
  });

  it("crédite un contrôle dont le fait est constaté", () => {
    expect(isProven(ctrl({ proof: "pinConfigured" }), { pinConfigured: true })).toBe(true);
  });

  it("ne crédite PAS un contrôle dont le fait est absent ou faux", () => {
    expect(isProven(ctrl({ proof: "pinConfigured" }), { pinConfigured: false })).toBe(false);
    expect(isProven(ctrl({ proof: "pinConfigured" }), {})).toBe(false);
  });

  it("ne crédite JAMAIS un contrôle déclaratif — un contrôle non prouvé masque le risque au lieu de le réduire", () => {
    expect(isProven(ctrl({ proof: undefined }), { pinConfigured: true })).toBe(false);
  });
});

describe("abattement d'un contrôle", () => {
  it("multiplie le poids par le facteur d'automatisation", () => {
    expect(controlAbatement(ctrl({ strength: "fort", automation: "automatique" }))).toBe(1.5);
    expect(controlAbatement(ctrl({ strength: "fort", automation: "manuel" }))).toBe(0.75);
    expect(controlAbatement(ctrl({ strength: "faible", automation: "semi" }))).toBeCloseTo(0.375, 5);
  });

  it("dirige le préventif sur la probabilité et le détectif/correctif sur l'impact", () => {
    expect(controlAxis("preventif")).toBe("likelihood");
    expect(controlAxis("detectif")).toBe("impact");
    expect(controlAxis("correctif")).toBe("impact");
  });
});

/* -------------------------------------------------- abattement plafonné -------------------------------------------------- */

describe("abate", () => {
  it("plafonne l'abattement quel que soit le nombre de contrôles empilés", () => {
    expect(abate(5, 99)).toBe(5 - MAX_ABATEMENT_POINTS);
  });

  it("ne descend jamais sous le plancher", () => {
    expect(abate(1, 99)).toBe(AXIS_FLOOR);
    expect(abate(2, 99)).toBe(AXIS_FLOOR);
  });

  it("ne remonte jamais au-dessus du brut (abattement négatif impossible)", () => {
    expect(abate(3, 0)).toBe(3);
    expect(abate(3, -5)).toBe(3);
  });

  it("arrondit l'abattement fractionnaire", () => {
    expect(abate(4, 0.75)).toBe(3); // 4 - 0,75 = 3,25 -> 3
    expect(abate(4, 0.4)).toBe(4); // 4 - 0,4 = 3,6 -> 4
  });
});

/* -------------------------------------------------- évaluation -------------------------------------------------- */

describe("assessRisk", () => {
  it("laisse le résiduel ÉGAL au brut quand aucun contrôle n'est prouvé", () => {
    const r = assessRisk(def({ controls: [ctrl({ proof: "pinConfigured" })] }), { pinConfigured: false });
    expect(r.grossScore).toBe(20);
    expect(r.residualScore).toBe(20);
    expect(r.reduction).toBe(0);
    expect(r.provenCount).toBe(0);
  });

  it("abat la PROBABILITÉ avec un contrôle préventif", () => {
    const r = assessRisk(
      def({ controls: [ctrl({ type: "preventif", strength: "fort", proof: "builtIn" })] }),
      {},
    );
    expect(r.residualLikelihood).toBe(3); // 4 - 1,5 = 2,5 -> 3 (arrondi)
    expect(r.residualImpact).toBe(5); // impact intact
  });

  it("abat l'IMPACT avec un contrôle détectif", () => {
    const r = assessRisk(
      def({ controls: [ctrl({ type: "detectif", strength: "fort", proof: "builtIn" })] }),
      {},
    );
    expect(r.residualLikelihood).toBe(4);
    expect(r.residualImpact).toBe(4); // 5 - 1,5 = 3,5 -> 4
  });

  it("ne fait JAMAIS disparaître un risque critique, même avec un dispositif complet", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      ctrl({ id: `c${i}`, type: i % 2 ? "detectif" : "preventif", strength: "fort", proof: "builtIn" }),
    );
    const r = assessRisk(def({ grossLikelihood: 5, grossImpact: 5, controls: many }), {});
    expect(r.residualLikelihood).toBe(3);
    expect(r.residualImpact).toBe(3);
    expect(r.residualScore).toBe(9);
    expect(r.residualLevel).toBe("modere"); // jamais « faible »
  });

  it("rapporte l'abattement RÉELLEMENT appliqué, pas la somme brute — sinon les chiffres ne se recoupent pas", () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      ctrl({ id: `c${i}`, type: "preventif", strength: "fort", proof: "builtIn" }),
    );
    const r = assessRisk(def({ grossLikelihood: 4, controls: many }), {});
    expect(r.abatementLikelihood).toBe(r.grossLikelihood - r.residualLikelihood);
    expect(r.abatementLikelihood).toBeLessThanOrEqual(MAX_ABATEMENT_POINTS);
  });

  it("signale un dépassement d'appétence et bascule le traitement sur « réduire »", () => {
    const r = assessRisk(def(), {}, DEFAULT_APPETITE);
    expect(r.residualScore).toBe(20);
    expect(r.aboveAppetite).toBe(true);
    expect(r.treatment).toBe("reduire");
  });

  it("accepte un risque sous appétence", () => {
    const r = assessRisk(def({ grossLikelihood: 2, grossImpact: 2 }), {}, DEFAULT_APPETITE);
    expect(r.aboveAppetite).toBe(false);
    expect(r.treatment).toBe("accepter");
  });

  it("calcule le pourcentage de réduction sur le brut", () => {
    const r = assessRisk(
      def({ grossLikelihood: 4, grossImpact: 5, controls: [ctrl({ strength: "fort", proof: "builtIn" })] }),
      {},
    );
    expect(r.residualScore).toBe(15); // 3 × 5
    expect(r.reductionPct).toBe(25);
  });
});

/* -------------------------------------------------- référentiel -------------------------------------------------- */

describe("référentiel", () => {
  it("n'a aucune référence en double", () => {
    const refs = RISK_CATALOGUE.map((r) => r.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("rattache chaque risque à une étape connue du processus", () => {
    for (const r of RISK_CATALOGUE) expect(STEPS).toContain(r.step);
  });

  it("couvre les sept étapes du processus — aucune étape aveugle", () => {
    for (const step of STEPS) {
      expect(RISK_CATALOGUE.some((r) => r.step === step), `étape sans risque : ${step}`).toBe(true);
    }
  });

  it("porte une base normative sur chaque risque", () => {
    for (const r of RISK_CATALOGUE) expect(r.basis.trim().length).toBeGreaterThan(3);
  });

  it("cote dans les bornes 1-5 sur les deux axes", () => {
    for (const r of RISK_CATALOGUE) {
      expect(r.grossLikelihood).toBeGreaterThanOrEqual(1);
      expect(r.grossLikelihood).toBeLessThanOrEqual(5);
      expect(r.grossImpact).toBeGreaterThanOrEqual(1);
      expect(r.grossImpact).toBeLessThanOrEqual(5);
    }
  });

  it("donne au moins un contrôle à chaque risque, et un identifiant unique à chacun", () => {
    const ids = new Set<string>();
    for (const r of RISK_CATALOGUE) {
      expect(r.controls.length, r.ref).toBeGreaterThan(0);
      for (const ct of r.controls) {
        expect(ids.has(ct.id), `identifiant de contrôle en double : ${ct.id}`).toBe(false);
        ids.add(ct.id);
      }
    }
  });

  it("documente tout contrôle déclaratif — sans clé de preuve, il faut dire ce qui manque", () => {
    for (const r of RISK_CATALOGUE) {
      for (const ct of r.controls) {
        if (!ct.proof) expect(ct.note, `${ct.id} sans note`).toBeTruthy();
      }
    }
  });
});

/* -------------------------------------------------- cartographie -------------------------------------------------- */

describe("buildRiskMap", () => {
  it("trie du résiduel le plus élevé au plus faible", () => {
    const map = buildRiskMap({});
    for (let i = 1; i < map.length; i += 1) {
      expect(map[i - 1].residualScore).toBeGreaterThanOrEqual(map[i].residualScore);
    }
  });

  it("réduit davantage l'exposition quand les faits sont favorables", () => {
    const none = exposure(buildRiskMap({}));
    const all: RiskFacts = {
      pinConfigured: true, rolesSegregated: true, loginAuditActive: true, allDeclaredCnss: true,
      noSubSmig: true, exitDocumented: true, exemptionsDocumented: true, cinOnFile: true,
      ribOnFile: true, medicalOnFile: true, bankBaselineSet: true, payrollValidated: true,
      accountingLocked: true, docArchiveActive: true, declarationsOnTime: true, noMinorAlert: true,
    };
    const full = exposure(buildRiskMap(all));
    expect(full.residualTotal).toBeLessThan(none.residualTotal);
    expect(full.controlsProven).toBeGreaterThan(none.controlsProven);
  });

  it("ne descend jamais l'exposition résiduelle à zéro, même tous faits acquis", () => {
    const all = Object.fromEntries(
      RISK_CATALOGUE.flatMap((r) => r.controls).filter((ct) => ct.proof).map((ct) => [ct.proof!, true]),
    ) as RiskFacts;
    const e = exposure(buildRiskMap(all));
    expect(e.residualTotal).toBeGreaterThan(0);
    expect(e.residualByLevel.faible).toBeLessThan(e.count);
  });
});

describe("exposure", () => {
  it("compte les niveaux et les contrôles sans rien perdre", () => {
    const map = buildRiskMap({});
    const e = exposure(map);
    const summed = Object.values(e.residualByLevel).reduce((a, b) => a + b, 0);
    expect(summed).toBe(map.length);
    expect(e.controlsTotal).toBe(map.reduce((t, r) => t + r.assessedControls.length, 0));
  });

  it("renvoie des compteurs nuls sur un ensemble vide, sans diviser par zéro", () => {
    const e = exposure([]);
    expect(e.count).toBe(0);
    expect(e.reductionPct).toBe(0);
    expect(e.avgResidual).toBe(0);
  });
});

describe("controlGaps", () => {
  it("ne liste que les contrôles NON prouvés, les plus structurants d'abord", () => {
    const gaps = controlGaps(buildRiskMap({}));
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(g.control.proven).toBe(false);
    for (let i = 1; i < gaps.length; i += 1) {
      const w = (x: (typeof gaps)[number]) => x.refs.length * x.potential;
      expect(w(gaps[i - 1])).toBeGreaterThanOrEqual(w(gaps[i]));
    }
  });
});

describe("criticityMatrix", () => {
  it("place chaque risque dans une seule case, impact en ordonnée", () => {
    const map = buildRiskMap({});
    const grid = criticityMatrix(map, "gross");
    expect(grid.length).toBe(5);
    expect(grid[0].length).toBe(5);
    const total = grid.flat(2).length;
    expect(total).toBe(map.length);
    const first = map[0];
    expect(grid[first.grossImpact - 1][first.grossLikelihood - 1]).toContain(first.ref);
  });
});

/* -------------------------------------------------- faits -------------------------------------------------- */

describe("previousMonth / declarationOverdue", () => {
  it("recule d'un mois, en franchissant l'année", () => {
    expect(previousMonth("2026-09-07")).toEqual({ year: 2026, month: 8 });
    expect(previousMonth("2026-01-15")).toEqual({ year: 2025, month: 12 });
  });

  it("place l'échéance au 10 du mois suivant, décembre compris", () => {
    expect(declarationOverdue(2026, 8, "2026-09-10")).toBe(false);
    expect(declarationOverdue(2026, 8, "2026-09-11")).toBe(true);
    expect(declarationOverdue(2026, 12, "2027-01-10")).toBe(false);
    expect(declarationOverdue(2026, 12, "2027-01-11")).toBe(true);
  });
});

describe("collectRiskFacts", () => {
  const FIRM: Firm = { id: "f1", name: "Test", regime: "SMIG" };
  const EMP: Employee = {
    id: "e1", firm_id: "f1", first_name: "A", last_name: "B",
    hire_date: "2020-01-01", contract_type: "CDI",
    base_hourly_rate: 30, monthly_hours: 191, dependents: 0, is_active: true,
    cnss_number: "123456",
  };
  const state = (patch: Partial<AppState> = {}): AppState => ({
    firms: [FIRM], employees: [], periods: [], payslips: [], leaves: [],
    currentFirmId: "f1", ...patch,
  });
  const ASOF = "2026-09-07";

  it("constate le code de validation depuis la société", () => {
    expect(collectRiskFacts(state(), FIRM, ASOF).pinConfigured).toBe(false);
    const withPin = { ...FIRM, validation_pin_hash: "abc" };
    expect(collectRiskFacts(state({ firms: [withPin] }), withPin, ASOF).pinConfigured).toBe(true);
  });

  it("ne crédite AUCUN fait sur un dispositif vide — un état vide ne prouve pas une maîtrise", () => {
    const f = collectRiskFacts(state(), FIRM, ASOF);
    expect(f.allDeclaredCnss).toBe(false);
    expect(f.cinOnFile).toBe(false);
    expect(f.noSubSmig).toBe(false);
    expect(f.declarationsOnTime).toBe(false);
  });

  it("exige le numéro CNSS de TOUS les salariés présents", () => {
    const ok = collectRiskFacts(state({ employees: [EMP] }), FIRM, ASOF);
    expect(ok.allDeclaredCnss).toBe(true);
    const ko = collectRiskFacts(
      state({ employees: [EMP, { ...EMP, id: "e2", cnss_number: undefined }] }), FIRM, ASOF,
    );
    expect(ko.allDeclaredCnss).toBe(false);
  });

  it("ignore un salarié déjà sorti dans l'appréciation de l'effectif présent", () => {
    const gone = { ...EMP, id: "e2", cnss_number: undefined, exit_date: "2026-06-30" };
    expect(collectRiskFacts(state({ employees: [EMP, gone] }), FIRM, ASOF).allDeclaredCnss).toBe(true);
  });

  it("détecte un salaire sous le minimum du régime", () => {
    const low = { ...EMP, base_hourly_rate: 5 };
    expect(collectRiskFacts(state({ employees: [low] }), FIRM, ASOF).noSubSmig).toBe(false);
  });

  it("exige une convention au dossier de CHAQUE salarié exonéré", () => {
    const anapec = { ...EMP, id: "e3", contract_type: "ANAPEC" as const };
    const s1 = state({ employees: [anapec] });
    expect(collectRiskFacts(s1, FIRM, ASOF).exemptionsDocumented).toBe(false);
    const s2 = state({
      employees: [anapec],
      attachments: [{
        id: "a1", firm_id: "f1", employee_id: "e3", kind: "anapec", filename: "c.pdf",
        mime: "application/pdf", size: 1, sha256: "x", uploaded_at: "2026-09-01T00:00:00.000Z",
      }],
    });
    expect(collectRiskFacts(s2, FIRM, ASOF).exemptionsDocumented).toBe(true);
  });

  it("tombe à faux dès qu'une période validée dépasse son échéance de déclaration", () => {
    const late = state({ periods: [{ id: "p1", firm_id: "f1", year: 2026, month: 6, status: "validated" }] });
    expect(collectRiskFacts(late, FIRM, ASOF).declarationsOnTime).toBe(false);
    const declared = state({ periods: [{ id: "p1", firm_id: "f1", year: 2026, month: 6, status: "declared" }] });
    expect(collectRiskFacts(declared, FIRM, ASOF).declarationsOnTime).toBe(true);
  });

  it("exige deux rôles DISTINCTS pour la séparation des tâches, pas deux comptes", () => {
    const two = (r1: "super_admin" | "gestionnaire_paie", r2: "super_admin" | "gestionnaire_paie") =>
      state({ users: [
        { id: "u1", username: "a", password_hash: "h", role: r1, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "u2", username: "b", password_hash: "h", role: r2, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      ] });
    expect(collectRiskFacts(two("super_admin", "super_admin"), FIRM, ASOF).rolesSegregated).toBe(false);
    expect(collectRiskFacts(two("super_admin", "gestionnaire_paie"), FIRM, ASOF).rolesSegregated).toBe(true);
  });

  it("constate l'archive PDF du journal des documents", () => {
    const s1 = state({ docGenerations: [
      { id: "d1", at: "2026-09-01T00:00:00.000Z", firm_id: "f1", doc_type: "attestation", format: "pdf" },
    ] });
    expect(collectRiskFacts(s1, FIRM, ASOF).docArchiveActive).toBe(false);
    const s2 = state({ docGenerations: [
      { id: "d1", at: "2026-09-01T00:00:00.000Z", firm_id: "f1", doc_type: "attestation", format: "pdf",
        archive: { filename: "a.pdf", size: 10, sha256: "x" } },
    ] });
    expect(collectRiskFacts(s2, FIRM, ASOF).docArchiveActive).toBe(true);
  });
});
