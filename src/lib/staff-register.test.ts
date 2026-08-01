import { describe, expect, it } from "vitest";
import type { AppState, Employee, Firm } from "@/data/types";
import { getParams } from "./params";
import {
  buildStaffRegister,
  daysBetween,
  declarationStatus,
  exposureEstimate,
  buildMovements,
  legalRegisters,
  REGISTER_DISCLAIMER,
} from "./staff-register";

const P = getParams(2026).registre;

const firm = { id: "f1", name: "Pépinière Belkora", regime: "SMAG" } as unknown as Firm;

const emp = (o: Partial<Employee>): Employee => ({
  id: "e1",
  firm_id: "f1",
  first_name: "Ahmed",
  last_name: "Alaoui",
  hire_date: "2026-01-10",
  contract_type: "CDI",
  base_hourly_rate: 20,
  monthly_hours: 191,
  dependents: 0,
  is_active: true,
  ...o,
});

const state = (employees: Employee[]): AppState =>
  ({ firms: [firm], employees, current_firm_id: "f1" }) as unknown as AppState;

const REG = { from: "2026-01-01", to: "2026-07-31" };

describe("daysBetween", () => {
  it("compte les jours calendaires", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("est négatif quand la seconde date précède la première", () => {
    expect(daysBetween("2026-02-01", "2026-01-01")).toBeLessThan(0);
  });

  it("retourne 0 sur une date invalide plutôt que NaN — un registre ne doit jamais afficher NaN", () => {
    expect(daysBetween("", "2026-01-01")).toBe(0);
  });
});

describe("declarationStatus — les quatre états", () => {
  it("un n° CNSS renseigné suffit à établir « déclaré »", () => {
    const r = declarationStatus(emp({ cnss_number: "9829609" }), "2026-07-31", P);
    expect(r.status).toBe("declare");
  });

  it("sans n° CNSS et dans le délai : « délai en cours », avec les jours restants", () => {
    const r = declarationStatus(emp({ hire_date: "2026-07-31" }), "2026-07-31", P);
    expect(r.status).toBe("delai_en_cours");
    expect(r.days).toBe(P.declarationDeadlineDays);
  });

  it("sans n° CNSS et délai dépassé : « hors délai », avec le retard exact", () => {
    const r = declarationStatus(emp({ hire_date: "2026-01-01" }), "2026-01-31", P);
    expect(r.status).toBe("hors_delai");
    expect(r.days).toBe(30 - P.declarationDeadlineDays);
  });

  it("stagiaire sans n° CNSS : régime dérogatoire, jamais « hors délai »", () => {
    const r = declarationStatus(emp({ contract_type: "Stagiaire", hire_date: "2020-01-01" }), "2026-07-31", P);
    expect(r.status).toBe("derogatoire");
  });

  it("intérim : déclaré par l'ETT, donc dérogatoire côté entreprise utilisatrice", () => {
    expect(declarationStatus(emp({ contract_type: "Interim" }), "2026-07-31", P).status).toBe("derogatoire");
  });

  it("ANAPEC sans n° CNSS est HORS DÉLAI : l'exonération porte sur les cotisations, pas sur la déclaration", () => {
    const r = declarationStatus(
      emp({ contract_type: "ANAPEC", cnss_exemption: "patronale", hire_date: "2026-01-01" }),
      "2026-07-31",
      P,
    );
    expect(r.status).toBe("hors_delai");
  });

  it("le statut dépend de la date d'arrêté passée, pas de la date du jour", () => {
    const e = emp({ hire_date: "2026-01-01" });
    expect(declarationStatus(e, "2026-01-01", P).status).toBe("delai_en_cours");
    expect(declarationStatus(e, "2026-06-01", P).status).toBe("hors_delai");
  });
});

describe("exposureEstimate — ordre de grandeur", () => {
  it("est nulle sans retard", () => {
    expect(exposureEstimate(0, P)).toBe(0);
  });

  it("vaut l'amende de base tant que le seuil de majoration n'est pas franchi", () => {
    expect(exposureEstimate(30, P)).toBe(P.amendeNonImmatriculationParSalarie);
  });

  it("ajoute la majoration mensuelle au-delà du seuil", () => {
    const days = (P.seuilRetardMois + 3) * 30;
    expect(exposureEstimate(days, P)).toBe(P.amendeNonImmatriculationParSalarie + 3 * P.majorationRetardMensuelleParSalarie);
  });

  it("croît avec le retard", () => {
    expect(exposureEstimate(400, P)).toBeGreaterThan(exposureEstimate(100, P));
  });
});

describe("périmètre du registre", () => {
  it("inclut les sortants de la période — c'est la traçabilité que contrôle l'inspection", () => {
    const r = buildStaffRegister(
      state([emp({ id: "e1", exit_date: "2026-03-15", exit_reason: "demission", is_active: false })]),
      "f1",
      REG,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].leaverInPeriod).toBe(true);
  });

  it("exclut un salarié sorti avant le début de la période", () => {
    const r = buildStaffRegister(
      state([emp({ exit_date: "2025-06-30", is_active: false })]),
      "f1",
      REG,
    );
    expect(r.rows).toHaveLength(0);
  });

  it("exclut un salarié entré après la fin de la période", () => {
    const r = buildStaffRegister(state([emp({ hire_date: "2026-12-01" })]), "f1", REG);
    expect(r.rows).toHaveLength(0);
  });

  it("inclut les non déclarés — un registre limité aux déclarés reproduirait la vue CNSS", () => {
    const r = buildStaffRegister(state([emp({ cnss_number: undefined })]), "f1", REG);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].declaration).toBe("hors_delai");
  });

  it("classe par date d'entrée croissante — ordre d'un registre, pas un classement", () => {
    const r = buildStaffRegister(
      state([
        emp({ id: "b", hire_date: "2026-05-01", last_name: "Zahra" }),
        emp({ id: "a", hire_date: "2026-02-01", last_name: "Alami" }),
      ]),
      "f1",
      REG,
    );
    expect(r.rows.map((x) => x.hireDate)).toEqual(["2026-02-01", "2026-05-01"]);
  });
});

describe("indicateurs de mouvement", () => {
  const s = state([
    emp({ id: "a", hire_date: "2025-01-01", cnss_number: "111" }), // présent, déclaré, entré avant
    emp({ id: "b", hire_date: "2026-02-01" }), // entrant, non déclaré
    emp({ id: "c", hire_date: "2025-01-01", exit_date: "2026-03-01", exit_reason: "demission", is_active: false }),
  ]);
  const r = buildStaffRegister(s, "f1", REG);

  it("compte l'effectif présent à la date d'arrêté (hors sortants)", () => {
    expect(r.kpis.headcount).toBe(2);
  });

  it("expose l'écart entre effectif réel et effectif déclaré", () => {
    expect(r.kpis.declared).toBe(1);
    expect(r.kpis.gap).toBe(1);
  });

  it("compte les entrées et sorties de la période", () => {
    expect(r.kpis.entries).toBe(1);
    expect(r.kpis.exits).toBe(1);
  });

  it("publie la formule du turnover avec sa valeur", () => {
    expect(r.kpis.turnover).toBeGreaterThan(0);
    expect(r.kpis.turnoverFormula).toContain("effectif moyen");
  });

  it("ventile les sorties par motif", () => {
    expect(r.kpis.exitsByReason[0]).toEqual({ reason: "Démission", count: 1 });
  });

  it("ne divise jamais par zéro sur un registre vide", () => {
    const empty = buildStaffRegister(state([]), "f1", REG);
    expect(empty.kpis.turnover).toBe(0);
    expect(empty.kpis.avgSeniorityYears).toBe(0);
  });
});

describe("constats de non-conformité", () => {
  it("un non-immatriculé hors délai produit un constat critique chiffré", () => {
    const r = buildStaffRegister(state([emp({ hire_date: "2026-01-01" })]), "f1", REG);
    const f = r.findings.find((x) => x.title.includes("non immatriculé"));
    expect(f?.severity).toBe("critical");
    expect(f?.exposure).toBeGreaterThan(0);
    expect(f?.legal).toContain("1-72-184");
  });

  it("le régime dérogatoire n'est PAS compté comme conforme", () => {
    const r = buildStaffRegister(state([emp({ contract_type: "Stagiaire" })]), "f1", REG);
    const f = r.findings.find((x) => x.title.includes("à confirmer"));
    expect(f).toBeDefined();
    expect(f?.exposure).toBe(0);
  });

  it("une sortie sans motif bloque le certificat de travail (art. 24)", () => {
    const r = buildStaffRegister(
      state([emp({ cnss_number: "1", exit_date: "2026-03-01", is_active: false })]),
      "f1",
      REG,
    );
    const f = r.findings.find((x) => x.title.includes("sans motif"));
    expect(f?.legal).toContain("art. 24");
  });

  it("les constats critiques passent devant les avertissements", () => {
    const r = buildStaffRegister(
      state([emp({ id: "a", contract_type: "Stagiaire" }), emp({ id: "b", hire_date: "2026-01-01" })]),
      "f1",
      REG,
    );
    expect(r.findings[0].severity).toBe("critical");
  });

  it("aucun constat pour un dossier complet et déclaré", () => {
    const r = buildStaffRegister(
      state([emp({ cnss_number: "9829609", cin: "JA189826", birth_date: "1990-01-01" })]),
      "f1",
      REG,
    );
    expect(r.findings).toHaveLength(0);
  });
});

describe("filtres", () => {
  const s = state([
    emp({ id: "a", contract_type: "CDI", cnss_number: "1" }),
    emp({ id: "b", contract_type: "CDD", hire_date: "2026-01-01" }),
  ]);

  it("filtre par catégorie", () => {
    expect(buildStaffRegister(s, "f1", { ...REG, category: "CDD" }).rows).toHaveLength(1);
  });

  it("filtre par statut de déclaration", () => {
    const r = buildStaffRegister(s, "f1", { ...REG, declaration: "hors_delai" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].category).toBe("CDD");
  });
});

describe("présence à la date d'arrêté", () => {
  it("une sortie POSTÉRIEURE à l'arrêté laisse le salarié dans l'effectif (préavis, CDD à échoir)", () => {
    // Défaut historique : compter « absence de date de sortie » sortait à tort de l'effectif
    // tout salarié dont le départ était seulement planifié.
    const r = buildStaffRegister(
      state([emp({ cnss_number: "1", exit_date: "2026-12-31", exit_reason: "fin_cdd" })]),
      "f1",
      REG, // arrêté au 31/07/2026
    );
    expect(r.rows[0].present).toBe(true);
    expect(r.kpis.headcount).toBe(1);
  });

  it("une sortie antérieure à l'arrêté retire le salarié de l'effectif", () => {
    const r = buildStaffRegister(
      state([emp({ cnss_number: "1", exit_date: "2026-03-01", exit_reason: "demission", is_active: false })]),
      "f1",
      REG,
    );
    expect(r.rows[0].present).toBe(false);
    expect(r.kpis.headcount).toBe(0);
  });

  it("une sortie planifiée au-delà de l'arrêté n'est pas comptée comme sortie de la période", () => {
    const r = buildStaffRegister(
      state([emp({ cnss_number: "1", exit_date: "2026-12-31", exit_reason: "fin_cdd" })]),
      "f1",
      REG,
    );
    expect(r.kpis.exits).toBe(0);
  });
});

describe("buildMovements — chronologie", () => {
  const s = state([
    emp({ id: "a", hire_date: "2026-02-10", cnss_number: "1" }),
    emp({ id: "b", hire_date: "2026-02-20" }),
    emp({ id: "c", hire_date: "2025-01-01", exit_date: "2026-04-05", exit_reason: "demission", is_active: false }),
  ]);
  const months = buildMovements(buildStaffRegister(s, "f1", REG));

  it("groupe les mouvements par mois, dans l'ordre", () => {
    expect(months.map((m) => m.month)).toEqual(["2026-02", "2026-04"]);
  });

  it("compte entrées, sorties et solde de chaque mois", () => {
    expect(months[0]).toMatchObject({ entries: 2, exits: 0, net: 2 });
    expect(months[1]).toMatchObject({ entries: 0, exits: 1, net: -1 });
  });

  it("porte le statut de déclaration : une entrée non déclarée se voit dès la chronologie", () => {
    const feb = months[0].movements;
    expect(feb.find((m) => m.nom.includes("ALAOUI"))).toBeDefined();
    expect(feb.some((m) => m.declaration === "hors_delai")).toBe(true);
  });

  it("nomme explicitement une sortie sans motif plutôt que de laisser un vide", () => {
    const m = buildMovements(
      buildStaffRegister(state([emp({ cnss_number: "1", exit_date: "2026-04-05", is_active: false })]), "f1", REG),
    );
    const sortie = m.flatMap((x) => x.movements).find((x) => x.kind === "sortie");
    expect(sortie?.reason).toBe("Motif non renseigné");
  });

  it("un salarié entré ET sorti sur la période produit DEUX mouvements distincts", () => {
    const m = buildMovements(
      buildStaffRegister(
        state([emp({ cnss_number: "1", hire_date: "2026-01-10", exit_date: "2026-04-05", exit_reason: "demission", is_active: false })]),
        "f1",
        REG,
      ),
    );
    const kinds = m.flatMap((x) => x.movements).map((x) => x.kind);
    expect(kinds).toEqual(["entree", "sortie"]);
  });

  it("ne produit aucun mois sur une période sans mouvement", () => {
    expect(buildMovements(buildStaffRegister(state([]), "f1", REG))).toEqual([]);
  });
});

describe("legalRegisters — état honnête des obligations", () => {
  const base = legalRegisters(buildStaffRegister(state([emp({ cnss_number: "1", cin: "A" })]), "f1", REG));

  it("déclare le livre de paie NON COUVERT — les bulletins n'en tiennent pas lieu", () => {
    const lp = base.find((x) => x.key === "livre_paie");
    expect(lp?.coverage).toBe("non_couvert");
    expect(lp?.legal).toContain("371");
    expect(lp?.detail).toContain("PAS le livre");
  });

  it("rappelle la conservation de 2 ans (art. 373)", () => {
    expect(base.find((x) => x.key === "livre_paie")?.legal).toContain("373");
  });

  it("déclare le registre des congés seulement partiel", () => {
    expect(base.find((x) => x.key === "registre_conges")?.coverage).toBe("partiel");
  });

  it("dit que le registre des mouvements ne repose sur aucune obligation autonome", () => {
    const rm = base.find((x) => x.key === "registre_mouvements");
    expect(rm?.requirement).toContain("registre unique du personnel");
    expect(rm?.legal).toContain("Aucune obligation autonome");
  });

  it("bascule le certificat de travail en « partiel » dès qu'une sortie n'a pas de motif", () => {
    const l = legalRegisters(
      buildStaffRegister(state([emp({ cnss_number: "1", cin: "A", exit_date: "2026-03-01", is_active: false })]), "f1", REG),
    );
    expect(l.find((x) => x.key === "certificat_travail")?.coverage).toBe("partiel");
  });

  it("bascule la CNSS en « partiel » dès qu'un salarié est hors délai", () => {
    const l = legalRegisters(buildStaffRegister(state([emp({ hire_date: "2026-01-01" })]), "f1", REG));
    expect(l.find((x) => x.key === "cnss")?.coverage).toBe("partiel");
  });

  it("chaque obligation porte une base légale non vide", () => {
    for (const x of base) expect(x.legal.length).toBeGreaterThan(10);
  });
});

describe("garde-fous du document", () => {
  it("aucune donnée sensible dans une ligne : ni salaire, ni RIB", () => {
    const r = buildStaffRegister(state([emp({ bank_rib: "0112345", base_hourly_rate: 42 })]), "f1", REG);
    const keys = Object.keys(r.rows[0]).join(" ").toLowerCase();
    expect(keys).not.toContain("rib");
    expect(keys).not.toContain("salaire");
    expect(keys).not.toContain("rate");
    expect(JSON.stringify(r.rows[0])).not.toContain("0112345");
  });

  it("le registre affirme explicitement qu'il ne remplace aucun registre légal", () => {
    expect(REGISTER_DISCLAIMER).toContain("NE SE SUBSTITUE PAS");
    expect(REGISTER_DISCLAIMER).toContain("371");
    expect(REGISTER_DISCLAIMER).toContain("246");
  });

  it("la mention de source des délais accompagne le registre", () => {
    const r = buildStaffRegister(state([emp({})]), "f1", REG);
    expect(r.sourceNote).toContain("à confirmer");
  });

  it("la date d'arrêté est celle demandée, jamais la date du jour", () => {
    const r = buildStaffRegister(state([emp({})]), "f1", REG);
    expect(r.asOf).toBe("2026-07-31");
  });
});
