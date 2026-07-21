import { describe, it, expect } from "vitest";
import { bodyParagraphs, missingFields, docFileName, PH, type RhDocView } from "./rh-documents";
import type { Employee, Firm } from "@/data/types";

const firm: Firm = {
  id: "f1",
  name: "Miya Belkora Design SARL",
  ice: "0027",
  if_fiscal: "45",
  rc: "RC 45",
  cnss_affiliation: "78",
  regime: "SMIG",
  logo_path: "/logo-miya.png",
  city: "Marrakech",
  address: "Route de l'Ourika",
  signatory_name: "Miya BELKORA",
  signatory_role: "Gérante",
};

const emp = (o: Partial<Employee>): Employee => ({
  id: "e1",
  firm_id: "f1",
  first_name: "Yassine",
  last_name: "El Amrani",
  hire_date: "2019-03-01",
  contract_type: "CDI",
  base_hourly_rate: 90,
  monthly_hours: 191,
  dependents: 0,
  is_active: true,
  cin: "EE123456",
  cnss_number: "112233445",
  position: "Concepteur paysagiste",
  ...o,
});

const base = (o: Partial<RhDocView> = {}): RhDocView => ({
  firm,
  employee: emp({}),
  type: "attestation-travail",
  issueDate: "2026-07-08",
  ...o,
});

describe("bodyParagraphs — corps-type par document", () => {
  it("attestation de travail : atteste, emploi en cours, nom en majuscules", () => {
    const p = bodyParagraphs(base());
    expect(p[0]).toContain("atteste par la présente que");
    expect(p[1]).toContain("YASSINE EL AMRANI");
    expect(p[2]).toContain("est employé");
    expect(p[2]).toContain("depuis le 01/03/2019");
    expect(p.join(" ")).not.toContain("perçoit");
  });

  it("attestation de salaire : ajoute la rémunération", () => {
    const p = bodyParagraphs(base({ type: "attestation-salaire", salary: "4 500,00 DH net" }));
    expect(p.join(" ")).toContain("rémunération mensuelle de 4 500,00 DH net");
  });

  it("certificat de travail : certifie, passé, avec date de fin", () => {
    const p = bodyParagraphs(base({ type: "certificat-travail", endDate: "2026-06-30" }));
    expect(p[0]).toContain("certifie par la présente que");
    expect(p.join(" ")).toContain("a été employé");
    expect(p.join(" ")).toContain("du 01/03/2019 au 30/06/2026");
    expect(p.join(" ")).toContain("libre de tout engagement");
  });
});

describe("accords de civilité", () => {
  it("Madame → accords féminins", () => {
    const p = bodyParagraphs(base({ civility: "Mme" })).join(" ");
    expect(p).toContain("Madame");
    expect(p).toContain("est employée");
    expect(p).toContain("immatriculée");
    expect(p).toContain("l'intéressée");
  });

  it("Monsieur → accords masculins", () => {
    const p = bodyParagraphs(base({ civility: "M." })).join(" ");
    expect(p).toContain("Monsieur");
    expect(p).toContain("est employé ");
    expect(p).toContain("l'intéressé ");
  });

  it("non précisé → forme neutre (e)", () => {
    const p = bodyParagraphs(base({ civility: null })).join(" ");
    expect(p).toContain("employé(e)");
    expect(p).toContain("immatriculé(e)");
  });
});

describe("zéro invention — placeholders", () => {
  it("CIN/CNSS/poste absents → placeholder pointillé dans le corps", () => {
    const p = bodyParagraphs(
      base({ employee: emp({ cin: undefined, cnss_number: undefined, position: undefined }), cnss: undefined }),
    ).join(" ");
    expect(p).toContain(PH);
  });

  it("missingFields liste les champs manquants sans en inventer", () => {
    const m = missingFields(base({ employee: emp({ cin: undefined }), civility: null }));
    expect(m).toContain("N° CIN");
    expect(m).toContain("Civilité (accords « (e) » par défaut)");
  });

  it("attestation de salaire sans salaire → champ manquant signalé", () => {
    const m = missingFields(base({ type: "attestation-salaire" }));
    expect(m).toContain("Rémunération mensuelle");
  });

  it("dossier complet + civilité → aucun champ manquant", () => {
    const m = missingFields(base({ civility: "M." }));
    expect(m).toEqual([]);
  });
});

describe("nom de fichier", () => {
  it("suit le gabarit du skill : <Type>_<NOM>.pdf", () => {
    expect(docFileName(base())).toBe("ATTESTATION_DE_TRAVAIL_Yassine_El_Amrani.pdf");
  });
});

describe("attestation de stage — fidèle au modèle MBD", () => {
  const stage = (o: Partial<RhDocView> = {}): RhDocView =>
    base({
      type: "attestation-stage",
      stageStart: "2026-04-14",
      stageType: "Stage de fin d'études (PFE)",
      formation: "Master en Business Administration",
      stageDuration: "six (6) mois",
      ...o,
    });

  it("intro : identité légale (RC, ICE, IF, siège) + « soussignée » si Gérante", () => {
    const p = bodyParagraphs(stage());
    expect(p[0]).toContain("Je soussignée");
    expect(p[0]).toContain("MIYA BELKORA DESIGN SARL");
    expect(p[0]).toContain("Registre du Commerce sous le n° RC 45");
    expect(p[0]).toContain("ICE 0027");
    expect(p[0]).toContain("atteste par la présente que");
  });

  it("corps : effectue depuis la date, type de stage, formation, durée, en cours", () => {
    const p = bodyParagraphs(stage()).join(" ");
    expect(p).toContain("YASSINE EL AMRANI");
    expect(p).toContain("effectue, depuis le 14/04/2026");
    expect(p).toContain("un Stage de fin d'études (PFE)");
    expect(p).toContain("formation en Master en Business Administration");
    expect(p).toContain("durée prévue de six (6) mois");
    expect(p).toContain("toujours en cours");
  });

  it("clôture : mention soutenance pour un PFE", () => {
    const p = bodyParagraphs(stage()).join(" ");
    expect(p).toContain("pour les besoins de sa soutenance");
    expect(p).toContain("servir et faire valoir ce que de droit");
  });

  it("stage achevé : date de fin injectée, pas « en cours »", () => {
    const p = bodyParagraphs(stage({ stageOngoing: false, endDate: "2026-10-14" })).join(" ");
    expect(p).toContain("s'est achevé le 14/10/2026");
    expect(p).not.toContain("toujours en cours");
  });

  it("missions confiées insérées après « s'est vu confier »", () => {
    const p = bodyParagraphs(
      stage({ stageMissions: "s'est vu confier le périmètre People & Performance." }),
    ).join(" ");
    expect(p).toContain("Dans le cadre de ce stage");
    expect(p).toContain("s'est vu confier le périmètre People & Performance.");
  });

  it("bodyParagraphs route bien vers le corps stage", () => {
    expect(bodyParagraphs(stage())[0]).toContain("agissant en qualité de");
  });

  it("zéro invention : champs stage absents → placeholder + liste dédiée", () => {
    const v = base({ type: "attestation-stage" });
    expect(bodyParagraphs(v).join(" ")).toContain(PH);
    const m = missingFields(v);
    expect(m).toContain("Date de début du stage");
    expect(m).toContain("Type de stage");
    expect(m).toContain("Formation / diplôme");
    expect(m).toContain("Durée prévue du stage");
    // champs emploi non pertinents pour un stage : absents de la liste
    expect(m).not.toContain("N° CNSS");
    expect(m).not.toContain("Poste");
    expect(m).not.toContain("Date d'embauche");
  });

  it("dossier stage complet → aucun champ manquant", () => {
    const m = missingFields(stage({ civility: "Mme" }));
    expect(m).toEqual([]);
  });

  it("nom de fichier : ATTESTATION_DE_STAGE_<NOM>.pdf", () => {
    expect(docFileName(stage())).toBe("ATTESTATION_DE_STAGE_Yassine_El_Amrani.pdf");
  });
});
