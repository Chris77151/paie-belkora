import { describe, it, expect } from "vitest";
import {
  maskRib, fingerprint, ribFingerprint, isLegacyFingerprint, newAuditSalt,
  withFingerprints, buildBaseline, buildAuditEvents, FP_V2_PREFIX,
} from "./bank-audit";
import type { OdooBankRecord } from "./odoo";

const RIB = "MA64 0111 0000 0012 3456 7890 12";
const SALT = "a".repeat(64);

const rec = (over: Partial<OdooBankRecord> = {}): OdooBankRecord => ({
  odoo_bank_id: 1, acc_number: RIB, partner: "Fournisseur X", partner_kind: "fournisseur",
  actor_name: "N", actor_login: "n@x.ma", actor_authorized: true, on_payment: true,
  when: "2026-06-10T10:00:00", ...over,
});

describe("empreinte RIB — qualité cryptographique", () => {
  it("v2 : préfixe + HMAC-SHA-256 (256 bits = 64 hex)", async () => {
    const fp = await ribFingerprint(RIB, SALT);
    expect(fp.startsWith(FP_V2_PREFIX)).toBe(true);
    expect(fp.slice(FP_V2_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("déterministe, et insensible au formatage (espaces / casse)", async () => {
    const a = await ribFingerprint(RIB, SALT);
    const b = await ribFingerprint("ma6401110000001234567890 12", SALT);
    expect(a).toBe(b);
  });

  it("SALÉE : le même RIB donne une empreinte différente avec un autre sel", async () => {
    const a = await ribFingerprint(RIB, SALT);
    const b = await ribFingerprint(RIB, "b".repeat(64));
    expect(a).not.toBe(b);
  });

  it("un RIB différent donne une empreinte différente", async () => {
    const a = await ribFingerprint(RIB, SALT);
    const b = await ribFingerprint("MA64 0111 0000 0012 3456 7890 99", SALT);
    expect(a).not.toBe(b);
  });

  it("l'empreinte ne laisse pas fuiter le RIB (aucun fragment en clair)", async () => {
    const fp = await ribFingerprint(RIB, SALT);
    expect(fp).not.toContain("123456");
    expect(fp).not.toContain("7890");
  });

  it("newAuditSalt : 256 bits aléatoires, non répétés", () => {
    const s1 = newAuditSalt();
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    expect(s1).not.toBe(newAuditSalt());
  });

  it("isLegacyFingerprint distingue l'ancien format du v2", async () => {
    expect(isLegacyFingerprint(fingerprint(RIB))).toBe(true);
    expect(isLegacyFingerprint(await ribFingerprint(RIB, SALT))).toBe(false);
  });
});

describe("masquage — le RIB complet n'est jamais exposé", () => {
  it("ne garde que les 4 derniers caractères", () => {
    const m = maskRib(RIB)!;
    expect(m).toBe("****9012");
    expect(m).not.toContain("123456");
  });
});

describe("détection d'écart — rétro-compatibilité des bases de référence", () => {
  it("base V2 + RIB inchangé → aucun événement", async () => {
    const records = await withFingerprints([rec()], SALT);
    const base = buildBaseline("f1", records, "app:super_admin", "2026-06-01T00:00:00Z");
    expect(base[0].fingerprint.startsWith(FP_V2_PREFIX)).toBe(true);
    expect(buildAuditEvents("f1", records, base, "2026-06-30T00:00:00Z")).toHaveLength(0);
  });

  it("base V2 + RIB modifié → événement détecté", async () => {
    const base = buildBaseline("f1", await withFingerprints([rec()], SALT), "app", "2026-06-01T00:00:00Z");
    const changed = await withFingerprints([rec({ acc_number: "MA64 0111 0000 0012 3456 7890 99" })], SALT);
    const evts = buildAuditEvents("f1", changed, base, "2026-06-30T00:00:00Z");
    expect(evts).toHaveLength(1);
    expect(evts[0].rib_after_masked).toBe("****9099"); // 4 derniers du RIB modifié
    expect(evts[0].rib_before_masked).toBe("****9012"); // 4 derniers de l'ancien
  });

  it("base HÉRITÉE + RIB inchangé → aucun faux « RIB modifié » après migration", async () => {
    // Base créée avant la v2 (empreinte djb2), comparée à des enregistrements portant une v2.
    const legacyBase = buildBaseline("f1", [rec()], "app", "2026-01-01T00:00:00Z"); // sans acc_fingerprint
    expect(isLegacyFingerprint(legacyBase[0].fingerprint)).toBe(true);
    const records = await withFingerprints([rec()], SALT);
    expect(buildAuditEvents("f1", records, legacyBase, "2026-06-30T00:00:00Z")).toHaveLength(0);
  });
});
