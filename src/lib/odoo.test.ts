import { describe, it, expect } from "vitest";
import { IMPORT_ELEMENTS, importUpdateFields, matchOdooLeaves, combineOdooLeave, odooRecordUrl, type OdooLeaveBalance } from "./odoo";
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

  it("apparie le nom même si Odoo inverse l'ordre des mots (« Fadwa Semlani » ↔ « SEMLANI Fadwa »)", () => {
    const employees = [emp({ id: "fadwa", matricule: "", first_name: "Fadwa", last_name: "Semlani" })];
    const { matches, unmatched } = matchOdooLeaves(employees, [bal({ odoo_id: 20, name: "SEMLANI Fadwa" })]);
    expect(unmatched).toHaveLength(0);
    expect(matches[0].odoo_id).toBe(20);
    expect(matches[0].method).toBe("nom");
    expect(matches[0].confidence).toBe("faible");
  });
});

describe("odoo — lien profond vers un enregistrement (correction directe)", () => {
  it("construit une URL /web# vers le compte, en normalisant la base et en fixant la société", () => {
    expect(odooRecordUrl("https://belkora.odoo.com/", "account.account", 42, 3))
      .toBe("https://belkora.odoo.com/web#id=42&model=account.account&view_type=form&cids=3");
    // suffixe /odoo retiré, pas de cids si société absente
    expect(odooRecordUrl("https://belkora.odoo.com/odoo", "account.account", 7))
      .toBe("https://belkora.odoo.com/web#id=7&model=account.account&view_type=form");
  });
});

describe("odoo — congés : « pris » depuis les hr.leave réels vs compteurs résumés", () => {
  it("la somme réelle des hr.leave PRIME sur allocation_used_count (capte le congé de 9 j manqué)", () => {
    // Fadwa : le compteur résumé hr.employee dit 0 pris ; hr.leave validé dit 9 j.
    const base = [bal({ odoo_id: 20, allocated: 18, taken: 0, remaining: 18, name: "Fadwa Semlani" })];
    const [r] = combineOdooLeave(base, new Map([[20, 9]]));
    expect(r.taken).toBe(9);        // le congé de 9 j apparaît enfin
    expect(r.allocated).toBe(18);   // l'alloué reste celui du compteur résumé (fiable)
    expect(r.remaining).toBe(9);    // 18 − 9
  });

  it("un salarié sans hr.leave = 0 pris (et non la valeur résumée) quand la requête a réussi", () => {
    const base = [bal({ odoo_id: 30, allocated: 26, taken: 12, remaining: 14 })];
    const [r] = combineOdooLeave(base, new Map()); // requête OK, aucun congé validé
    expect(r.taken).toBe(0);
    expect(r.allocated).toBe(26);   // alloué conservé
    expect(r.remaining).toBe(26);   // 26 − 0
  });

  it("repli sur le compteur résumé « pris » si la requête hr.leave échoue (Map = null)", () => {
    const base = [bal({ odoo_id: 40, allocated: 26, taken: 10, remaining: 16 })];
    const [r] = combineOdooLeave(base, null);
    expect(r.taken).toBe(10);       // compteur résumé
    expect(r.allocated).toBe(26);
    expect(r.remaining).toBe(16);
  });
});
