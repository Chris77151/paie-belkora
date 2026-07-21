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

/** Empreinte non réversible d'un RIB (détection de changement, pas un secret). */
export function fingerprint(rib: string): string {
  const s = String(rib).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `f${h.toString(16)}_${s.length}`;
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
    fingerprint: fingerprint(r.acc_number),
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
    const currentFp = fingerprint(r.acc_number);

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
