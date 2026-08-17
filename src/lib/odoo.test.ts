import { describe, it, expect } from "vitest";
import { IMPORT_ELEMENTS, importUpdateFields } from "./odoo";

describe("odoo — import « à la carte » (choix des éléments)", () => {
  it("importUpdateFields = union des champs des éléments cochés (pilote la mise à jour)", () => {
    expect(importUpdateFields(["identite"])).toEqual(["first_name", "last_name"]);
    expect(importUpdateFields(["salaire"])).toEqual(["base_hourly_rate", "monthly_hours"]);
    expect(importUpdateFields(["cnss", "poste"])).toEqual(["cnss_number", "position", "site"]);
    expect(importUpdateFields(["situation"])).toEqual(["marital_status", "dependents"]);
    // Aucun élément coché → aucun champ écrit (sécurité : on ne touche à rien).
    expect(importUpdateFields([])).toEqual([]);
  });

  it("chaque élément mappe des champs Employee réels et non vides", () => {
    for (const el of IMPORT_ELEMENTS) {
      expect(el.fields.length).toBeGreaterThan(0);
      expect(el.label.length).toBeGreaterThan(0);
    }
    // « identite » (nom) est présent — clé de création/appariement.
    expect(IMPORT_ELEMENTS.find((el) => el.key === "identite")?.fields).toEqual(["first_name", "last_name"]);
    // Les éléments sensibles attendus existent.
    const keys = IMPORT_ELEMENTS.map((el) => el.key);
    expect(keys).toEqual(
      expect.arrayContaining(["identite", "matricule", "cin", "cnss", "poste", "salaire", "naissance", "situation", "contact", "contrat"]),
    );
  });

  it("un champ n'est jamais dupliqué même si deux éléments le partageraient", () => {
    const fields = importUpdateFields(IMPORT_ELEMENTS.map((el) => el.key));
    expect(new Set(fields).size).toBe(fields.length);
  });
});
