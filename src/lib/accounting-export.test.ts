import { describe, it, expect } from "vitest";
import { buildEntriesCsvSage } from "./accounting-export";
import { buildPayrollEntry, buildSettlementEntry, sumResults } from "./payroll-accounting";
import { DEFAULT_ACCOUNTS } from "./accounting-accounts";
import { computePayslip } from "./payroll-engine";
import type { Firm } from "@/data/types";

const firm: Firm = { id: "f", name: "MBD", regime: "SMIG" };

function entries() {
  const r = computePayslip({
    year: 2026, month: 7, regime: "SMIG", hireDate: "2023-01-01", dependents: 0,
    hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
    panier: 0, transport: 0, salissure: 0, otherGross: 0,
  });
  const t = sumResults([r]);
  return [buildPayrollEntry(t, DEFAULT_ACCOUNTS, 2026, 7), buildSettlementEntry(t, DEFAULT_ACCOUNTS, 2026, 7)];
}

describe("buildEntriesCsvSage — CSV importable dans Sage / logiciels comptables", () => {
  const csv = buildEntriesCsvSage(entries(), firm, "juillet-2026");
  const lines = csv.trimEnd().split("\r\n");

  it("en-tête + une ligne par ligne d'écriture", () => {
    expect(lines[0]).toBe("Journal;Date;Piece;Compte;Libelle;Debit;Credit");
    // au moins l'OD (6171 + charges + 4432/4441…) et le règlement — plusieurs lignes.
    expect(lines.length).toBeGreaterThan(5);
  });

  it("date au format jj/mm/aaaa et pièce du journal OD", () => {
    const od = lines.find((l) => l.startsWith("OD;"))!;
    const cols = od.split(";");
    expect(cols[1]).toBe("31/07/2026"); // fin de mois
    expect(cols[2]).toBe("PAIE-2026-07");
    expect(cols[3]).toBe("6171"); // 1re ligne = rémunérations (débit)
  });

  it("débit/crédit en colonnes séparées, virgule décimale, vide si nul", () => {
    const remun = lines.find((l) => l.includes(";6171;"))!;
    const cols = remun.split(";");
    expect(cols[5]).toMatch(/^\d+,\d{2}$/); // débit renseigné (virgule)
    expect(cols[6]).toBe(""); // crédit vide (pas « 0,00 »)
  });

  it("chaque ligne a exactement 7 colonnes (aucun ; parasite dans un libellé)", () => {
    for (const l of lines) expect(l.split(";").length).toBe(7);
  });

  it("équilibre : somme des débits = somme des crédits sur tout le fichier", () => {
    const toNum = (s: string) => (s ? Number(s.replace(",", ".")) : 0);
    let d = 0, c = 0;
    for (const l of lines.slice(1)) { const p = l.split(";"); d += toNum(p[5]); c += toNum(p[6]); }
    expect(Math.round(d * 100)).toBe(Math.round(c * 100));
  });
});
