/**
 * Mentions légales d'une société — SOURCE UNIQUE DE VÉRITÉ.
 *
 * Tous les documents (bulletin de paie, attestations, contrats, actes juridiques,
 * écritures) et l'app elle-même doivent afficher l'identité légale via ces fonctions,
 * afin qu'elle soit COHÉRENTE et COMPLÈTE partout. Ordre canonique marocain :
 * forme juridique + capital, ICE, IF, RC (+ tribunal), Patente/TP, CNSS, tél, e-mail, siège.
 *
 * Règle permanente : n'affiche QUE les champs réellement renseignés — jamais d'invention,
 * jamais de « — » ou de placeholder injecté à la place d'une donnée absente.
 */
import type { Firm } from "@/data/types";

const nz = (v?: string | null): string => (v ?? "").trim();

/** Capital social formaté en dirhams, séparateurs de milliers français : « 100 000 DH ». */
export function capitalMad(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " DH";
}

/**
 * Descripteur juridique court : « SARL AU au capital de 100 000 DH ».
 * Retombe sur la seule forme juridique si le capital est absent ; "" si rien n'est renseigné.
 */
export function firmDescriptor(firm: Firm): string {
  const form = nz(firm.legal_form);
  if (!form) return "";
  return firm.share_capital && firm.share_capital > 0
    ? `${form} au capital de ${capitalMad(firm.share_capital)}`
    : form;
}

/** Numéro RC complété du tribunal quand il est connu : « 45231 (Marrakech) ». */
export function firmRc(firm: Firm): string {
  const rc = nz(firm.rc);
  if (!rc) return "";
  const city = nz(firm.rc_city);
  if (!city) return rc;
  // Évite « 45xxx — Marrakech (Marrakech) » quand la ville figure déjà dans le n° RC.
  if (rc.toLowerCase().includes(city.toLowerCase())) return rc;
  return `${rc} (${city})`;
}

/**
 * Mentions légales en paires {label, value} — ordre canonique, champs renseignés uniquement.
 * Base commune de tous les rendus (ligne de pied de page, en-tête, tableau de l'app).
 */
export function firmLegalPairs(firm: Firm): { label: string; value: string }[] {
  return [
    { label: "ICE", value: nz(firm.ice) },
    { label: "IF", value: nz(firm.if_fiscal) },
    { label: "RC", value: firmRc(firm) },
    { label: "Patente", value: nz(firm.patente) },
    { label: "CNSS", value: nz(firm.cnss_affiliation) },
    { label: "Tél", value: nz(firm.phone) },
    { label: "E-mail", value: nz(firm.email) },
  ].filter((p) => p.value);
}

/**
 * Ligne de mentions légales pour pieds de page / en-têtes :
 * « ICE : … · IF : … · RC : … · Patente : … · CNSS : … ».
 * @param opts.includeAddress ajoute le siège en fin de ligne. @param opts.sep séparateur.
 */
export function firmLegalLine(
  firm: Firm,
  opts?: { includeAddress?: boolean; sep?: string },
): string {
  const sep = opts?.sep ?? "  ·  ";
  const bits = firmLegalPairs(firm).map((p) => `${p.label} : ${p.value}`);
  if (opts?.includeAddress && nz(firm.address)) bits.push(nz(firm.address));
  return bits.join(sep);
}

/**
 * Clause d'identité en prose pour contrats / attestations, ex. :
 * « SARL AU au capital de 100 000 DH, immatriculée au Registre du Commerce de Marrakech
 *   sous le n° 45231, ICE 00271…, IF 45123…, patente n° 451…, affiliée à la CNSS sous le
 *   n° 78…, ayant son siège social à Route de l'Ourika, Marrakech ».
 * Fonction PURE ; n'enchaîne que les segments renseignés.
 */
export function firmIdentityClause(firm: Firm): string {
  const parts: string[] = [];
  const desc = firmDescriptor(firm);
  if (desc) parts.push(desc);
  if (nz(firm.rc)) {
    const where = nz(firm.rc_city) ? ` de ${nz(firm.rc_city)}` : "";
    parts.push(`immatriculée au Registre du Commerce${where} sous le n° ${nz(firm.rc)}`);
  }
  if (nz(firm.ice)) parts.push(`ICE ${nz(firm.ice)}`);
  if (nz(firm.if_fiscal)) parts.push(`IF ${nz(firm.if_fiscal)}`);
  if (nz(firm.patente)) parts.push(`patente n° ${nz(firm.patente)}`);
  if (nz(firm.cnss_affiliation)) parts.push(`affiliée à la CNSS sous le n° ${nz(firm.cnss_affiliation)}`);
  if (nz(firm.address)) parts.push(`ayant son siège social à ${nz(firm.address)}`);
  return parts.join(", ");
}
