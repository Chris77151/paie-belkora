import { describe, it, expect } from "vitest";
import { IMPORT_ELEMENTS, importUpdateFields, matchOdooLeaves, type OdooLeaveBalance } from "./odoo";
import type { Employee } from "@/data/types";

const emp = (o: Partial<Employee>): Employee => ({
  id: "e", firm_id: "f", first_name: "A", last_name: "B",
  hire_date: "2020-01-01", contract_type: "CDI", base_hourly_rate: 20,
  monthly_hours: 191, dependents: 0, is_active: true, ...o,
});
const bal = (o: Partial<OdooLeaveBalance>): OdooLeaveBalance => ({ odoo_id: 1, allocated: 26, taken: 10, remaining: 16, ...o });

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

describe("odoo — appariement des soldes de congés (reconnaissance déterministe, sans OCR)", () => {
  it("apparie SANS _odoo_id : par matricule, CIN, CNSS puis nom", () => {
    const employees = [
      emp({ id: "byMat", matricule: "M1" }),
      emp({ id: "byCin", matricule: "", cin: "AB123" }),
      emp({ id: "byCnss", cnss_number: "9990" }),
      emp({ id: "byNom", first_name: "Ahmed", last_name: "Alaoui" }),
    ];
    const balances = [
      bal({ odoo_id: 11, matricule: "M1" }),
      bal({ odoo_id: 12, cin: "AB123" }),
      bal({ odoo_id: 13, cnss: "9990" }),
      bal({ odoo_id: 14, name: "Ahmed ALAOUI" }),
    ];
    const { matches, unmatched } = matchOdooLeaves(employees, balances);
    expect(unmatched).toHaveLength(0);
    const by = Object.fromEntries(matches.map((m) => [m.employee_id, m]));
    expect(by["byMat"].method).toBe("matricule");
    expect(by["byCin"].method).toBe("cin");
    expect(by["byCnss"].method).toBe("cnss");
    expect(by["byNom"].method).toBe("nom");
    expect(by["byNom"].confidence).toBe("faible"); // le nom est une clé faible
  });

  it("priorité au lien Odoo (_odoo_id) sur les autres clés", () => {
    const employees = [emp({ id: "e1", _odoo_id: 7, matricule: "M1" })];
    const balances = [bal({ odoo_id: 8, matricule: "M1" }), bal({ odoo_id: 7, matricule: "AUTRE" })];
    const { matches } = matchOdooLeaves(employees, balances);
    expect(matches[0].odoo_id).toBe(7);
    expect(matches[0].method).toBe("odoo_id");
  });

  it("un solde Odoo n'est apparié qu'une fois (anti-doublon) ; l'autre salarié reste non apparié", () => {
    const employees = [emp({ id: "a", matricule: "M1" }), emp({ id: "b", matricule: "M1" })];
    const { matches, unmatched } = matchOdooLeaves(employees, [bal({ odoo_id: 5, matricule: "M1" })]);
    expect(matches).toHaveLength(1);
    expect(unmatched.map((e) => e.id)).toEqual(["b"]);
  });

  it("aucune clé commune → non apparié (jamais deviné)", () => {
    const { matches, unmatched } = matchOdooLeaves([emp({ id: "x", matricule: "ZZ", first_name: "Zied", last_name: "Zahra" })], [bal({ odoo_id: 5, matricule: "M1", name: "Ahmed Alaoui" })]);
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });
});
