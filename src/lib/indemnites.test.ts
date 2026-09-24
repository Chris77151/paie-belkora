import { describe, expect, it } from "vitest";
import { capOf, describeCap, splitIndemnites, totals, type CapContext } from "./indemnites";
import { getParams, INDEMNITES_BAREME_2025_10, type IndemniteKey } from "./params";
import { computePayslip, type PayrollInput } from "./payroll-engine";

const p = getParams(2026);
const S = p.smigHourly; // 17,92 DH en 2026
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const CTX: CapContext = {
  smigHourly: S, daysWorked: 26, salaireBase: 5000, brutRef: 5000, km: 0, kmMutation: 0,
  transportOutsideUrban: false, voitureService: "aucune", voitureJustifiee: false,
};
const split = (a: Partial<Record<IndemniteKey, number>>, ctx: Partial<CapContext> = {}, ytd = {}) =>
  splitIndemnites(a, INDEMNITES_BAREME_2025_10, { ...CTX, ...ctx }, p, ytd);
const line = (lines: ReturnType<typeof split>, k: IndemniteKey) => lines.find((l) => l.key === k)!;

/* ------------------------------------------------------------------ barème ------------------------------------------------------------------ */

describe("barème — intégrité", () => {
  it("n'a aucune clé en double", () => {
    const keys = INDEMNITES_BAREME_2025_10.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rattache CHAQUE plafond à ses deux textes officiels — BO 7443 pour la CNSS, note DGI 2017 pour l'IR", () => {
    for (const d of INDEMNITES_BAREME_2025_10) {
      expect(d.source, d.key).toMatch(/BO 7443/);
      expect(d.source, d.key).toMatch(/note DGI 2017/);
      expect(d.condition.length, d.key).toBeGreaterThan(10);
    }
  });

  it("n'admet AUCUN plafond infini — une exonération sans limite est un trou dans l'assiette", () => {
    for (const d of INDEMNITES_BAREME_2025_10) {
      for (const rule of [d.ir, d.cnss]) {
        const cap = capOf(rule, { ...CTX, km: 100, kmMutation: 100, voitureService: "retour_quotidien" }, p, 0, 1000);
        expect(Number.isFinite(cap), `${d.key} ${rule.kind}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ plafonds CNSS indexés sur le SMIG ------------------------------------------------------------------ */

describe("CNSS — plafonds en multiples du SMIG horaire par 26 jours (BO 7443, titre VII)", () => {
  it("caisse 14 x SMIG, lait 11 x SMIG, outillage 7 x SMIG — mois complet de 26 jours", () => {
    const l = split({ caisse: 900, lait: 900, outillage: 900 });
    expect(line(l, "caisse").exoCnss).toBe(r2(14 * S));    // 250,88
    expect(line(l, "lait").exoCnss).toBe(r2(11 * S));      // 197,12
    expect(line(l, "outillage").exoCnss).toBe(r2(7 * S));  // 125,44
  });

  it("proratise au nombre de jours travaillés — « pour chaque 26 jours de travail »", () => {
    expect(line(split({ caisse: 900 }, { daysWorked: 13 }), "caisse").exoCnss).toBe(r2((14 * S * 13) / 26));
  });

  it("salissure et usure de vêtements sont UN seul élément : plafond commun de 14 x SMIG", () => {
    const l = split({ salissure: 200, usure_vetements: 200 });
    const total = r2(line(l, "salissure").exoCnss + line(l, "usure_vetements").exoCnss);
    expect(total).toBe(r2(14 * S));
    expect(line(l, "salissure").exoCnss).toBe(200);
    expect(line(l, "usure_vetements").exoCnss).toBe(r2(14 * S - 200));
  });
});

/* ------------------------------------------------------------------ plafonds IR ------------------------------------------------------------------ */

describe("IR — plafonds de la note DGI du 13 mars 2017", () => {
  it("caisse : 190 DH par mois, NON indexé", () => {
    expect(line(split({ caisse: 900 }), "caisse").exoIr).toBe(190);
  });

  it("lait 150, outillage 100, salissure 210 — montants NOMINAUX de la note, non revalorisés", () => {
    const l = split({ lait: 900, outillage: 900, salissure: 900 });
    expect(line(l, "lait").exoIr).toBe(150);
    expect(line(l, "outillage").exoIr).toBe(100);
    expect(line(l, "salissure").exoIr).toBe(210);
  });

  it("les plafonds IR ne bougent PAS avec le SMIG — seule la DGI peut les revaloriser", () => {
    // La note porte « (*) montant indexé au SMIG horaire », mais aucun montant revalorisé n'a été
    // publié : les indexer nous-mêmes exonérerait au-delà de ce que l'administration a fixé.
    const smig2030 = split({ lait: 900, caisse: 900, outillage: 900 }, { smigHourly: 25 });
    expect(line(smig2030, "lait").exoIr).toBe(150);
    expect(line(smig2030, "caisse").exoIr).toBe(190);
    expect(line(smig2030, "outillage").exoIr).toBe(100);
    // Les plafonds CNSS, eux, suivent le SMIG : ils sont écrits en multiples dans l'arrêté.
    expect(line(smig2030, "lait").exoCnss).toBe(r2(11 * 25));
  });

  it("l'IR et la CNSS n'exonèrent donc pas la même part d'une même indemnité de caisse", () => {
    const c = line(split({ caisse: 300 }), "caisse");
    expect(c.exoIr).toBe(190);
    expect(c.exoCnss).toBe(r2(14 * S));
  });

  it("panier : 2 x SMIG horaire par jour — la borne des 20 % est celle des titres, pas du panier", () => {
    // Même sur un petit salaire, le panier n'est plafonné qu'à 2 x SMIG x jours dans les deux régimes.
    const l = split({ panier: 5000 }, { brutRef: 3000 });
    expect(line(l, "panier").exoIr).toBe(r2(2 * S * 26));
    expect(line(l, "panier").exoCnss).toBe(r2(2 * S * 26));
  });

  it("titres-restaurant : 20 DH par jour et 20 % du brut imposable", () => {
    expect(line(split({ titres_restaurant: 5000 }, { daysWorked: 20 }), "titres_restaurant").exoIr).toBe(400);
    expect(line(split({ titres_restaurant: 5000 }, { daysWorked: 26, brutRef: 2000 }), "titres_restaurant").exoIr).toBe(400);
  });
});

/* ------------------------------------------------------------------ plafonds communs ------------------------------------------------------------------ */

describe("plafonds identiques dans les deux régimes", () => {
  it("représentation : 10 % du salaire de base", () => {
    const l = line(split({ representation: 2000 }, { salaireBase: 8000 }), "representation");
    expect([l.exoIr, l.exoCnss]).toEqual([800, 800]);
  });

  it("déplacement forfaitaire : 100 % du salaire de base, sans dépasser 5 000 DH", () => {
    expect(line(split({ deplacement: 9000 }, { salaireBase: 3000 }), "deplacement").exoCnss).toBe(3000);
    expect(line(split({ deplacement: 9000 }, { salaireBase: 7000 }), "deplacement").exoCnss).toBe(5000);
  });

  it("kilométrique : 3 DH par km déclaré — sans kilométrage, rien n'est exonéré", () => {
    expect(line(split({ kilometrique: 900 }, { km: 200 }), "kilometrique").exoIr).toBe(600);
    expect(line(split({ kilometrique: 900 }, { km: 0 }), "kilometrique").exoIr).toBe(0);
  });

  it("mutation : 10 DH par km entre l'ancien et le nouveau lieu d'habitation", () => {
    const l = line(split({ mutation: 5000 }, { kmMutation: 320 }), "mutation");
    expect([l.exoIr, l.exoCnss]).toEqual([3200, 3200]);
  });

  it("prime de tournée : 1 500 DH", () => {
    const l = line(split({ tournee: 2000 }), "tournee");
    expect([l.exoIr, l.exoCnss]).toEqual([1500, 1500]);
  });

  it("transport : 500 en ville, 750 hors périmètre urbain", () => {
    expect(line(split({ transport: 900 }), "transport").exoIr).toBe(500);
    expect(line(split({ transport: 900 }, { transportOutsideUrban: true }), "transport").exoIr).toBe(750);
  });
});

/* ------------------------------------------------------------------ non-cumuls ------------------------------------------------------------------ */

describe("non-cumuls prévus par les textes", () => {
  it("panier et titres-restaurant ne se cumulent PAS : le panier perd son exonération", () => {
    const l = split({ panier: 300, titres_restaurant: 300 });
    expect(line(l, "panier").exoIr).toBe(0);
    expect(line(l, "panier").exoCnss).toBe(0);
    expect(line(l, "panier").exclusion?.cnss).toMatch(/titres-restaurant/);
    // Les titres, eux, restent exonérés.
    expect(line(l, "titres_restaurant").exoCnss).toBe(300);
  });

  it("une voiture de service fait tomber transport et kilométrique, dans les DEUX régimes", () => {
    const l = split({ transport: 400, kilometrique: 300 }, { km: 100, voitureService: "retour_quotidien" });
    for (const k of ["transport", "kilometrique"] as const) {
      expect(line(l, k).exoIr, k).toBe(0);
      expect(line(l, k).exoCnss, k).toBe(0);
    }
  });

  it("la prime de tournée ne tombe avec la voiture que côté CNSS — c'est là que le texte l'écrit", () => {
    const t = line(split({ tournee: 1000 }, { voitureService: "permanente", voitureJustifiee: true }), "tournee");
    expect(t.exoCnss).toBe(0);
    expect(t.exoIr).toBe(1000);
  });
});

/* ------------------------------------------------------------------ voiture de service ------------------------------------------------------------------ */

describe("voiture de service — avantage en nature (BO 7443 él. 5 ; note DGI 2017)", () => {
  it("rapportée chaque soir : l'avantage est exonéré", () => {
    const v = line(split({ voiture_service: 800 }, { voitureService: "retour_quotidien" }), "voiture_service");
    expect([v.exoIr, v.exoCnss]).toEqual([800, 800]);
  });

  it("laissée en permanence ET justifiée (cadre dirigeant ou lettre d'affectation) : exonérée", () => {
    const v = line(split({ voiture_service: 800 }, { voitureService: "permanente", voitureJustifiee: true }), "voiture_service");
    expect([v.exoIr, v.exoCnss]).toEqual([800, 800]);
  });

  it("laissée en permanence SANS justification : l'avantage est intégralement soumis", () => {
    const v = line(split({ voiture_service: 800 }, { voitureService: "permanente", voitureJustifiee: false }), "voiture_service");
    expect([v.exoIr, v.exoCnss]).toEqual([0, 0]);
  });
});

/* ------------------------------------------------------------------ plafond annuel ------------------------------------------------------------------ */

describe("gratifications sociales — plafond ANNUEL, différent selon le régime", () => {
  it("CNSS 5 000 DH/an, IR 2 500 DH/an", () => {
    const g = line(split({ gratification_sociale: 4000 }), "gratification_sociale");
    expect([g.exoIr, g.exoCnss]).toEqual([2500, 4000]);
  });

  it("le plafond se CONSOMME d'un mois sur l'autre", () => {
    const g = line(split({ gratification_sociale: 3000 }, {}, { cnss: { gratification_sociale: 4000 }, ir: { gratification_sociale: 2500 } }), "gratification_sociale");
    expect([g.exoIr, g.exoCnss]).toEqual([0, 1000]);
  });
});

describe("ne rend jamais une part exonérée supérieure au montant versé", () => {
  it("quel que soit le plafond", () => {
    for (const l of split({ lait: 40, caisse: 10, representation: 1, panier: 5, voiture_service: 3 }, { voitureService: "retour_quotidien" })) {
      expect(l.exoIr).toBeLessThanOrEqual(l.montant);
      expect(l.exoCnss).toBeLessThanOrEqual(l.montant);
    }
  });
});

/* ------------------------------------------------------------------ moteur ------------------------------------------------------------------ */

const base = (o: Partial<PayrollInput> = {}): PayrollInput => ({
  year: 2026, month: 3, regime: "SMIG", hireDate: "2024-01-01", dependents: 0,
  hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
  panier: 0, transport: 0, salissure: 0, otherGross: 0, ...o,
});

describe("moteur — deux assiettes distinctes", () => {
  it("sans divergence de barème, l'assiette CNSS égale le SBI (aucune régression)", () => {
    const r = computePayslip(base({ panier: 500, transport: 300 }));
    expect(r.assietteCnss).toBe(r.sbi);
  });

  it("une indemnité de caisse de 300 DH sépare les deux assiettes", () => {
    const r = computePayslip(base({ indemnites: { caisse: 300 } }));
    expect(r.indemnitesExonerees).toBe(190);
    expect(r.indemnitesExonereesCnss).toBe(r2(14 * S));
    expect(r2(r.sbi - r.assietteCnss)).toBe(r2(14 * S - 190));
  });

  it("calcule les cotisations sur l'assiette SOCIALE et l'IR sur l'assiette FISCALE", () => {
    const r = computePayslip(base({ indemnites: { gratification_sociale: 4000 } }));
    const q = getParams(2026);
    expect(r.amoSalarie).toBe(r2(r.assietteCnss * q.amoEmployeeRate));
    expect(r.employerDetail.sbiBase).toBe(r.assietteCnss);
    expect(r.sni).toBe(r2(r.sbi - r.fraisPro - r.cnssSalarie - r.amoSalarie));
  });

  it("l'avantage voiture entre dans le brut, exonéré seulement s'il est justifié", () => {
    const ok = computePayslip(base({ voitureService: "permanente", voitureJustifiee: true, avantageVoiture: 800 }));
    const ko = computePayslip(base({ voitureService: "permanente", voitureJustifiee: false, avantageVoiture: 800 }));
    expect(ok.salaireBrut).toBe(ko.salaireBrut);
    expect(r2(ko.sbi - ok.sbi)).toBe(800);
  });

  it("les champs historiques priment sur le dictionnaire pour leur propre clé", () => {
    const r = computePayslip(base({ lait: 100, indemnites: { lait: 999 } }));
    expect(r.indemnitesDetail.find((l) => l.key === "lait")!.montant).toBe(100);
  });

  it("détaille chaque indemnité versée, et elle seule", () => {
    const r = computePayslip(base({ panier: 200, indemnites: { caisse: 300 } }));
    expect(r.indemnitesDetail.map((l) => l.key).sort()).toEqual(["caisse", "panier"]);
    expect(totals(r.indemnitesDetail).exoIr).toBe(r.indemnitesExonerees);
  });
});

describe("stage d'insertion — exonération bornée entre 1 600 et 6 000 DH (BO 7443, titre VI él. 24)", () => {
  it("dans les bornes : aucune cotisation", () => {
    const r = computePayslip(base({ hourlyRate: 25, cnssExemption: "totale" })); // ~5 014 DH, ancienneté comprise
    expect(r.cnssSalarie + r.amoSalarie + r.chargesPatronales).toBe(0);
  });

  it("au-delà de 6 000 DH : l'indemnité devient soumise EN TOTALITÉ", () => {
    const r = computePayslip(base({ hourlyRate: 40, cnssExemption: "totale" })); // ~7 640 DH
    expect(r.salaireBrut).toBeGreaterThan(6000);
    expect(r.cnssSalarie).toBeGreaterThan(0);
    expect(r.chargesPatronales).toBeGreaterThan(0);
  });

  it("le seuil porte sur l'indemnité de stage, HORS panier et transport exonérés à part", () => {
    // ~5 014 DH d'indemnité + 1 000 de panier + 500 de transport : brut > 6 000, mais une fois ôtés
    // le panier (931,84) et le transport (500) exonérés à part, l'indemnité de stage reste < 6 000.
    const r = computePayslip(base({ hourlyRate: 25, panier: 1000, transport: 500, cnssExemption: "totale" }));
    expect(r.salaireBrut).toBeGreaterThan(6000);
    expect(r.cnssSalarie + r.chargesPatronales).toBe(0);
  });

  it("aucune borne basse : un stagiaire étudiant payé 1 000 DH reste exonéré", () => {
    const r = computePayslip(base({ hourlyRate: 5.24, cnssExemption: "totale" })); // ~1 000 DH
    expect(r.salaireBrut).toBeLessThan(1600);
    expect(r.cnssSalarie + r.chargesPatronales).toBe(0);
  });
});

describe("describeCap", () => {
  it("formule chaque plafond lisiblement", () => {
    expect(describeCap({ kind: "fixe_mois", amount: 150 }, S)).toMatch(/150.*mois/);
    expect(describeCap({ kind: "pct_base", rate: 0.1 }, S)).toMatch(/10 %/);
    expect(describeCap({ kind: "par_km", rate: 3, kmField: "km_professionnels" }, S)).toMatch(/km/);
    expect(describeCap({ kind: "smig_26j", factor: 14 }, S)).toMatch(/26 jours/);
  });
});
