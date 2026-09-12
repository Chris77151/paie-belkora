import { describe, it, expect } from "vitest";
import {
  maskRib, fingerprint, ribFingerprint, isLegacyFingerprint, newAuditSalt,
  withFingerprints, buildBaseline, buildAuditEvents, FP_V2_PREFIX,
  classify, describeChange,
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

/* ==================================================================================
 * Détail des modifications — distinguer le bruit du signal SANS atténuer une fraude
 * ================================================================================== */

const AUTRE_RIB = "MA64 0111 0000 0099 8877 6655 44";

describe("compte re-créé sous un autre identifiant", () => {
  it("ne produit qu'UNE ligne « re-créé », ni supprimé ni nouveau", async () => {
    const before = await withFingerprints([rec({ odoo_bank_id: 1 })], SALT);
    const baseline = buildBaseline("f1", before, "admin", "2026-06-01T00:00:00Z");
    // Même RIB, identifiant Odoo différent : Odoo a re-créé l'enregistrement.
    const after = await withFingerprints([rec({ odoo_bank_id: 42 })], SALT);

    const ev = buildAuditEvents("f1", after, baseline, "2026-06-11T00:00:00Z");
    expect(ev).toHaveLength(1);
    expect(ev[0].classification).toBe("DEPLACE");
    expect(ev[0].severity).toBe("info");
    expect(ev[0].detail?.benign).toBe(true);
    expect(ev[0].detail?.previousBankId).toBe(1);
  });

  it("un VRAI changement de numéro sous un nouvel identifiant reste une alerte", async () => {
    const before = await withFingerprints([rec({ odoo_bank_id: 1 })], SALT);
    const baseline = buildBaseline("f1", before, "admin", "2026-06-01T00:00:00Z");
    const after = await withFingerprints([rec({ odoo_bank_id: 42, acc_number: AUTRE_RIB })], SALT);

    const ev = buildAuditEvents("f1", after, baseline, "2026-06-11T00:00:00Z");
    // Un nouveau compte + l'ancien réellement disparu : deux constats, aucun « bénin ».
    expect(ev.map((x) => x.classification).sort()).toEqual(["NOUVEAU", "SUPPRIME"]);
    expect(ev.some((x) => x.detail?.benign)).toBe(false);
  });
});

describe("classify — nuance sans complaisance", () => {
  const base = { isNew: false, isDeleted: false, partner_kind: "fournisseur" as const, validated: false, on_payment: false };

  it("un ajout par une personne habilitée, sans paiement rattaché, n'est pas « élevé »", () => {
    expect(classify({ ...base, isNew: true, actor_authorized: true }).severity).toBe("moyen");
  });

  it("mais un compte inconnu DÉJÀ utilisé sur un paiement le reste", () => {
    expect(classify({ ...base, isNew: true, actor_authorized: true, on_payment: true }).severity).toBe("eleve");
  });

  it("et un ajout par une personne non habilitée le reste aussi", () => {
    expect(classify({ ...base, isNew: true, actor_authorized: false }).severity).toBe("eleve");
  });

  it("une modification par une personne non habilitée sur un compte payé reste CRITIQUE", () => {
    const r = classify({ ...base, actor_authorized: false, on_payment: true });
    expect(r.classification).toBe("NON_AUTORISE");
    expect(r.severity).toBe("critique");
  });

  it("le déplacement prime sur tout le reste — le numéro est prouvé inchangé", () => {
    const r = classify({ ...base, isNew: true, isMoved: true, actor_authorized: false, on_payment: true });
    expect(r.classification).toBe("DEPLACE");
    expect(r.severity).toBe("info");
  });
});

describe("describeChange — l'indice rassurant n'atténue JAMAIS la gravité", () => {
  it("signale des 4 derniers caractères identiques sans rien déclasser", () => {
    const d = describeChange({
      classification: "NON_AUTORISE", partner_kind: "fournisseur",
      before: "****7890", after: "****7890",
      actor_authorized: false, on_payment: true,
    });
    expect(d.sameTail).toBe(true);
    // L'indice est porté, mais le changement n'est PAS déclaré bénin : un fraudeur qui recopie
    // les derniers chiffres produirait exactement ce signal.
    expect(d.benign).toBeFalsy();
    expect(d.whyAlert).toMatch(/fraude au virement/i);
    expect(d.whatToCheck).toMatch(/contre-appel/i);
  });

  it("ne déclare bénin QUE le compte re-créé, dont le numéro est prouvé identique", () => {
    const moved = describeChange({
      classification: "DEPLACE", partner_kind: "fournisseur",
      before: "****7890", after: "****7890",
      actor_authorized: false, on_payment: true, previousBankId: 7,
    });
    expect(moved.benign).toBe(true);
    expect(moved.nature).toContain("#7");
  });

  it("distingue un ajout de routine d'un compte inconnu déjà payé", () => {
    const routine = describeChange({
      classification: "NOUVEAU", partner_kind: "fournisseur",
      after: "****1234", actor_authorized: true, on_payment: false,
    });
    expect(routine.whyAlert).toMatch(/routine/i);
    expect(routine.benign).toBeFalsy(); // atténué, jamais effacé

    const danger = describeChange({
      classification: "NOUVEAU", partner_kind: "fournisseur",
      after: "****1234", actor_authorized: true, on_payment: true,
    });
    expect(danger.whyAlert).toMatch(/fraude au virement/i);
  });

  it("donne à chaque constat sa nature, son motif d'alerte et son geste de vérification", () => {
    for (const c of ["NON_AUTORISE", "A_VERIFIER", "NOUVEAU", "SUPPRIME"] as const) {
      const d = describeChange({
        classification: c, partner_kind: "fournisseur",
        before: "****1111", after: "****2222", actor_authorized: false, on_payment: false,
      });
      expect(d.nature.length, c).toBeGreaterThan(20);
      expect(d.whyAlert.length, c).toBeGreaterThan(20);
      expect(d.whatToCheck, c).toBeTruthy();
    }
  });
});

describe("chaque événement porte son explication", () => {
  it("aucun constat n'est produit sans détail", async () => {
    const before = await withFingerprints([rec({ odoo_bank_id: 1 }), rec({ odoo_bank_id: 2, acc_number: AUTRE_RIB })], SALT);
    const baseline = buildBaseline("f1", before, "admin", "2026-06-01T00:00:00Z");
    const after = await withFingerprints(
      [rec({ odoo_bank_id: 1, acc_number: AUTRE_RIB, actor_authorized: false }), rec({ odoo_bank_id: 9 })],
      SALT,
    );
    const ev = buildAuditEvents("f1", after, baseline, "2026-06-11T00:00:00Z");
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) expect(e.detail, e.classification).toBeTruthy();
  });
});
