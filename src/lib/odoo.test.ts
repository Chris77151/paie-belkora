import { describe, it, expect } from "vitest";
import { pickUserGroupsField } from "./odoo";

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
