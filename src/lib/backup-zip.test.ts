import { describe, expect, it } from "vitest";
import { backupBaseName, filterStateForBackup, firmsRows, sanitizeFilePart, workbookBytes, simpleTablePdf } from "./backup-zip";
import { seed } from "@/data/seed";

describe("backup-zip (sauvegarde ZIP organisee)", () => {
  it("nom de base horodaté et sûr", () => {
    const n = backupBaseName(new Date("2026-03-15T09:05:00"));
    expect(n).toBe("Sauvegarde_Belkora_20260315_0905");
  });

  it("sanitizeFilePart ne laisse aucun séparateur", () => {
    expect(sanitizeFilePart("Fiche d'émargement / Sidi-Yahya.pdf")).not.toMatch(/[\/\\.]/);
    expect(sanitizeFilePart("")).toBe("export");
  });

  it("filterStateForBackup restreint au périmètre société", () => {
    const s = seed();
    const fid = s.firms[0]?.id ?? "x";
    const f = filterStateForBackup(s, fid);
    expect(f.firms.every((x) => x.id === fid)).toBe(true);
    expect(f.employees.every((x) => x.firm_id === fid)).toBe(true);
  });

  it("lignes sociétés stables (aucune invention)", () => {
    const s = seed();
    const rows = firmsRows(s);
    expect(rows.length).toBe(s.firms.length);
    expect(rows[0]).toHaveProperty("Societe");
  });

  it("workbook + pdf générables sans navigateur (hors IndexedDB)", () => {
    const s = seed();
    const x = workbookBytes(firmsRows(s), "Societes", "Titre");
    expect(x.length).toBeGreaterThan(100);
    const p = simpleTablePdf("Societes", "sous-titre", ["A", "B"], [["x", "y"]]);
    expect(p.length).toBeGreaterThan(100);
    expect(String.fromCharCode(p[0], p[1], p[2], p[3])).toBe("%PDF");
  });
});
