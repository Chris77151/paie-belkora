import { describe, expect, it } from "vitest";
import type { Firm } from "@/data/types";
import { buildDeclarationPdf, declarationFileName, type DeclarationData } from "./declaration-export";

const firm = { id: "f_miya", name: "Miya Belkora Design", regime: "SMIG" } as unknown as Firm;

const data = (over: Partial<DeclarationData> = {}): DeclarationData => ({
  year: 2026,
  month: 7,
  ceiling: 6000,
  rates: { cnssEmployee: 0.0448, cnssEmployer: 0.0898, amoEmployee: 0.0226 },
  rows: [
    { name: "SEMLANI FADWA", cnss: "195170316", sbi: 6000, plafonne: 6000, cnssSal: 268.8, cnssPat: 538.8, amo: 135.6, af: 384 },
    { name: "SANS CNSS", cnss: undefined, sbi: 3000, plafonne: 3000, cnssSal: 134.4, cnssPat: 269.4, amo: 67.8, af: 192 },
  ],
  totals: { masse: 9000, massePlaf: 9000, cnssSal: 403.2, cnssPatr: 808.2, amo: 203.4, af: 576, ir: 250 },
  validated: true,
  issuedOn: "2026-08-10",
  ...over,
});

describe("declaration-export — bordereau CNSS PDF", () => {
  it("nom de fichier normalisé (ASCII, période zéro-paddée)", () => {
    expect(declarationFileName("f_miya", 2026, 7)).toBe("Bordereau_CNSS_f_miya_2026-07.pdf");
  });

  it("produit un PDF non vide en paysage A4", async () => {
    const doc = await buildDeclarationPdf(firm, data());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output().length).toBeGreaterThan(1000);
    // Paysage : largeur (297) > hauteur (210).
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
  });

  it("génère une page raisonnable pour un effectif nul (aucune ligne)", async () => {
    const doc = await buildDeclarationPdf(
      firm,
      data({ rows: [], totals: { masse: 0, massePlaf: 0, cnssSal: 0, cnssPatr: 0, amo: 0, af: 0, ir: 0 } }),
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2);
  });

  it("ne jette pas quand la validation est incomplète (bandeau d'écart)", async () => {
    const doc = await buildDeclarationPdf(firm, data({ incomplete: { validatedCount: 1, realCount: 2 } }));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
