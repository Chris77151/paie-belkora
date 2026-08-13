/**
 * Code de validation à 4 chiffres (verrou paie & écritures comptables).
 *
 * Le code n'est JAMAIS stocké en clair : on conserve sur la société son empreinte SHA-256 salée
 * par l'identifiant de la société (`Firm.validation_pin_hash`). Le sel par société évite qu'un même
 * code produise la même empreinte d'une société à l'autre. Ce contrôle est un garde-fou anti-erreur
 * (double consentement), pas une sécurité cryptographique forte — 4 chiffres restent devinables ;
 * il empêche surtout une validation accidentelle.
 */

/** Un code valide = exactement 4 chiffres. */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Empreinte SHA-256 (hex) du code, salée par l'id société. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:pin:${pin}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Le code saisi correspond-il à l'empreinte enregistrée ? Faux si le format ou l'empreinte manquent. */
export async function verifyPin(pin: string, salt: string, hash: string | undefined): Promise<boolean> {
  if (!hash || !isValidPin(pin)) return false;
  return (await hashPin(pin, salt)) === hash;
}
