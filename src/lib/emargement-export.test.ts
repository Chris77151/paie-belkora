import { describe, expect, it } from "vitest";
import type { Employee, Firm } from "@/data/types";
import type { NonDeclarePayment } from "./non-declares";
import { amountToWordsFr } from "./format";
import {
  buildEmargementLines, buildEmargementPdf, defaultEmargementNumero,
  emargementFileName, emargementSuffix, emargementTotals, fmtJours,
  paymentCat, paymentSection,
} from "./emargement-export";

const miya = {
  id: "firm_miya", name: "Miya Belkora Design SARL AU", legal_form: "SARL AU",
  share_capital: 100000, address: "Douar Chraga, El Menzeh", ice: "I", if_fiscal: "F",
  patente: "TP", rc: "RC", rc_city: "Témara", cnss_affiliation: "C",
} as unknown as Firm;
const cpu = {
  id: "firm_chakir", name: "BELKORA CHAKIR", legal_form: "Personne physique",
  address: "Douar El Hancha", cnss_affiliation: "5776458", signatory_name: "Chakir BELKORA",
} as unknown as Firm;

const emp = (id: string, first: string, last: string): Employee =>
  ({ id, firm_id: "f", first_name: first, last_name: last, hire_date: "2026-09-20" }) as Employee;

const pay = (id: string, employee_id: string, o: Partial<NonDeclarePayment> = {}): NonDeclarePayment =>
  ({
    id, firm_id: "f", employee_id, year: 2026, month: 10, jours: 12,
    brut_verse: 1620, avance_deduite: 0, net_verse: 1620, mode: "especes",
    note: "Fiche X — OUVRIERS D — Cat. H — Sidi Yahya", created_at: "2026-10-05T00:00:00.000Z",
    ...o,
  }) as NonDeclarePayment;

describe("fiche d'émargement — modèle et déclinaisons", () => {
  it("suffixe et N° par entité (MBD / CHAKIR / sans)", () => {
    expect(emargementSuffix(miya)).toBe("MIYA");
    expect(emargementSuffix(cpu)).toBe("CHAKIR");
    expect(emargementSuffix({ id: "f", name: "Pépinière Belkora" } as Firm)).toBe("");
    expect(defaultEmargementNumero(miya, 2026, 10)).toBe("12/EM-2026-10-MIYA");
    expect(defaultEmargementNumero(cpu, 2026, 10)).toBe("12/EM-2026-10-CHAKIR");
    expect(emargementFileName(miya, 2026, 10)).toBe("Fiche_Emargement_MIYA_2026-10.pdf");
  });

  it("section et Cat. lues du versement, repli note, repli OUVRIERS", () => {
    expect(paymentSection(pay("p", "e", { section: "OUVRIERS N.D" }))).toBe("OUVRIERS N.D");
    expect(paymentSection(pay("p", "e", { section: undefined }))).toBe("OUVRIERS D");
    expect(paymentSection(pay("p", "e", { section: undefined, note: "sans mention" }))).toBe("OUVRIERS");
    expect(paymentCat(pay("p", "e"))).toBe("H");
    expect(fmtJours(12)).toBe("12,0");
    expect(fmtJours(6.8)).toBe("6,8");
  });

  it("lignes : payés puis Néant, totaux et sous-totaux exacts", () => {
    const e1 = emp("e1", "hassan", "neaija");
    const e2 = emp("e2", "driss", "shaimat");
    const lines = buildEmargementLines([e1, e2], [pay("p1", "e1", { net_verse: 1620, brut_verse: 1620 })]);
    expect(lines).toHaveLength(2);
    expect(lines[0].pay).not.toBeNull();
    expect(lines[1].pay).toBeNull(); // Néant : sans versement ce mois
    const t = emargementTotals(lines);
    expect(t.total).toBe(1620);
    expect(t.paidCount).toBe(1);
    expect(t.subBySection).toEqual([{ section: "OUVRIERS D", sub: 1620 }, { section: "OUVRIERS", sub: 0 }]);
  });

  it("PDF : portrait multipage sans erreur, mentions du modèle", () => {
    const e1 = emp("e1", "hassan", "neaija");
    const lines = buildEmargementLines([e1], [pay("p1", "e1")]);
    const doc = buildEmargementPdf({
      firm: miya, numero: "12/EM-2026-10-MIYA", quinzaine: "du 20/09/2026 au 03/10/2026",
      chantier: "Travaux exterieur - Sidi Yahya", lieu: "Sidi Yahya", datePaiement: "2026-10-05",
      year: 2026, month: 10, lines,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const uri = doc.output("datauristring") as string;
    expect(uri.length).toBeGreaterThan(1000);
  });

  it("arrêté MIYA : 21 842,00 DH (Vingt et un mille huit cent quarante-deux dirhams)", () => {
    // Formulation EXACTE de la fiche N° 12/EM-2026-10-MIYA remise par l'utilisateur.
    expect(amountToWordsFr(21842)).toBe("Vingt et un mille huit cent quarante-deux dirhams");
    expect(amountToWordsFr(19906)).toBe("Dix-neuf mille neuf cent six dirhams");
    expect(amountToWordsFr(41748)).toBe("Quarante et un mille sept cent quarante-huit dirhams");
  });

  it("PDF entité CPU : construit sans erreur (en-tête Contribuable Personne Unique)", () => {
    const e1 = emp("e1", "RACHID", "CHALH");
    const lines = buildEmargementLines([e1], [pay("p1", "e1", { net_verse: 1537.5, brut_verse: 1537.5, jours: 12.3 })]);
    const doc = buildEmargementPdf({
      firm: cpu, numero: "12/EM-2026-10-CHAKIR", quinzaine: "du 20/09/2026 au 03/10/2026",
      chantier: "", lieu: "Kénitra", datePaiement: "2026-10-05",
      year: 2026, month: 10, lines,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
