import { describe, it, expect } from "vitest";
import { pickUserGroupsField, syncDiffers } from "./odoo";

/**
 * Odoo a renommé le champ « groupes » de res.users : `groups_id` (≤ 18) → `group_ids` (≥ 19).
 * Lire le mauvais nom fait échouer tout l'audit RIB avec
 * « Invalid field 'groups_id' on 'res.users' ».
 */
describe("pickUserGroupsField — compatibilité de version Odoo", () => {
  it("Odoo ≥ 19 : renvoie « group_ids »", () => {
    expect(pickUserGroupsField({ group_ids: { type: "many2many" } })).toBe("group_ids");
  });

  it("Odoo ≤ 18 : renvoie « groups_id »", () => {
    expect(pickUserGroupsField({ groups_id: { type: "many2many" } })).toBe("groups_id");
  });

  it("les deux présents : préfère le nom moderne « group_ids »", () => {
    expect(pickUserGroupsField({ groups_id: {}, group_ids: {} })).toBe("group_ids");
  });

  it("indéterminable → null (on dégrade au lieu d'échouer)", () => {
    expect(pickUserGroupsField({})).toBeNull();
    expect(pickUserGroupsField(null)).toBeNull();
    expect(pickUserGroupsField(undefined)).toBeNull();
    expect(pickUserGroupsField("erreur")).toBeNull();
    expect(pickUserGroupsField({ autre_champ: {} })).toBeNull();
  });
});

describe("syncDiffers — détection de divergence app ↔ Odoo (l'app fait foi)", () => {
  it("texte : divergence détectée, insensible à la casse et aux espaces", () => {
    expect(syncDiffers("job_title", "Ouvrier", "Technicienne horticole")).toBe(true);
    expect(syncDiffers("job_title", "  technicienne  horticole ", "Technicienne  horticole")).toBe(false);
    expect(syncDiffers("job_title", "TECHNICIENNE", "technicienne")).toBe(false);
  });
  it("texte : une valeur Odoo vide/false diverge de toute valeur app non vide", () => {
    expect(syncDiffers("mobile_phone", false, "+212 6 00 00 00 00")).toBe(true);
    expect(syncDiffers("private_street", "", "Route de l'Ourika")).toBe(true);
  });
  it("nombre : comparaison arrondie au centime", () => {
    expect(syncDiffers("wage", 3422.72, 3422.72)).toBe(false);
    expect(syncDiffers("wage", 3422.72, 3500)).toBe(true);
    expect(syncDiffers("children", 2, 2)).toBe(false);
    expect(syncDiffers("children", 1, 3)).toBe(true);
  });
  it("nombre : valeur Odoo non numérique/false → divergence (l'app pousse sa valeur)", () => {
    expect(syncDiffers("wage", false, 3422.72)).toBe(true);
    expect(syncDiffers("children", false, 0)).toBe(true);
  });
});
