/** Formatage MAD, dates FR, et conversion d'un montant en toutes lettres (bulletin). */

export const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const nfMad = new Intl.NumberFormat("fr-MA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function mad(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${nfMad.format(n)} DH`;
}

export function num(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return nfMad.format(n);
}

export function pct(n: number): string {
  return `${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export function periodLabel(year: number, month: number): string {
  return `${MONTHS_FR[month - 1]} ${year}`;
}

export function dateFr(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ---- montant en toutes lettres (français) ---- */
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    const base = TENS[t];
    const rest = below100(10 + u);
    return u === 1 && t === 7 ? `${base} et ${UNITS[11]}` : `${base}-${rest}`;
  }
  let word = TENS[t];
  if (u === 0) return t === 8 ? word + "s" : word;
  if (u === 1 && t !== 8) return `${word} et un`;
  return `${word}-${UNITS[u]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const cent = h === 1 ? "cent" : `${UNITS[h]} cent`;
  if (rest === 0) return h === 1 ? "cent" : `${UNITS[h]} cents`;
  return `${cent} ${below100(rest)}`;
}

function integerToWords(n: number): string {
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(millions === 1 ? "un million" : `${below1000(millions)} millions`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands)} mille`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** "3 351,64 DH" -> "trois mille trois cent cinquante et un dirhams et soixante-quatre centimes". */
export function amountToWordsFr(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const dh = Math.floor(rounded);
  const cts = Math.round((rounded - dh) * 100);
  const dhWords = `${integerToWords(dh)} ${dh > 1 ? "dirhams" : "dirham"}`;
  if (cts === 0) return capitalize(dhWords);
  return capitalize(`${dhWords} et ${integerToWords(cts)} ${cts > 1 ? "centimes" : "centime"}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
