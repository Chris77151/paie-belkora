/**
 * Audit de sécurité des coordonnées bancaires (RIB) — logique PURE côté app.
 * Miroir TypeScript de scripts/classify_bank_events.py du skill
 * securite-donnees-bancaires-odoo. Détecte les changements de RIB par diff
 * vs une base de référence signée (méthode B), classe le risque et MASQUE le
 * RIB. Aucune donnée n'est inventée ; le RIB en clair ne sort jamais d'ici.
 */
import type {
  BankAuditEvent, BankBaseline, BankChangeDetail, BankEventClass, BankSeverity,
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
  /** Compte re-créé ailleurs avec la MÊME empreinte (re-création technique, pas un changement). */
  isMoved?: boolean;
  partner_kind: OdooBankRecord["partner_kind"];
  actor_authorized: boolean;
  validated: boolean;
  on_payment: boolean;
}): { classification: BankEventClass; severity: BankSeverity } {
  const isSupplier = input.partner_kind === "fournisseur";
  // Compte re-créé sous un autre identifiant, NUMÉRO PROUVÉ INCHANGÉ : non-événement.
  if (input.isMoved) return { classification: "DEPLACE", severity: "info" };
  if (input.isNew) {
    // Un compte ajouté par une personne HABILITÉE et pas encore utilisé sur un paiement relève
    // de l'exploitation courante. Le classer « élevé » par principe noyait le volet sous des
    // alertes routinières — et une alerte qu'on cesse de lire ne protège plus de rien.
    const routine = input.actor_authorized && !input.on_payment;
    return { classification: "NOUVEAU", severity: routine ? "moyen" : isSupplier ? "eleve" : "moyen" };
  }
  if (input.isDeleted) return { classification: "SUPPRIME", severity: "moyen" };
  if (!input.actor_authorized) {
    return { classification: "NON_AUTORISE", severity: isSupplier || input.on_payment ? "critique" : "eleve" };
  }
  if (!input.validated) return { classification: "A_VERIFIER", severity: "moyen" };
  return { classification: "AUTORISE", severity: "info" };
}

/** Quatre derniers caractères d'un masque « ****1234 ». Vide si le masque manque. */
function tail(masked: string | undefined): string {
  return masked ? masked.replace(/[^A-Za-z0-9]/g, "").slice(-4) : "";
}

/**
 * Explique ce qui a RÉELLEMENT changé sur un compte.
 *
 * Sans cette explication, chaque ligne du volet se lit « ****1234 vers ****5678 » et pèse le
 * même poids : l'utilisateur s'alarme autant d'une re-création technique que d'une substitution
 * frauduleuse, puis cesse de lire le volet — et une alerte qu'on ne lit plus ne protège de rien.
 *
 * Règle tenue : aucun indice rassurant ne descend une gravité à lui seul. Seule une empreinte
 * PROUVÉE identique le fait ; un fraudeur pourrait sinon fabriquer le signal.
 */
export function describeChange(input: {
  classification: BankEventClass;
  partner_kind: OdooBankRecord["partner_kind"];
  before?: string;
  after?: string;
  actor_authorized: boolean;
  on_payment: boolean;
  previousBankId?: number;
}): BankChangeDetail {
  const { classification: c, before, after } = input;
  const sameTail = !!before && !!after && tail(before) === tail(after) && tail(before).length === 4;
  const who = input.actor_authorized ? "une personne habilitée" : "une personne NON habilitée";

  if (c === "DEPLACE") {
    return {
      nature: `Compte re-créé sous un autre identifiant Odoo${input.previousBankId ? ` (auparavant #${input.previousBankId})` : ""} — numéro de compte inchangé.`,
      whyAlert: "Aucune alerte : l'empreinte du numéro est identique, le compte n'a pas changé. Seul l'enregistrement technique a été refait.",
      benign: true,
      previousBankId: input.previousBankId,
    };
  }

  if (c === "NOUVEAU") {
    const routine = input.actor_authorized && !input.on_payment;
    return {
      nature: `Compte absent de la base de référence — ajouté par ${who}${input.on_payment ? ", et DÉJÀ utilisé sur un paiement" : ", pas encore utilisé sur un paiement"}.`,
      whyAlert: routine
        ? "Ajout de routine : personne habilitée, aucun paiement encore rattaché. À confirmer lors de la prochaine revue, sans urgence."
        : input.on_payment
          ? "Un compte inconnu déjà rattaché à un paiement est le scénario type de la fraude au virement."
          : "Compte fournisseur inconnu : à rapprocher d'une demande écrite avant tout règlement.",
      whatToCheck: routine
        ? "Vérifier au prochain contrôle que ce compte figure bien sur un document du tiers."
        : "Rapprocher d'un RIB officiel signé, et contre-appeler le tiers sur un numéro connu — jamais celui figurant sur la demande.",
      sameTail,
    };
  }

  if (c === "SUPPRIME") {
    return {
      nature: "Compte présent dans la base de référence mais absent d'Odoo : il a été supprimé ou archivé.",
      whyAlert: "Une suppression efface la référence qui permettait de détecter un futur changement. Elle peut aussi masquer une substitution en deux temps.",
      whatToCheck: "Confirmer que la suppression est voulue, puis réétalonner la base de référence.",
    };
  }

  // Le numéro de compte a changé sur le MÊME enregistrement : le cœur du dispositif.
  const nature = sameTail
    ? "Numéro de compte modifié — les quatre derniers caractères sont identiques, ce qui évoque une correction de saisie plutôt qu'une substitution."
    : "Numéro de compte modifié — y compris les quatre derniers caractères.";

  if (c === "NON_AUTORISE") {
    return {
      nature,
      whyAlert: `Modification effectuée par ${who}${input.on_payment ? ", sur un compte utilisé pour des paiements" : ""}. C'est le scénario de la fraude au virement.`,
      whatToCheck: "Suspendre tout règlement vers ce compte, contre-appeler le tiers sur un numéro connu, et vérifier le journal des accès Odoo.",
      // L'indice rassurant est affiché mais ne pèse RIEN sur la gravité : un fraudeur qui
      // recopie les derniers chiffres produirait exactement ce signal.
      sameTail,
    };
  }

  return {
    nature,
    whyAlert: `Modification effectuée par ${who}, sans trace de validation par un second regard.`,
    whatToCheck: "Rapprocher d'un RIB officiel du tiers et faire valider la modification.",
    sameTail,
  };
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

  // Empreintes de la base de référence, pour reconnaître un compte RE-CRÉÉ sous un autre
  // identifiant. Odoo re-crée fréquemment un `res.partner.bank` (suppression puis ressaisie du
  // même RIB) : sans cette reconnaissance, un non-événement produisait DEUX alertes — un
  // « supprimé » et un « nouveau » — alors que le numéro de compte n'avait pas bougé.
  const baselineByFp = new Map<string, BankBaseline>();
  for (const b of baseByBank.values()) {
    if (b.fingerprint && !baselineByFp.has(b.fingerprint)) baselineByFp.set(b.fingerprint, b);
  }
  /** Identifiants de la baseline retrouvés ailleurs : à ne PAS signaler comme supprimés. */
  const rehomed = new Set<number>();

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
    // Compte inconnu sous cet identifiant, mais dont l'empreinte figure DÉJÀ dans la base sous
    // un autre : c'est le même numéro, re-créé. On le dit, au lieu d'alerter deux fois.
    const moved = isNew ? baselineByFp.get(currentFp) : undefined;
    if (moved) rehomed.add(moved.odoo_bank_id);

    const { classification, severity } = classify({
      isNew, isDeleted: false, isMoved: !!moved, partner_kind: r.partner_kind,
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
      detail: describeChange({
        classification,
        partner_kind: r.partner_kind,
        before: moved ? moved.masked : base?.masked,
        after: maskRib(r.acc_number),
        actor_authorized: r.actor_authorized,
        on_payment: r.on_payment,
        previousBankId: moved?.odoo_bank_id,
      }),
    });
  }

  // Comptes présents dans la baseline mais disparus d'Odoo → SUPPRIMÉ.
  for (const b of baseByBank.values()) {
    if (seen.has(b.odoo_bank_id)) continue;
    // Retrouvé sous un autre identifiant : déjà rapporté comme « déplacé », pas comme supprimé.
    if (rehomed.has(b.odoo_bank_id)) continue;
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
      detail: describeChange({
        classification: "SUPPRIME",
        partner_kind: "fournisseur",
        before: b.masked,
        actor_authorized: false,
        on_payment: false,
      }),
    });
  }

  events.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity) || (b.when || "").localeCompare(a.when || ""));
  return events;
}
