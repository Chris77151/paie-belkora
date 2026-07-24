/**
 * Audit de sécurité des coordonnées bancaires (RIB) — logique PURE côté app.
 * Miroir TypeScript de scripts/classify_bank_events.py du skill
 * securite-donnees-bancaires-odoo. Détecte les changements de RIB par diff
 * vs une base de référence signée (méthode B), classe le risque et MASQUE le
 * RIB. Aucune donnée n'est inventée ; le RIB en clair ne sort jamais d'ici.
 */
import type {
  BankAuditEvent, BankBaseline, BankEventClass, BankSeverity,
} from "@/data/types";
import type { OdooBankRecord } from "./odoo";
import { uid } from "@/data/store";

/** Masque un RIB : garde les 4 derniers caractères alphanumériques. */
export function maskRib(rib: string | undefined | null): string | undefined {
  if (!rib) return undefined;
  const s = String(rib).replace(/[^A-Za-z0-9]/g, "");
  if (s.length <= 4) return "*".repeat(s.length);
  return "****" + s.slice(-4);
}

/** Normalisation d'un RIB avant empreinte (alphanumérique, majuscules). */
const normalizeRib = (rib: string) => String(rib).replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * Empreinte HÉRITÉE (djb2, 32 bits, non salée). CONSERVÉE UNIQUEMENT pour comparer les bases de
 * référence créées avant la v2 — ne plus l'utiliser pour de nouvelles empreintes : 32 bits
 * n'offrent pas de résistance aux collisions (un RIB frauduleux pourrait passer inaperçu).
 * @deprecated Utiliser `ribFingerprint()`.
 */
export function fingerprint(rib: string): string {
  const s = normalizeRib(rib);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `f${h.toString(16)}_${s.length}`;
}

/** Préfixe des empreintes cryptographiques (v2). Permet la comparaison rétro-compatible. */
export const FP_V2_PREFIX = "v2:";

/** Une empreinte est-elle au format hérité (pré-v2) ? */
export function isLegacyFingerprint(fp: string | undefined | null): boolean {
  return !!fp && !fp.startsWith(FP_V2_PREFIX);
}

/** Sel aléatoire (256 bits) propre à une société — généré une fois, conservé avec la base. */
export function newAuditSalt(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Empreinte CRYPTOGRAPHIQUE d'un RIB : HMAC-SHA-256(sel, RIB normalisé), préfixée « v2: ».
 *
 * Pourquoi HMAC salé plutôt qu'un simple hachage :
 *  - 256 bits ⇒ pas de collision exploitable (on ne peut pas forger un RIB de même empreinte) ;
 *  - le sel, propre à la société, empêche les tables précalculées et toute corrélation d'une
 *    installation à l'autre (l'espace des RIB est court et structuré, donc énumérable sans sel).
 * Le RIB en clair n'est jamais stocké : seules l'empreinte et la version masquée le sont.
 */
export async function ribFingerprint(rib: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(normalizeRib(rib)));
  return FP_V2_PREFIX + hex(sig);
}

/**
 * Pré-calcule l'empreinte v2 de chaque compte (les moteurs de build restent PURS et synchrones).
 * À appeler juste après la lecture Odoo, avant `buildBaseline` / `buildAuditEvents`.
 */
export async function withFingerprints(records: OdooBankRecord[], salt: string): Promise<OdooBankRecord[]> {
  return Promise.all(
    records.map(async (r) => ({ ...r, acc_fingerprint: await ribFingerprint(r.acc_number, salt) })),
  );
}

const SEVERITY_ORDER: Record<BankSeverity, number> = { critique: 0, eleve: 1, moyen: 2, info: 3 };
export function severityRank(s: BankSeverity): number {
  return SEVERITY_ORDER[s];
}

/** Classement déterministe (identique à la table de decision du skill). */
export function classify(input: {
  isNew: boolean;
  isDeleted: boolean;
  partner_kind: OdooBankRecord["partner_kind"];
  actor_authorized: boolean;
  validated: boolean;
  on_payment: boolean;
}): { classification: BankEventClass; severity: BankSeverity } {
  const isSupplier = input.partner_kind === "fournisseur";
  if (input.isNew) return { classification: "NOUVEAU", severity: isSupplier ? "eleve" : "moyen" };
  if (input.isDeleted) return { classification: "SUPPRIME", severity: "moyen" };
  if (!input.actor_authorized) {
    return { classification: "NON_AUTORISE", severity: isSupplier || input.on_payment ? "critique" : "eleve" };
  }
  if (!input.validated) return { classification: "A_VERIFIER", severity: "moyen" };
  return { classification: "AUTORISE", severity: "info" };
}

/** Construit une base de référence à partir de l'état courant (RIB = validés). */
export function buildBaseline(
  firmId: string,
  records: OdooBankRecord[],
  validatedBy: string,
  validatedAt: string,
): BankBaseline[] {
  return records.map((r) => ({
    odoo_bank_id: r.odoo_bank_id,
    firm_id: firmId,
    partner: r.partner,
    // Empreinte v2 pré-calculée (withFingerprints) ; repli hérité si absente.
    fingerprint: r.acc_fingerprint ?? fingerprint(r.acc_number),
    masked: maskRib(r.acc_number) ?? "",
    validated_by: validatedBy,
    validated_at: validatedAt,
  }));
}

/**
 * Compare l'état courant Odoo à la base de référence et produit les événements
 * d'audit (masqués). validated = false en méthode B (pas de preuve de validation).
 */
export function buildAuditEvents(
  firmId: string,
  records: OdooBankRecord[],
  baseline: BankBaseline[],
  nowIso: string,
): BankAuditEvent[] {
  const baseByBank = new Map(baseline.filter((b) => b.firm_id === firmId).map((b) => [b.odoo_bank_id, b]));
  const seen = new Set<number>();
  const events: BankAuditEvent[] = [];

  for (const r of records) {
    seen.add(r.odoo_bank_id);
    const base = baseByBank.get(r.odoo_bank_id);
    // Comparaison RÉTRO-COMPATIBLE : une base de référence héritée se compare avec l'algorithme
    // historique, une base v2 avec l'empreinte cryptographique pré-calculée. Sans cela, la
    // migration ferait apparaître à tort TOUS les comptes comme « RIB modifié ».
    const currentFp = isLegacyFingerprint(base?.fingerprint)
      ? fingerprint(r.acc_number)
      : (r.acc_fingerprint ?? fingerprint(r.acc_number));

    if (base && base.fingerprint === currentFp) continue; // inchangé → non listé

    const isNew = !base;
    const { classification, severity } = classify({
      isNew, isDeleted: false, partner_kind: r.partner_kind,
      actor_authorized: r.actor_authorized, validated: false, on_payment: r.on_payment,
    });

    events.push({
      id: uid("bev"),
      firm_id: firmId,
      odoo_bank_id: r.odoo_bank_id,
      partner: r.partner,
      partner_kind: r.partner_kind,
      rib_before_masked: base?.masked,
      rib_after_masked: maskRib(r.acc_number),
      actor_name: r.actor_name,
      actor_login: r.actor_login,
      actor_authorized: r.actor_authorized,
      validated: false,
      on_payment: r.on_payment,
      when: r.when || nowIso,
      classification,
      severity,
    });
  }

  // Comptes présents dans la baseline mais disparus d'Odoo → SUPPRIMÉ.
  for (const b of baseByBank.values()) {
    if (seen.has(b.odoo_bank_id)) continue;
    events.push({
      id: uid("bev"),
      firm_id: firmId,
      odoo_bank_id: b.odoo_bank_id,
      partner: b.partner,
      partner_kind: "fournisseur", // inconnu ici → prudence maximale
      rib_before_masked: b.masked,
      rib_after_masked: undefined,
      actor_name: "—",
      actor_login: "—",
      actor_authorized: false,
      validated: false,
      on_payment: false,
      when: nowIso,
      classification: "SUPPRIME",
      severity: "moyen",
    });
  }

  events.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity) || (b.when || "").localeCompare(a.when || ""));
  return events;
}
