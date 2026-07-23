import { describe, it, expect } from "vitest";
import { computePayslip, seniorityRate, irAnnuel, round2, type PayrollInput } from "./payroll-engine";
import { getParams } from "./params";

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  year: 2026,
  month: 6,
  regime: "SMIG",
  hireDate: "2023-01-01",
  dependents: 0,
  hourlyRate: 17.92,
  daysWorked: 26,
  hoursNormal: 191,
  hoursOt25: 0,
  hoursOt50: 0,
  hoursOt100: 0,
  panier: 0,
  transport: 0,
  salissure: 0,
  otherGross: 0,
  ...over,
});

describe("round2", () => {
  it("arrondit à 2 décimales, demi vers le haut", () => {
    expect(round2(161.004928)).toBe(161.0);
    expect(round2(230.00704)).toBe(230.01);
    expect(round2(2916.6666)).toBe(2916.67);
  });
});

describe("SMIG standard, 3 ans d'ancienneté, sans IR", () => {
  const r = computePayslip(base());
  it("salaire de base 191 h", () => expect(r.salaireBase).toBe(3422.72));
  it("prime d'ancienneté 5 %", () => {
    expect(r.seniorityRate).toBe(0.05);
    expect(r.primeAnciennete).toBe(171.14);
  });
  it("salaire brut", () => expect(r.salaireBrut).toBe(3593.86));
  it("CNSS et AMO salariales", () => {
    expect(r.cnssSalarie).toBe(161.0);
    expect(r.amoSalarie).toBe(81.22);
  });
  it("frais pro 35 % (SBI annuel <= 78 000)", () => {
    expect(r.fraisProRate).toBe(0.35);
    expect(r.fraisPro).toBe(1257.85);
  });
  it("IR nul dans la 1re tranche", () => expect(r.ir).toBe(0));
  it("net à payer", () => expect(r.netAPayer).toBe(3351.64));
  it("charges patronales et coût employeur", () => {
    expect(r.cnssPatronal).toBe(322.73);
    expect(r.af).toBe(230.01);
    expect(r.amoPatronal).toBe(147.71);
    expect(r.tfp).toBe(57.5);
    expect(r.chargesPatronales).toBe(757.95);
    expect(r.coutTotalEmployeur).toBe(4351.81);
  });
});

describe("Cadre : frais pro 25 % plafonné + IR tranche haute", () => {
  const r = computePayslip(base({ hourlyRate: 200, hireDate: "2026-01-01" }));
  it("brut 38 200", () => expect(r.salaireBrut).toBe(38200));
  it("CNSS salariale plafonnée à 6 000 (4,48 %)", () => expect(r.cnssSalarie).toBe(268.8));
  it("CNSS patronale plafonnée à 6 000 (8,98 %)", () => {
    // Assiette CNSS = min(SBI ; 6 000), identique pour la part salariale ET patronale.
    expect(r.employerDetail.cnssBase).toBe(6000);
    expect(r.cnssPatronal).toBe(538.8); // 6 000 x 8,98 %
    // Détail : 0,67 % + 0,38 % + 7,93 % = 8,98 %, tous sur l'assiette plafonnée.
    expect(r.employerDetail.cnssCourtTerme).toBe(40.2); // 6 000 x 0,67 %
    expect(r.employerDetail.cnssIpe).toBe(22.8); // 6 000 x 0,38 %
    expect(r.employerDetail.cnssLongTerme).toBe(475.8); // 6 000 x 7,93 %
  });
  it("frais pro à 25 % écrêtés au plafond 35 000/an", () => {
    expect(r.fraisProRate).toBe(0.25);
    expect(r.fraisPro).toBe(2916.67); // 35 000 / 12, et non 9 550
  });
  it("IR barème 37 %", () => expect(r.ir).toBe(10352.61));
  it("net à payer", () => expect(r.netAPayer).toBe(26715.27));
});

describe("Proratisation aux jours travaillés (mois complet = 26 j)", () => {
  it("26 jours = mois complet, base inchangée", () => {
    expect(computePayslip(base({ daysWorked: 26 })).salaireBase).toBe(3422.72);
  });
  it("20 jours = base au prorata 20/26", () => {
    const r = computePayslip(base({ daysWorked: 20 }));
    expect(r.salaireBase).toBe(round2(17.92 * 191 * (20 / 26))); // 2 632,86
  });
  it("13 jours = demi-mois", () => {
    const r = computePayslip(base({ daysWorked: 13 }));
    expect(r.salaireBase).toBe(round2(17.92 * 191 * (13 / 26))); // 1 711,36
  });
  it("0 jour travaillé = base nulle", () => {
    expect(computePayslip(base({ daysWorked: 0 })).salaireBase).toBe(0);
  });
  it("au-delà de 26 jours, la base est plafonnée à un mois complet (surplus = HS)", () => {
    expect(computePayslip(base({ daysWorked: 30 })).salaireBase).toBe(3422.72);
  });
  it("la prime d'ancienneté suit la base proratisée", () => {
    const full = computePayslip(base({ daysWorked: 26 }));
    const half = computePayslip(base({ daysWorked: 13 }));
    expect(half.primeAnciennete).toBe(round2(full.primeAnciennete / 2));
  });
});

describe("Indemnités exonérées", () => {
  it("panier exonéré sous le plafond 2 x SMIG/jour", () => {
    const r = computePayslip(base({ panier: 500, daysWorked: 20 }));
    // plafond = 2 x 17,92 x 20 = 716,80 -> 500 entièrement exonéré
    expect(r.panierExonere).toBe(500);
    expect(r.indemnitesImposables).toBe(0);
  });
  it("fraction de panier au-delà du plafond réintègre le SBI", () => {
    const r = computePayslip(base({ panier: 1000, daysWorked: 20 }));
    expect(r.panierExonere).toBe(716.8);
    expect(r.indemnitesImposables).toBe(283.2);
    // le SBI exclut la seule part exonérée
    expect(round2(r.salaireBrut - r.sbi)).toBe(716.8);
  });
  it("transport plafonné à 500 intra-urbain, 750 hors périmètre", () => {
    const intra = computePayslip(base({ transport: 700 }));
    expect(intra.transportExonere).toBe(500);
    const hors = computePayslip(base({ transport: 700, transportOutsideUrban: true }));
    expect(hors.transportExonere).toBe(700);
  });
});

describe("Heures supplémentaires (art. 201)", () => {
  it("+25 %, +50 %, +100 % appliqués aux bons volumes", () => {
    const r = computePayslip(base({ hoursOt25: 10, hoursOt50: 4, hoursOt100: 2, hireDate: "2026-01-01" }));
    expect(r.overtimeDetail.ot25).toBe(round2(10 * 17.92 * 1.25));
    expect(r.overtimeDetail.ot50).toBe(round2(4 * 17.92 * 1.5));
    expect(r.overtimeDetail.ot100).toBe(round2(2 * 17.92 * 2));
  });
});

describe("Charges de famille", () => {
  it("déduction plafonnée à 6 personnes", () => {
    const p = getParams(2026);
    const r8 = computePayslip(base({ hourlyRate: 200, dependents: 8, hireDate: "2026-01-01" }));
    expect(r8.chargesFamille).toBe(round2(6 * p.familyDeductionMonthly));
  });
});

describe("Fidélité au modèle officiel (bulletin ABOUBI 07/2026)", () => {
  // Base 3 422,72 + panier 806 + transport 130 + salissure 3,30 + prime chantier soumise 4,50
  const r = computePayslip(
    base({
      hourlyRate: 17.92, hoursNormal: 191, daysWorked: 26, hireDate: "2026-07-04", dependents: 0,
      panier: 806, transport: 130, salissure: 3.3, otherGross: 4.5,
    }),
  );
  it("salaire brut 4 366,52", () => expect(r.salaireBrut).toBe(4366.52));
  it("SBI 3 427,22", () => expect(r.sbi).toBe(3427.22));
  it("CNSS 153,54 / AMO 77,46", () => {
    expect(r.cnssSalarie).toBe(153.54);
    expect(r.amoSalarie).toBe(77.46);
  });
  it("abattement frais pro 1 199,53", () => expect(r.fraisPro).toBe(1199.53));
  it("SNI 1 996,69 / IR 0", () => {
    expect(r.sni).toBe(1996.69);
    expect(r.ir).toBe(0);
  });
  it("NET À PAYER 4 135,52", () => expect(r.netAPayer).toBe(4135.52));
  it("détail charges patronales conforme au modèle", () => {
    const d = r.employerDetail;
    expect(d.cnssCourtTerme).toBe(22.96);
    expect(d.cnssIpe).toBe(13.02);
    expect(d.cnssLongTerme).toBe(271.78);
    expect(d.af).toBe(219.34);
    expect(d.amoBase).toBe(77.46);
    expect(d.amoSolidarite).toBe(63.4);
    expect(d.tfp).toBe(54.84);
  });
  it("total charges patronales 722,80 (21,09 %) et coût 5 089,32", () => {
    expect(r.chargesPatronales).toBe(722.8);
    expect(r.employerDetail.totalRate).toBe(21.09);
    expect(r.coutTotalEmployeur).toBe(5089.32);
  });
});

describe("fonctions unitaires", () => {
  const p = getParams(2026);
  it("seniorityRate par seuils", () => {
    expect(seniorityRate(1, p)).toBe(0);
    expect(seniorityRate(2, p)).toBe(0.05);
    expect(seniorityRate(13, p)).toBe(0.15);
    expect(seniorityRate(30, p)).toBe(0.25);
  });
  it("irAnnuel = 0 sous 40 000", () => expect(irAnnuel(39000, p)).toBe(0));
  it("irAnnuel tranche 20 %", () => expect(irAnnuel(70000, p)).toBe(70000 * 0.2 - 10000));
});

describe("Exonération CNSS (dispositifs ANAPEC / stage)", () => {
  // Salaire au-dessus du SMIG pour des cotisations non nulles en droit commun.
  const inp = (over: Partial<PayrollInput> = {}) => base({ hourlyRate: 30, dependents: 1, ...over });

  it("droit commun : cotisations non nulles (référence)", () => {
    const r = computePayslip(inp());
    expect(r.cnssSalarie).toBeGreaterThan(0);
    expect(r.cnssPatronal).toBeGreaterThan(0);
    expect(r.af).toBeGreaterThan(0);
    expect(r.tfp).toBeGreaterThan(0);
  });

  it("totale (stage ANAPEC) : AUCUNE cotisation, ni salariale ni patronale", () => {
    const r = computePayslip(inp({ cnssExemption: "totale" }));
    expect(r.cnssSalarie).toBe(0);
    expect(r.amoSalarie).toBe(0);
    expect(r.cnssPatronal).toBe(0);
    expect(r.amoPatronal).toBe(0);
    expect(r.af).toBe(0);
    expect(r.tfp).toBe(0);
    expect(r.chargesPatronales).toBe(0);
    // Net = brut − IR (aucune retenue sociale).
    expect(r.netAPayer).toBe(round2(r.salaireBrut - r.ir));
  });

  it("patronale (TAHFIZ / IDMAJ) : part salariale due, part patronale exonérée", () => {
    const ref = computePayslip(inp());
    const r = computePayslip(inp({ cnssExemption: "patronale" }));
    // Parts salariales identiques au droit commun (retenues maintenues).
    expect(r.cnssSalarie).toBe(ref.cnssSalarie);
    expect(r.amoSalarie).toBe(ref.amoSalarie);
    expect(r.cnssSalarie).toBeGreaterThan(0);
    // Parts patronales à zéro.
    expect(r.cnssPatronal).toBe(0);
    expect(r.amoPatronal).toBe(0);
    expect(r.af).toBe(0);
    expect(r.tfp).toBe(0);
    // Net inchangé (le salarié paie sa part), mais coût employeur = brut seul.
    expect(r.netAPayer).toBe(ref.netAPayer);
    expect(r.coutTotalEmployeur).toBe(r.salaireBrut);
  });
});
