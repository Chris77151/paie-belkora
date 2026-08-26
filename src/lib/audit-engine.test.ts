import { describe, it, expect } from "vitest";
import {
  extractComptes, buildRegularisationDossier, mkEntry, odooFindings, findingRoute, withElements,
  type AuditReport, type AuditFinding,
} from "./audit-engine";
import type { OdooAccountingData } from "./odoo-accounting";

/** Données comptables Odoo minimales pour les tests (soldes fournis, reste neutre). */
function mkData(balances: { code: string; name: string; balance: number }[]): OdooAccountingData {
  return {
    year: 2026, totalDebit: 0, totalCredit: 0, postedMoves: 5, draftMoves: 0,
    journals: [], journalsWithPosted: new Set<number>(), balances,
    postedByType: [],
  } as unknown as OdooAccountingData;
}

describe("audit-engine — extraction des comptes PCGE (allowlist, zéro faux positif)", () => {
  it("extrait les comptes réellement cités", () => {
    const c = extractComptes(
      "Solde 4455 débiteur ; 44525 IR retenu",
      "Reclasser en 4457 et lettrer le 4441",
      "Grand livre 6171",
    );
    expect(c).toEqual(["4441", "44525", "4455", "4457", "6171"]);
  });

  it("ne confond PAS une année (2026) ni un montant avec un compte", () => {
    const c = extractComptes("Écart de 4 135,52 DH sur l'exercice 2026 (base 39 187,82)", "", "");
    // 2026, 135, 52, 39, 187, 82 ne sont pas des comptes de l'allowlist.
    expect(c).toEqual([]);
  });

  it("gère le suffixe « x » et priorise le code le plus long (617411 avant 6174)", () => {
    expect(extractComptes("clients 342x créditeurs", "", "")).toEqual(["342"]);
    expect(extractComptes("cotisation patronale 617411", "", "")).toEqual(["617411"]);
    // 4455 present ; 445 (plus court) ne doit pas être ajouté en doublon.
    expect(extractComptes("TVA 4455 collectée", "", "")).toEqual(["4455"]);
  });
});

describe("audit-engine — dossier de régularisation", () => {
  const report: AuditReport = {
    synthese: "s",
    score_fiabilite: 80,
    scope: "Paie locale",
    constats: [
      {
        categorie_assertion: "soldes", assertion: "Existence", cycle: "dettes sociales", gravite: "critique",
        titre: "Salarié non immatriculé CNSS", detail: "d", recommandation: "Immatriculer",
        reference_normative: "CNSS", action_odoo: "hr.employee", comptes: ["4441"],
      },
    ],
  };

  it("produit un dossier Markdown structuré et sûr (proposition, pas d'écriture)", () => {
    const md = buildRegularisationDossier(report, "MBD SARL", "juin 2026");
    expect(md).toContain("# Dossier de régularisation — MBD SARL");
    expect(md).toContain("PROPOSITION de régularisation (non appliquée)");
    expect(md).toContain("Comptes concernés : 4441 — Caisses de sécurité sociale (CNSS)"); // comptes AVEC intitulé (guide)
    expect(md).toContain("Comment procéder :"); // marche à suivre toujours présente
    expect(md).toContain("odoo-correction-anomalies");
  });
});

describe("audit-engine — écritures de correction", () => {
  it("mkEntry calcule les totaux et l'équilibre (partie double)", () => {
    const e = mkEntry("OD", "test", [
      { compte: "6171", libelle: "x", debit: 100, credit: 0 },
      { compte: "4437", libelle: "y", debit: 0, credit: 100 },
    ]);
    expect(e.totalDebit).toBe(100);
    expect(e.totalCredit).toBe(100);
    expect(e.equilibre).toBe(true);
    expect(mkEntry("OD", "z", [{ compte: "6", libelle: "", debit: 100, credit: 0 }]).equilibre).toBe(false);
  });

  it("TVA due : écriture équilibrée créditant 4456 (TVA due, passif)", () => {
    // 4455 collectée = 1000 (compte créditeur → balance −1000) ; 3455 déductible = 300.
    const f = odooFindings(mkData([
      { code: "4455", name: "TVA collectée", balance: -1000 },
      { code: "3455", name: "TVA déductible", balance: 300 },
    ]));
    const tva = f.find((c) => c.titre.startsWith("TVA — rapprochement"));
    expect(tva?.correction?.ecriture).toBeTruthy();
    const e = tva!.correction!.ecriture!;
    expect(e.equilibre).toBe(true);
    const due = e.lignes.find((l) => l.compte === "4456");
    expect(due?.credit).toBe(700); // 1000 − 300
  });

  it("client au solde créditeur : reclassement en 4421 (avances reçues), équilibré", () => {
    const f = odooFindings(mkData([{ code: "3421", name: "Client X", balance: -500 }]));
    const cli = f.find((c) => c.titre.includes("compte(s) client au solde créditeur"));
    const e = cli!.correction!.ecriture!;
    expect(e.equilibre).toBe(true);
    expect(e.lignes.find((l) => l.compte === "3421")?.debit).toBe(500);
    expect(e.lignes.find((l) => l.compte === "4421")?.credit).toBe(500);
  });
});

describe("audit-engine — visibilité des comptes anormaux + lien de correction", () => {
  it("les comptes RÉELLEMENT anormaux (code + montant) sont attachés au constat (elementsAnormaux)", () => {
    // Compte de charge 6111 au solde CRÉDITEUR (anormal) — hors allowlist, invisible avant.
    const f = odooFindings(mkData([{ code: "6111", name: "Achats de marchandises", balance: -1234.5 }]));
    const ch = f.find((c) => c.titre.includes("charges au solde créditeur"))!;
    expect(ch.source).toBe("odoo");
    expect(ch.elementsAnormaux?.[0]).toMatchObject({ code: "6111", montant: -1234.5 });
    expect(ch.comptes).toContain("6111"); // le n° de compte anormal est désormais dans les comptes concernés
  });

  it("findingRoute mappe chaque constat de paie vers le bon volet de correction", () => {
    const mk = (titre: string, cycle: string): AuditFinding => ({
      categorie_assertion: "flux", assertion: "x", cycle, gravite: "moyen", titre,
      detail: "", recommandation: "", reference_normative: "", action_odoo: "", comptes: [],
    });
    expect(findingRoute(mk("2 salarié(s) sans CIN au dossier", "paie"))?.route).toBe("employees");
    expect(findingRoute(mk("ICE manquant", "presentation"))?.route).toBe("settings");
    expect(findingRoute(mk("Provision pour congés payés non constatée", "paie"))?.route).toBe("accounting");
    expect(findingRoute(mk("Rapprocher le solde 4441 avec le bordereau CNSS", "dettes sociales"))?.route).toBe("accounting");
  });

  it("withElements fusionne les codes anormaux dans comptes et conserve les montants", () => {
    const base: AuditFinding = {
      categorie_assertion: "flux", assertion: "x", cycle: "achats", gravite: "eleve", titre: "t",
      detail: "", recommandation: "", reference_normative: "", action_odoo: "", comptes: ["471"],
    };
    const out = withElements(base, [{ id: 9, code: "6111", name: "Achats", montant: -50 }]);
    expect(out.comptes).toEqual(["471", "6111"]);
    expect(out.elementsAnormaux).toHaveLength(1);
    expect(out.elementsAnormaux![0].id).toBe(9);
  });
});
