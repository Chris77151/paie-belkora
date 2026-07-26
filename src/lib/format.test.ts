import { describe, it, expect } from "vitest";
import { asciiSpaces, mad, num, pct } from "./format";
import { capitalMad, firmDescriptor } from "./firm-legal";
import type { Firm } from "@/data/types";

// Espaces « spéciales » qui cassent le rendu du PDF (police WinAnsi), désignées par code point.
const NBSP = " ";        // insécable
const NARROW_NBSP = " "; // fine insécable (séparateur de milliers d'Intl fr-*)
const THIN = " ";        // fine
const SPECIAL_SPACES = /[    ⁠﻿]/;

/** Aucune de ces espaces spéciales ne doit subsister dans une chaîne destinée au PDF. */
function hasSpecialSpace(s: string): boolean {
  return SPECIAL_SPACES.test(s);
}

describe("asciiSpaces — normalisation des espaces spéciales", () => {
  it("remplace fine insécable / insécable / fine par une espace normale", () => {
    expect(asciiSpaces(`100${NARROW_NBSP}000`)).toBe("100 000");
    expect(asciiSpaces(`a${NBSP}b`)).toBe("a b");
    expect(asciiSpaces(`x${THIN}y`)).toBe("x y");
  });
  it("laisse le texte normal intact", () => {
    expect(asciiSpaces("Miya Belkora Design")).toBe("Miya Belkora Design");
  });
});

describe("formatage des montants — sûr pour le PDF (aucun caractère parasite)", () => {
  it("mad/num/pct n'émettent aucune espace spéciale", () => {
    expect(hasSpecialSpace(mad(3422.72))).toBe(false);
    expect(hasSpecialSpace(num(1234567.89))).toBe(false);
    expect(hasSpecialSpace(pct(0.0448))).toBe(false);
  });
  it("un montant groupé n'émet aucune espace spéciale (quel que soit le séparateur de la locale)", () => {
    // Selon l'ICU, fr-MA groupe par « . » (Node) ou par espace fine insécable (navigateur) ;
    // dans les deux cas, la sortie ne doit contenir AUCUNE espace spéciale destinée au PDF.
    const s = mad(1234567.89);
    expect(hasSpecialSpace(s)).toBe(false);
    expect(s).toContain("DH");
  });
});

describe("capitalMad / firmDescriptor — le bug « 100 /000 » est corrigé", () => {
  it("capitalMad(100000) = « 100 000 DH » avec une espace normale", () => {
    expect(capitalMad(100000)).toBe("100 000 DH");
    expect(hasSpecialSpace(capitalMad(100000))).toBe(false);
  });
  it("firmDescriptor n'émet aucune espace spéciale", () => {
    const firm = { legal_form: "SARL AU", share_capital: 100000 } as Firm;
    expect(firmDescriptor(firm)).toBe("SARL AU au capital de 100 000 DH");
    expect(hasSpecialSpace(firmDescriptor(firm))).toBe(false);
  });
});
