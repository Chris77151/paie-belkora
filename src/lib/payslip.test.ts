import { describe, it, expect } from "vitest";
import { buildPayslipHtml, buildPayslipLatex, type PayslipView } from "./payslip";
import { computePayslip } from "./payroll-engine";
import { defaultInput } from "./payroll-helpers";
import type { Employee, Firm, PayrollPeriod } from "@/data/types";

const firm: Firm = { id: "f", name: "MBD", regime: "SMIG" };
const employee: Employee = {
  id: "e", firm_id: "f", first_name: "A", last_name: "B",
  hire_date: "2023-01-01", contract_type: "CDI",
  base_hourly_rate: 30, monthly_hours: 191, dependents: 1, is_active: true,
};
const period: PayrollPeriod = { id: "p", firm_id: "f", year: 2026, month: 6, status: "draft" };

const result = computePayslip({
  year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 1,
  hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
  panier: 0, transport: 0, salissure: 0, otherGross: 0,
});

const view = (showEmployerSection?: boolean): PayslipView => ({
  firm, employee, period, result, input: defaultInput(employee), showEmployerSection,
});

const EMPLOYER_MARKER = "Partie réservée à l'employeur";

describe("bulletin — « Partie réservée à l'employeur » optionnelle", () => {
  it("HTML : incluse par défaut (aucune régression)", () => {
    expect(buildPayslipHtml(view())).toContain(EMPLOYER_MARKER);
    expect(buildPayslipHtml(view(true))).toContain(EMPLOYER_MARKER);
  });

  it("HTML : masquée si showEmployerSection = false", () => {
    expect(buildPayslipHtml(view(false))).not.toContain(EMPLOYER_MARKER);
  });

  it("LaTeX : bloc « Charges patronales » inclus par défaut, masqué si désactivé", () => {
    expect(buildPayslipLatex(view())).toContain("Charges patronales");
    expect(buildPayslipLatex(view(false))).not.toContain("Charges patronales");
  });

  it("HTML : le bloc de bas de page reste ancré en bas (avec ET sans section employeur)", () => {
    for (const show of [true, false]) {
      const html = buildPayslipHtml(view(show));
      // Le bloc final est isolé et poussé en bas (flex + margin-top:auto sur une hauteur mini).
      expect(html).toContain('<div class="bottom">');
      expect(html).toContain(".bottom{margin-top:auto}");
      expect(html).toContain("flex-direction:column");
      expect(html).toContain("min-height:1040px"); // hauteur mini à l'écran
      expect(html).toContain("min-height:262mm");  // hauteur mini à l'impression
      // Le décompte et les mentions restent présents dans les deux cas.
      expect(html).toContain("Décompte monétaire");
      expect(html).toContain("Arrêté à la somme de");
    }
  });

  it("LaTeX : le bloc final est poussé en bas de page (\\vfill) dans les deux cas", () => {
    expect(buildPayslipLatex(view(true))).toContain("\\vfill");
    expect(buildPayslipLatex(view(false))).toContain("\\vfill");
  });

  it("congés payés : synthèse compacte (acquis/pris/solde) sans le détail des congés posés", () => {
    const withLeave: PayslipView = {
      firm, employee, period, result, input: defaultInput(employee),
      leave: { acquired: 27, taken: 12, balance: 15 },
    };
    const html = buildPayslipHtml(withLeave);
    // La synthèse figure (une seule ligne : acquis / pris / solde).
    expect(html).toContain("Congés payés acquis");
    expect(html).toContain("Solde congés (jours)");
    expect(html).toContain("<td>27.0</td><td>12.0</td><td>15.0</td>");
    // Aucune fuite de détail : pas de dates/journal de congés dans le bulletin.
    expect(html).not.toContain("start_date");
    // Sans balance fournie, la ligne congés n'apparaît pas.
    expect(buildPayslipHtml(view())).not.toContain("Congés payés acquis");
  });

  it("assiduité réelle : absences = jours ouvrés − jours travaillés (plus de « 0 » figé)", () => {
    // 26 j travaillés → 0 absence ; le décompte n'invente rien.
    expect(buildPayslipHtml(view())).toContain("<td>26</td><td>26</td><td>0</td>");
    // 20 j travaillés → 6 absences affichées.
    const partial: PayslipView = {
      firm, employee, period, result,
      input: { ...defaultInput(employee), days_worked: 20 },
    };
    expect(buildPayslipHtml(partial)).toContain("<td>26</td><td>20</td><td>6</td>");
  });

  it("le CALCUL est inchangé : le net et les charges patronales restent identiques", () => {
    // Masquer la section n'affecte que l'affichage, jamais les montants calculés.
    expect(result.chargesPatronales).toBeGreaterThan(0);
    const withSection = buildPayslipHtml(view(true));
    const without = buildPayslipHtml(view(false));
    const net = result.netAPayer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");
    expect(withSection).toContain(net);
    expect(without).toContain(net);
  });
});

/* ==================================================================================
 * Bulletin — traitement des indemnités : la mention « exonérée » doit être VRAIE
 * ================================================================================== */
describe("bulletin — part exonérée et part réintégrée des indemnités", () => {
  /** Bulletin HTML pour un mois de 26 jours avec les indemnités données. */
  const html = (panier: number, transport: number, salissure = 0, outside = false) => {
    const r = computePayslip({
      year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 1,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier, transport, salissure, otherGross: 0, transportOutsideUrban: outside,
    });
    return {
      out: buildPayslipHtml({
        firm, employee, period, result: r,
        input: { ...defaultInput(employee), panier, transport, salissure, transport_outside_urban: outside },
      }),
      r,
    };
  };

  it("sous le plafond : une seule ligne, « exonérée » sans réserve", () => {
    const { out } = html(500, 300); // plafond panier 26 j = 931,84 ; transport 500
    expect(out).toContain("Prime de panier (exonérée)");
    expect(out).toContain("Indemnité de transport (exonérée)");
    expect(out).not.toContain("part imposable");
  });

  it("AU-DESSUS du plafond : la part réintégrée est affichée, plus aucune mention « exonérée » sur le tout", () => {
    const { out, r } = html(2000, 900);
    // Le moteur réintègre : 2000 - 931,84 = 1068,16 et 900 - 500 = 400.
    expect(r.panierExonere).toBe(931.84);
    expect(r.transportExonere).toBe(500);
    expect(out).toContain("Prime de panier (part exonérée)");
    expect(out).toContain("Prime de panier (part imposable — au-delà du plafond)");
    expect(out).toContain("Indemnité de transport (part imposable — au-delà du plafond)");
    // Le montant total ne doit JAMAIS être présenté comme exonéré.
    expect(out).not.toContain("Prime de panier (exonérée)");
  });

  it("le plafond hors périmètre urbain (750) est bien celui appliqué au bulletin", () => {
    const dansPlafond = html(0, 700, 0, true);
    expect(dansPlafond.out).toContain("Indemnité de transport (exonérée)");
    const horsPlafond = html(0, 800, 0, true);
    expect(horsPlafond.out).toContain("Indemnité de transport (part imposable — au-delà du plafond)");
  });

  it("aucun jour travaillé : le plafond panier est nul, l'indemnité est donc entièrement imposable", () => {
    const r = computePayslip({
      year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 1,
      hourlyRate: 30, daysWorked: 0, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier: 500, transport: 0, salissure: 0, otherGross: 0,
    });
    expect(r.panierExonere).toBe(0);
    const out = buildPayslipHtml({
      firm, employee, period, result: r,
      input: { ...defaultInput(employee), days_worked: 0, panier: 500 },
    });
    expect(out).toContain("Prime de panier (part imposable — au-delà du plafond)");
    expect(out).not.toContain("Prime de panier (part exonérée)"); // rien n'est exonéré
  });

  it("le bulletin justifie l'écart brut / assiette : BRUT − exonérations = SBI", () => {
    const { out, r } = html(2000, 900);
    expect(out).toContain("dont indemnités exonérées");
    // L'identité doit tenir au centime, sinon la ligne ajoutée induirait en erreur.
    expect(Math.round((r.salaireBrut - r.indemnitesExonerees) * 100) / 100).toBe(r.sbi);
  });

  it("LaTeX : même traitement que le HTML — les trois rendus partagent la source des lignes", () => {
    const r = computePayslip({
      year: 2026, month: 6, regime: "SMIG", hireDate: employee.hire_date, dependents: 1,
      hourlyRate: 30, daysWorked: 26, hoursNormal: 191, hoursOt25: 0, hoursOt50: 0, hoursOt100: 0,
      panier: 2000, transport: 0, salissure: 0, otherGross: 0,
    });
    const tex = buildPayslipLatex({
      firm, employee, period, result: r,
      input: { ...defaultInput(employee), panier: 2000 },
    });
    expect(tex).toContain("part imposable");
  });
});
