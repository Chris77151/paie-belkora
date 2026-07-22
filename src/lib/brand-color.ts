/**
 * Couleur de marque par société — spectre harmonieux mono-teinte pour les bulletins de paie.
 *
 * Chaque société peut définir une `brand_color` (dérivée de son logo ou choisie dans
 * Paramètres). À partir de cette teinte unique, on dérive une famille de variantes
 * perceptuellement cohérentes (accent, en-tête, encre, fond clair), à la manière du spectre
 * émeraude d'origine de Miya Belkora Design.
 *
 * RÈGLE : sans `brand_color`, on retombe sur la palette Miya EXACTE (aucune régression).
 */

export type RGB = [number, number, number];

export interface PayslipPalette {
  /** Accent principal (NET, lignes fortes) — égal à la couleur de marque. */
  lime: RGB;
  /** En-tête de tableau (texte blanc dessus) — variante foncée. */
  olive: RGB;
  /** Bandeau « salarié » — variante grise teintée. */
  sageDark: RGB;
  /** Fond des sous-totaux — variante très claire. */
  tint: RGB;
  /** Encre (texte foncé) — quasi-noir teinté. */
  ink: RGB;
  limeHex: string;
  oliveHex: string;
  sageHex: string;
  tintHex: string;
  inkHex: string;
}

/** Palette Miya par défaut — valeurs historiques EXACTES du bulletin (aucune régression). */
export const DEFAULT_PALETTE: PayslipPalette = {
  lime: [141, 185, 78],
  olive: [139, 162, 95],
  sageDark: [96, 108, 96],
  tint: [236, 240, 226],
  ink: [40, 52, 44],
  limeHex: "#8DB94E",
  oliveHex: "#8BA25F",
  sageHex: "#606C60",
  tintHex: "#ecf0e2",
  inkHex: "#28342c",
};

/* ------------------------------------------------------------------ conversions ------------------------------------------------------------------ */

export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, "");
  const s = m.length === 3 ? m.replace(/(.)/g, "$1$1") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** RGB (0-255) → HSL (h 0-360, s/l 0-1). */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/** HSL (h 0-360, s/l 0-1) → RGB (0-255). */
export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Dérive une palette harmonieuse mono-teinte à partir d'une couleur de marque.
 * Toutes les variantes partagent la teinte (H) de la marque, avec S/L modulés pour un usage
 * cohérent (accent vif, en-tête foncé lisible en blanc, fond clair, encre foncée).
 */
export function derivePayslipPalette(baseHex: string): PayslipPalette {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return DEFAULT_PALETTE;
  const [h, s] = rgbToHsl(rgb);
  const olive = hslToRgb(h, clamp(s * 0.72, 0.16, 0.6), 0.44);
  const sageDark = hslToRgb(h, 0.1, 0.4);
  const tint = hslToRgb(h, clamp(s, 0.2, 0.4), 0.91);
  const ink = hslToRgb(h, 0.16, 0.17);
  const pal: PayslipPalette = {
    lime: rgb,
    olive,
    sageDark,
    tint,
    ink,
    limeHex: rgbToHex(rgb),
    oliveHex: rgbToHex(olive),
    sageHex: rgbToHex(sageDark),
    tintHex: rgbToHex(tint),
    inkHex: rgbToHex(ink),
  };
  return pal;
}

/** Palette applicable à une société : dérivée de sa couleur de marque, sinon défaut Miya. */
export function paletteForFirm(brandColor?: string | null): PayslipPalette {
  return brandColor && hexToRgb(brandColor) ? derivePayslipPalette(brandColor) : DEFAULT_PALETTE;
}

/* ------------------------------------------------------------------ extraction depuis le logo ------------------------------------------------------------------ */

/**
 * Extrait la couleur dominante d'une image (logo) côté navigateur, via un canvas.
 * On échantillonne les pixels, on ignore le quasi-blanc / quasi-noir / transparent, et on
 * retient la teinte la plus saturée et présente. Renvoie un hex, ou null en cas d'échec.
 */
export function dominantColorFromImage(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // Regroupe par teinte (buckets de 15°), pondéré par saturation × présence.
        const buckets = new Map<number, { r: number; g: number; b: number; w: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const [hh, ss, ll] = rgbToHsl([r, g, b]);
          if (ss < 0.18 || ll > 0.92 || ll < 0.08) continue; // ignore gris/blanc/noir
          const key = Math.round(hh / 15);
          const weight = ss * (1 - Math.abs(ll - 0.5));
          const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
          cur.r += r * weight;
          cur.g += g * weight;
          cur.b += b * weight;
          cur.w += weight;
          buckets.set(key, cur);
        }
        let best: { r: number; g: number; b: number; w: number } | null = null;
        for (const v of buckets.values()) if (!best || v.w > best.w) best = v;
        if (!best || best.w === 0) return resolve(null);
        resolve(rgbToHex([best.r / best.w, best.g / best.w, best.b / best.w]));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
