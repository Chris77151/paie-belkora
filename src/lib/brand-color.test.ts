import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  derivePayslipPalette,
  paletteForFirm,
  DEFAULT_PALETTE,
} from "./brand-color";

describe("conversions couleur", () => {
  it("hex → rgb → hex (aller-retour)", () => {
    expect(hexToRgb("#8DB94E")).toEqual([141, 185, 78]);
    expect(rgbToHex([141, 185, 78])).toBe("#8db94e");
  });
  it("hex court (#abc) accepté", () => {
    expect(hexToRgb("#0af")).toEqual([0, 170, 255]);
  });
  it("hex invalide → null", () => {
    expect(hexToRgb("pas-un-hex")).toBeNull();
    expect(hexToRgb("#12")).toBeNull();
  });
  it("rgb → hsl → rgb (stable à l'arrondi)", () => {
    const rgb: [number, number, number] = [141, 185, 78];
    const [h, s, l] = rgbToHsl(rgb);
    const back = hslToRgb(h, s, l).map(Math.round);
    expect(back).toEqual(rgb);
  });
});

describe("palette par société — aucune régression Miya", () => {
  it("sans brand_color → palette Miya EXACTE", () => {
    expect(paletteForFirm(undefined)).toBe(DEFAULT_PALETTE);
    expect(paletteForFirm("")).toBe(DEFAULT_PALETTE);
    expect(paletteForFirm("invalide")).toBe(DEFAULT_PALETTE);
  });
  it("les valeurs Miya par défaut sont celles du gabarit LaTeX officiel mbd-style.sty", () => {
    // Source de vérité : mbdvertfonce #1B4332, mbdvertclair #52B788, mbdvertpale #D8F3DC, mbdmuted #6B7280.
    expect(DEFAULT_PALETTE.deepHex.toLowerCase()).toBe("#1b4332");
    expect(DEFAULT_PALETTE.deep).toEqual([27, 67, 50]);
    expect(DEFAULT_PALETTE.oliveHex.toLowerCase()).toBe("#52b788");
    expect(DEFAULT_PALETTE.tintHex.toLowerCase()).toBe("#d8f3dc");
    expect(DEFAULT_PALETTE.mutedHex.toLowerCase()).toBe("#6b7280");
  });
});

describe("dérivation d'une palette de marque", () => {
  const pal = derivePayslipPalette("#2E7D5B"); // vert émeraude Pépinière
  it("l'accent (lime) = couleur de marque exacte", () => {
    expect(pal.lime).toEqual(hexToRgb("#2E7D5B"));
  });
  it("toutes les variantes partagent (à peu près) la teinte de la marque", () => {
    const baseH = rgbToHsl(hexToRgb("#2E7D5B")!)[0];
    for (const v of [pal.olive, pal.sageDark, pal.tint, pal.ink]) {
      const h = rgbToHsl(v)[0];
      // écart de teinte borné (les gris quasi-neutres peuvent dériver un peu)
      const diff = Math.min(Math.abs(h - baseH), 360 - Math.abs(h - baseH));
      expect(diff).toBeLessThan(40);
    }
  });
  it("l'encre est foncée et le tint est clair (hiérarchie)", () => {
    expect(rgbToHsl(pal.ink)[2]).toBeLessThan(0.25);
    expect(rgbToHsl(pal.tint)[2]).toBeGreaterThan(0.85);
  });
  it("produit des hex valides", () => {
    for (const hex of [pal.limeHex, pal.oliveHex, pal.sageHex, pal.tintHex, pal.inkHex]) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
