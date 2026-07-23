import { describe, it, expect } from "vitest";
import { extractComptes, buildRegularisationDossier, type AuditReport } from "./audit-engine";

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
    expect(md).toContain("Comptes PCGE : 4441");
    expect(md).toContain("odoo-correction-anomalies");
  });
});
