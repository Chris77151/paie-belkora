import { describe, it, expect } from "vitest";
import type { Employee, Firm } from "@/data/types";
import { PH, val, valDate, legalFileName, employerParagraph, renderLegalHtml, renderLegalPdf, type LegalBlock } from "./rh-legal";
import {
  buildContractDoc,
  contractMissingFields,
  contractPrefilled,
  contractFileName,
  type RhContractView,
} from "./rh-contracts";
import {
  buildDisciplineDoc,
  disciplineMissingFields,
  DISCIPLINE_TITLE,
  type RhDisciplineView,
} from "./rh-discipline";

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

const emp = (o: Partial<Employee> = {}): Employee => ({
  id: "e1",
  firm_id: "f1",
  first_name: "Yassine",
  last_name: "El Amrani",
  hire_date: "2019-03-01",
  contract_type: "CDD",
  base_hourly_rate: 90,
  monthly_hours: 191,
  dependents: 0,
  is_active: true,
  cin: "EE123456",
  cnss_number: "112233445",
  position: "Ouvrier paysagiste",
  site: "Chantier Gotion",
  ...o,
});

/* -------- helpers -------- */
function text(blocks: LegalBlock[]): string {
  return blocks
    .map((b) => {
      if (b.k === "p" || b.k === "h" || b.k === "center") return b.t;
      if (b.k === "ul" || b.k === "check") return b.items.join(" ");
      return "";
    })
    .join(" \n ");
}

/* ================================================================= rh-legal ================================================================= */
describe("rh-legal — utilitaires zéro invention", () => {
  it("val() renvoie la valeur ou le placeholder pointillé", () => {
    expect(val("EE123")).toBe("EE123");
    expect(val("")).toBe(PH);
    expect(val(undefined)).toBe(PH);
  });

  it("valDate() formate en FR ou placeholder", () => {
    expect(valDate("2026-07-09")).toBe("09/07/2026");
    expect(valDate(undefined)).toBe(PH);
    expect(valDate("")).toBe(PH);
  });

  it("legalFileName() normalise accents et espaces", () => {
    expect(legalFileName("CONTRAT À DURÉE DÉTERMINÉE", "Yassine El Amrani")).toBe(
      "CONTRAT_A_DUREE_DETERMINEE_Yassine_El_Amrani.pdf",
    );
  });

  it("employerParagraph() cite la raison sociale et le signataire réels", () => {
    const p = employerParagraph(firm);
    expect(p).toContain("MIYA BELKORA DESIGN SARL");
    expect(p).toContain("Miya BELKORA");
    expect(p).toContain("ICE 0027");
  });
});

/* ================================================================= Contrat RH ================================================================= */
const contract = (o: Partial<RhContractView> = {}): RhContractView => ({
  firm,
  employee: emp(),
  model: "cdd-chef",
  projectKey: "gotion",
  issueDate: "2026-07-09",
  ...o,
});

describe("Contrat RH — corps fidèle au gabarit MBD", () => {
  it("CDD : titre, motif art. 16, renouvellement art. 17, employeur nominatif", () => {
    const d = buildContractDoc(contract());
    expect(d.heading).toBe("CONTRAT À DURÉE DÉTERMINÉE");
    const t = text(d.blocks);
    expect(t).toContain("accroissement temporaire d'activité");
    expect(t).toContain("article 16, al. 2");
    expect(t).toContain("douze (12) mois");
    expect(t).toContain("MIYA BELKORA DESIGN SARL");
    expect(t).toContain("Sidi Yahya El Gharb");
  });

  it("travail déterminé : terme = achèvement des travaux (art. 33), PV de fin", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine" })).blocks);
    expect(t).toContain("pour accomplir un travail déterminé");
    expect(t).toContain("achèvement des travaux");
    expect(t).toContain("procès-verbal de fin de travaux");
  });

  it("projet Nador préremplit lieu + juridiction", () => {
    const t = text(buildContractDoc(contract({ projectKey: "nador" })).blocks);
    expect(t).toContain("Nador");
    expect(t).toContain("Tribunal de Première Instance de Nador");
  });

  it("CDD chef — contenu actualisé (Nador) : requalification 2.4, essai détaillé, RGPD 11.9, art. 14 encadrement, légalisation art. 15", () => {
    const d = buildContractDoc(contract({ model: "cdd-chef" }));
    const t = text(d.blocks);
    // Requalification en CDI si poursuite (art. 17 in fine)
    expect(t).toContain("réputé à durée indéterminée");
    // Période d'essai détaillée
    expect(t).toContain("réputé définitivement embauché dès le premier jour");
    // Rémunération : espèces exceptionnelles + sans prorata du plafond
    expect(t).toContain("sans prorata du plafond");
    // Note de service (art. 24) dans la durée du travail
    expect(t).toContain("note de service affichée sur le chantier");
    // Indemnité compensatrice congés : art. 231
    expect(t).toContain("(Art. 231 du Code du Travail)");
    // RGPD étendu jusqu'à la violation de données
    expect(t).toContain("11.9. Violation de données");
    // Article 14 propre au chef de projet
    expect(t).toContain("missions d'encadrement et de supervision du chantier");
    // Légalisation des signatures : art. 15 (et non art. 18)
    expect(t).toContain("l'article 15 du Code du Travail");
    expect(t).not.toContain("l'article 18 du Code du Travail");
    expect(d.legalNote).toContain("Art. 15 Code du Travail");
  });

  it("travail déterminé — conserve l'article 14 « Règlement intérieur » et bénéficie du tronc commun actualisé", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine" })).blocks);
    expect(t).toContain("Article 14 — Règlement intérieur");
    expect(t).toContain("(Art. 231 du Code du Travail)"); // tronc commun actualisé
    expect(t).toContain("11.9. Violation de données");
    expect(t).not.toContain("missions d'encadrement"); // pas l'art. 14 du chef
  });

  it("travail déterminé — version arabe (RTL) attachée, transcrite du contrat bilingue", () => {
    const d = buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion" }));
    expect(d.ar).toBeDefined();
    const ar = d.ar!;
    expect(ar.heading).toBe("عقد عمل لإنجاز شغل معيّن");
    const at = text(ar.blocks);
    expect(at).toContain("المشغّل"); // l'employeur
    expect(at).toContain("الأجير"); // le salarié
    expect(at).toContain("المادة 33"); // achèvement des travaux (art. 33)
    expect(at).toContain("المادة 6 مكرر"); // arrêt des travaux (article 6 bis)
    expect(at).toContain("تكون العبرة بالنسخة العربية"); // la version arabe prévaut
    expect(at).toContain(PH); // zéro invention : données absentes → pointillés
  });

  it("CDD chef — pas de version arabe (non fournie)", () => {
    expect(buildContractDoc(contract({ model: "cdd-chef" })).ar).toBeUndefined();
  });

  it("rendu PDF : titre SANS cadre + filet d'accent (gabarit Belkora), document non vide", async () => {
    const doc = await renderLegalPdf(firm, buildContractDoc(contract()));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output().length).toBeGreaterThan(1000);
  });

  it("rendu HTML : plus de cadre de titre, un filet d'accent le remplace", () => {
    const html = renderLegalHtml(firm, buildContractDoc(contract()));
    expect(html).toContain('class="accentbar"');
    expect(html).not.toContain('class="titlebox"');
  });

  it("zéro invention : dates et salaire absents → placeholder", () => {
    const t = text(buildContractDoc(contract()).blocks);
    expect(t).toContain(PH); // date début/fin/salaire non fournis
  });

  it("salaire fourni est injecté, jamais inventé sinon", () => {
    const t = text(buildContractDoc(contract({ dailyWage: "250,00" })).blocks);
    expect(t).toContain("250,00 DH");
  });

  it("missingFields liste les champs à compléter (CDD)", () => {
    const m = contractMissingFields(contract({ civility: null }));
    expect(m).toContain("Civilité");
    expect(m).toContain("Date de début");
    expect(m).toContain("Date de fin");
    expect(m).toContain("Salaire journalier brut");
    expect(m).toContain("Nationalité");
  });

  it("dossier complet → moins de manquants, CNSS/CIN repris du salarié", () => {
    const m = contractMissingFields(
      contract({
        model: "travail-determine",
        civility: "M.",
        birthDate: "1990-04-12",
        birthPlace: "Marrakech",
        nationality: "Marocaine",
        address: "Douar X",
        startDate: "2026-08-01",
        dailyWage: "220",
        signatoryName: "Miya BELKORA",
      }),
    );
    expect(m).not.toContain("N° CIN");
    expect(m).not.toContain("N° CNSS");
    expect(m).not.toContain("Date de début");
    expect(m).not.toContain("Signataire employeur");
  });

  it("prefilled expose les données réelles du dossier", () => {
    const rows = contractPrefilled(contract());
    expect(rows.find((r) => r.label === "Salarié")?.value).toBe("YASSINE EL AMRANI");
    expect(rows.find((r) => r.label === "CIN")?.value).toBe("EE123456");
  });

  it("nom de fichier : <Titre>_<NOM>.pdf", () => {
    expect(contractFileName(contract())).toBe("CONTRAT_A_DUREE_DETERMINEE_Yassine_El_Amrani.pdf");
  });
});

/* ================================================================= Kit disciplinaire ================================================================= */
const disc = (o: Partial<RhDisciplineView> = {}): RhDisciplineView => ({
  firm,
  employee: emp(),
  type: "avertissement",
  issueDate: "2026-07-09",
  ...o,
});

describe("Kit disciplinaire — sanctions graduées", () => {
  it("avertissement : art. 37, rappel faute grave art. 39, faits injectés", () => {
    const d = buildDisciplineDoc(disc({ faultFacts: "Retard répété de 2 h", faultDate: "2026-07-01" }));
    expect(d.heading).toBe("AVERTISSEMENT");
    const t = text(d.blocks);
    expect(t).toContain("article 37 du Code du travail");
    expect(t).toContain("article 39");
    expect(t).toContain("Retard répété de 2 h");
    expect(t).toContain("01/07/2026");
  });

  it("blâme : 2e degré, référence art. 37-38", () => {
    const t = text(buildDisciplineDoc(disc({ type: "blame" })).blocks);
    expect(t).toContain("blâme");
    expect(t).toContain("articles 37 et 38");
  });

  it("convocation : entretien préalable art. 62-63, délai 8 jours", () => {
    const t = text(buildDisciplineDoc(disc({ type: "convocation", auditionDate: "2026-07-15", auditionTime: "10 h" })).blocks);
    expect(t).toContain("articles 62 et 63");
    expect(t).toContain("huit (8) jours");
    expect(t).toContain("15/07/2026");
  });

  it("mise en demeure : cases par défaut si aucune cochée, délai 48 h", () => {
    const d = buildDisciplineDoc(disc({ type: "mise-en-demeure", faultDate: "2026-07-02" }));
    const checkBlock = d.blocks.find((b) => b.k === "check");
    expect(checkBlock && checkBlock.k === "check" && checkBlock.items.length).toBeGreaterThan(0);
    expect(text(d.blocks)).toContain("48 h");
  });

  it("mise en demeure : seules les cases cochées apparaissent", () => {
    const d = buildDisciplineDoc(disc({ type: "mise-en-demeure", mAbsence: true, faultDate: "2026-07-02" }));
    const checkBlock = d.blocks.find((b) => b.k === "check");
    expect(checkBlock && checkBlock.k === "check" && checkBlock.items.length).toBe(1);
  });

  it("décision de licenciement : faute grave art. 38/39, sans préavis ni indemnité", () => {
    const t = text(buildDisciplineDoc(disc({ type: "decision-licenciement", effectDate: "2026-07-20" })).blocks);
    expect(t).toContain("articles 38 et 39");
    expect(t).toContain("sans préavis ni indemnité");
    expect(t).toContain("solde de tout compte");
  });

  it("titres de tous les types définis", () => {
    expect(DISCIPLINE_TITLE["mise-a-pied"]).toBe("MISE À PIED DISCIPLINAIRE");
    expect(DISCIPLINE_TITLE["decision-licenciement"]).toBe("DÉCISION DE LICENCIEMENT POUR FAUTE GRAVE");
  });

  it("missingFields : avertissement sans faits ni site → signalés", () => {
    const m = disciplineMissingFields(disc({ employee: emp({ site: undefined }) }));
    expect(m).toContain("Faits reprochés");
    expect(m).toContain("Chantier / site");
    expect(m).toContain("Date du manquement");
  });

  it("missingFields : décision exige CIN + date d'effet", () => {
    const m = disciplineMissingFields(disc({ type: "decision-licenciement", employee: emp({ cin: undefined }) }));
    expect(m).toContain("N° CIN");
    expect(m).toContain("Date d'effet du licenciement");
  });
});
