import { describe, it, expect } from "vitest";
import type { Employee, Firm } from "@/data/types";
import { PH, val, valDate, legalFileName, employerParagraph, renderLegalHtml, renderLegalPdf, sanitizeLegalText, sanitizeLegalDoc, buildRhDocLatex, type LegalBlock, type LegalDoc } from "./rh-legal";
import {
  buildContractDoc,
  contractMissingFields,
  contractPrefilled,
  contractFileName,
  CONTRACT_SCENARIOS,
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
    expect(t).toContain("Ameur Seflia"); // preset Gotion actualisé
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

  it("travail déterminé — article 14 « Fiche de poste » (ouvrier) + tronc commun actualisé", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine" })).blocks);
    expect(t).toContain("Article 14 — Fiche de poste, note de service et obligations professionnelles");
    expect(t).toContain("cadence de référence"); // version ouvrier
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

  it("AR ouvrier — variantes reflétées : préambule/dispense, logement, panier 47, deux sites", () => {
    const at = text(
      buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion", priorEmployee: true, housing: true, dailyBasket: "47" })).ar!.blocks,
    );
    expect(at).toContain("تمهيد — تصريحات مسبقة للطرفين"); // préambule
    expect(at).toContain("الإعفاء من فترة الاختبار"); // dispense d'essai
    expect(at).toContain("السكن العيني"); // logement en nature
    expect(at).toContain("موقع الإنتاج"); // site de production (Gotion → deux sites)
    expect(at).toContain("11,16 درهم"); // panier 47 → fraction réintégrée
  });

  it("AR ouvrier — nouvel embauché (Nador) : période d'essai, panier 27 exonéré, pas de deux-sites", () => {
    const at = text(
      buildContractDoc(contract({ model: "travail-determine", projectKey: "nador", priorEmployee: false })).ar!.blocks,
    );
    expect(at).toContain("المادة 4 — فترة الاختبار"); // période d'essai
    expect(at).not.toContain("تمهيد — تصريحات مسبقة"); // pas de préambule
    expect(at).toContain("معفى بالكامل"); // panier 27 intégralement exonéré
    expect(at).not.toContain("موقع الإنتاج"); // Nador n'a pas de site de production
  });

  it("CDD→CDI — version arabe attachée, renouvellement + évolution CDI + art. 6 bis (185)", () => {
    const d = buildContractDoc(contract({ model: "cdd-cdi", projectKey: "gotion" }));
    expect(d.ar).toBeDefined();
    const at = text(d.ar!.blocks);
    expect(d.ar!.heading).toBe("عقد عمل محدّد المدّة");
    expect(at).toContain("2.2. التجديد"); // renouvellement
    expect(at).toContain("التطوّر نحو عقد غير محدّد المدّة"); // évolution CDI
    expect(at).toContain("المادة 185"); // chômage technique
    expect(at).toContain("تكون العبرة بالنسخة العربية"); // la version arabe prévaut
  });

  it("ouvrier — ancien salarié : préambule + dispense d'essai (pas de période d'essai)", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", priorEmployee: true })).blocks);
    expect(t).toContain("PRÉAMBULE — DÉCLARATIONS PRÉALABLES DES PARTIES");
    expect(t).toContain("Dispense de période d'essai");
    expect(t).not.toContain("Article 4 — Période d'essai");
  });

  it("ouvrier — nouvel embauché : période d'essai (pas de préambule)", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", priorEmployee: false })).blocks);
    expect(t).toContain("Article 4 — Période d'essai");
    expect(t).not.toContain("PRÉAMBULE");
  });

  it("ouvrier — logement en nature (chantier éloigné)", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", housing: true })).blocks);
    expect(t).toContain("Logement en nature");
    expect(t).toContain("ni un avantage en nature ni un complément de salaire");
  });

  it("ouvrier — panier 47 réintègre 11,16 ; panier 27 (défaut) intégralement exonéré", () => {
    const t47 = text(buildContractDoc(contract({ model: "travail-determine", dailyBasket: "47" })).blocks);
    expect(t47).toContain("47,00 DH");
    expect(t47).toContain("11,16 DH par journée, étant réintégrée");
    const t27 = text(buildContractDoc(contract({ model: "travail-determine" })).blocks);
    expect(t27).toContain("27,00 DH");
    expect(t27).toContain("intégralement exonérée");
  });

  it("ouvrier — projet Gotion : site de production Sidi Taibi + transport en nature ; art. 2.5 et 6 bis", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion" })).blocks);
    expect(t).toContain("Sidi Taibi");
    expect(t).toContain("Transport assuré en nature");
    expect(t).toContain("réputé à durée indéterminée"); // art. 2.5
    expect(t).toContain("Article 6 bis — Interruption des travaux");
  });

  it("ouvrier — « Fait à » = ville du preset (Nador / Kénitra)", () => {
    expect(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador" })).faitA).toContain("Nador");
    expect(buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion" })).faitA).toContain("Kénitra");
  });

  it("ouvrier Nador (sans production) — art. 14 « Règlement intérieur » et art. 6 « chef de projet »", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador" })).blocks);
    expect(t).toContain("Article 14 — Règlement intérieur");
    expect(t).not.toContain("Article 14 — Fiche de poste");
    expect(t).toContain("fixés par le chef de projet"); // art. 6 version Nador
    expect(t).not.toContain("note de service affichée sur le chantier"); // pas la version Gotion
  });

  it("ouvrier Gotion (avec production) — art. 14 « Fiche de poste » et art. 6 « note de service »", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion" })).blocks);
    expect(t).toContain("Article 14 — Fiche de poste, note de service et obligations professionnelles");
    expect(t).toContain("note de service affichée sur le chantier"); // art. 6 version Gotion
    expect(t).not.toContain("fixés par le chef de projet");
  });

  it("ouvrier ancien salarié — art. 7 « déclaration d'entrée (reprise) » et art. 13.1 sans période d'essai", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador", priorEmployee: true })).blocks);
    expect(t).toContain("déclaration d'entrée (reprise)"); // art. 7 salarié déjà déclaré
    expect(t).not.toContain("en dehors de la période d'essai"); // art. 13.1 : dispense
    const tn = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador", priorEmployee: false })).blocks);
    expect(tn).toContain("en dehors de la période d'essai"); // nouvel embauché : mention présente
    expect(tn).not.toContain("déclaration d'entrée (reprise)");
  });

  it("AR ouvrier Nador — art. 14 « النظام الداخلي » ; Gotion — art. 14 « بطاقة المنصب »", () => {
    const nador = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador" })).ar!.blocks);
    expect(nador).toContain("المادة 14 — النظام الداخلي");
    expect(nador).toContain("رئيس المشروع"); // art. 6 chef de projet
    const gotion = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "gotion" })).ar!.blocks);
    expect(gotion).toContain("المادة 14 — بطاقة المنصب ومذكرة العمل والالتزامات المهنية");
  });

  it("AR ouvrier ancien salarié — art. 7 « التصريح بدخوله (الاستئناف) »", () => {
    const t = text(buildContractDoc(contract({ model: "travail-determine", projectKey: "nador", priorEmployee: true })).ar!.blocks);
    expect(t).toContain("التصريح بدخوله (الاستئناف)");
  });

  it("les 7 cas de contrat sont exposés et produisent chacun le bon document", () => {
    expect(CONTRACT_SCENARIOS).toHaveLength(7);
    for (const s of CONTRACT_SCENARIOS) {
      const d = buildContractDoc(
        contract({ model: s.model, projectKey: s.projectKey, priorEmployee: s.priorEmployee, housing: s.housing, dailyBasket: s.dailyBasket }),
      );
      expect(d.heading.length).toBeGreaterThan(0);
      const t = text(d.blocks);
      if (s.priorEmployee) expect(t).toContain("PRÉAMBULE — DÉCLARATIONS PRÉALABLES DES PARTIES");
      if (s.housing) expect(t).toContain("Logement en nature");
      if (s.dailyBasket === "47") expect(t).toContain("11,16 DH par journée, étant réintégrée");
    }
    // Le dernier cas est bien le CDD → CDI.
    expect(CONTRACT_SCENARIOS[6].model).toBe("cdd-cdi");
  });

  it("CDD→CDI : titre CDD, renouvellement + évolution CDI + plafond 2 ans (art. 2)", () => {
    const d = buildContractDoc(contract({ model: "cdd-cdi" }));
    expect(d.heading).toBe("CONTRAT À DURÉE DÉTERMINÉE");
    const t = text(d.blocks);
    expect(t).toContain("2.2. Renouvellement");
    expect(t).toContain("2.3. Évolution vers un CDI");
    expect(t).toContain("n'excédera pas deux (2) ans"); // plafond 2.4
    expect(t).toContain("réputé à durée indéterminée");
  });

  it("CDD→CDI : art. 6 bis interruption d'un chantier — réaffectation + chômage technique art. 185", () => {
    const t = text(buildContractDoc(contract({ model: "cdd-cdi" })).blocks);
    expect(t).toContain("Article 6 bis — Interruption d'un chantier");
    expect(t).toContain("réaffecte à un autre site ou chantier");
    expect(t).toContain("chômage technique (article 185");
    expect(t).toContain("50 % du salaire");
  });

  it("CDD→CDI : poste polyvalent multi-sites incluant le site de production ; panier paramétrable", () => {
    const t = text(buildContractDoc(contract({ model: "cdd-cdi", projectKey: "gotion", dailyBasket: "47" })).blocks);
    expect(t).toContain("Sidi Taibi");
    expect(t).toContain("nature polyvalente de son emploi");
    expect(t).toContain("11,16 DH par journée, étant réintégrée");
  });

  it("CDD→CDI : « Date de fin » est un champ requis", () => {
    expect(contractMissingFields(contract({ model: "cdd-cdi", endDate: "" }))).toContain("Date de fin");
    expect(contractMissingFields(contract({ model: "cdd-cdi", endDate: "2026-12-31" }))).not.toContain("Date de fin");
  });

  it("rendu PDF : titre SANS cadre + filet d'accent (gabarit Belkora), mise en page paginée", async () => {
    const warnings: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { warnings.push(a.map(String).join(" ")); };
    let doc;
    try {
      doc = await renderLegalPdf(firm, buildContractDoc(contract()));
    } finally {
      console.error = orig;
    }
    // Contrat complet (16 articles + RGPD détaillé) → plusieurs pages, paginées proprement.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(doc.output().length).toBeGreaterThan(1000);
    // A4 portrait ; aucun débordement de tableau (décompte STC éventuel).
    expect(doc.internal.pageSize.getWidth()).toBeLessThan(doc.internal.pageSize.getHeight());
    expect(warnings.join(" ")).not.toContain("could not fit");
  });

  it("rendu HTML : plus de cadre de titre, un filet d'accent le remplace", () => {
    const html = renderLegalHtml(firm, buildContractDoc(contract()));
    expect(html).toContain('class="accentbar"');
    expect(html).not.toContain('class="titlebox"');
  });

  it("rendu HTML : couleurs de la palette Miya = couleurs EXACTES du LaTeX mbd-style.sty", () => {
    const html = renderLegalHtml(firm, buildContractDoc(contract())); // Miya : palette par défaut
    expect(html).toContain("#2C5F2D"); // mbdvertfonce (titre, intitulés d'articles)
    expect(html).toContain("#97BC62"); // mbdvertclair (filet d'accent, filet d'en-tête)
    expect(html).toContain("#666666"); // mbdgris (texte secondaire)
    expect(html).toContain("var(--olive)"); // filet d'en-tête au vert médian, pas au vert foncé
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

describe("buildRhDocLatex — export LaTeX des documents RH (indépendant du bulletin)", () => {
  const doc: LegalDoc = {
    fileTitle: "Attestation",
    heading: "ATTESTATION DE TRAVAIL",
    blocks: [{ k: "p", t: "Nous attestons que **M. Yassine** est employé." }],
    faitA: "Fait à Marrakech, le 01/01/2026.",
    signatures: [{ title: "Miya BELKORA", lines: ["Gérante"], caption: "(Signature et cachet)" }],
  };

  it("gabarit par défaut : document LaTeX complet, titre + société, sans astérisque markdown", () => {
    const tex = buildRhDocLatex(firm, doc, emp(), undefined);
    expect(tex).toContain("\\documentclass");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("ATTESTATION DE TRAVAIL");
    expect(tex).toContain("MIYA BELKORA DESIGN SARL");
    expect(tex).toContain("\\textbf{M. Yassine}"); // **gras** rendu, pas d'astérisques
    expect(tex).not.toContain("**");
  });

  it("template société : substitution des tokens (firm, employee, doc, signataire)", () => {
    const template = "\\doc{{{doc.title}}} par {{firm.name}} pour {{employee.last_name}} — {{signatory.role}}";
    const tex = buildRhDocLatex(firm, doc, emp(), template);
    expect(tex).toBe("\\doc{ATTESTATION DE TRAVAIL} par Miya Belkora Design SARL pour El Amrani — Gérante");
    expect(tex).not.toContain("{{"); // tous les tokens remplacés
  });

  it("échappe les caractères LaTeX des valeurs (un « 25 % » ne casse plus la compilation)", () => {
    const docPct: LegalDoc = {
      fileTitle: "T",
      heading: "Prime & taux",
      blocks: [{ k: "p", t: "Majoration de 25 % appliquée." }],
    };
    const tex = buildRhDocLatex(firm, docPct, emp(), "T={{doc.title}} | B={{doc.body}}");
    expect(tex).toContain("Prime \\& taux"); // & échappé dans doc.title
    expect(tex).toContain("25 \\%"); // % échappé dans doc.body
    expect(tex).not.toContain("25 %"); // plus aucun % nu (qui démarrerait un commentaire)
  });
});

describe("sanitizeLegalText — retrait des caractères « IA » superflus des documents", () => {
  it("remplace tiret cadratin, point médian, points de suspension, flèche et ≤ par des équivalents sobres", () => {
    expect(sanitizeLegalText("le salarié — ci-après « le Salarié » — reconnaît")).toBe("le salarié - ci-après « le Salarié » - reconnaît");
    expect(sanitizeLegalText("Ouvrier · Nador · éloigné")).toBe("Ouvrier - Nador - éloigné");
    expect(sanitizeLegalText("à définir…")).toBe("à définir...");
    expect(sanitizeLegalText("CDD → CDI")).toBe("CDD vers CDI");
    expect(sanitizeLegalText("mise à pied ≤ 8 jours")).toBe("mise à pied au plus 8 jours");
  });

  it("neutralise aussi le signe multiplication et le trait d'union insécable", () => {
    expect(sanitizeLegalText("2 × 8 heures")).toBe("2 x 8 heures");
    expect(sanitizeLegalText("mi‑temps")).toBe("mi-temps");
  });

  it("CONSERVE la typographie française légitime (guillemets, accents, apostrophe)", () => {
    const s = "L'employeur « Miya Belkora » à Témara reste équitable.";
    expect(sanitizeLegalText(s)).toBe(s);
  });

  it("le placeholder pointillé devient une ligne de points ASCII (forme à remplir)", () => {
    expect(sanitizeLegalText(PH)).not.toMatch(/…/);
    expect(sanitizeLegalText(PH)).toMatch(/^\.+$/);
  });

  it("sanitizeLegalDoc nettoie titres, blocs, signatures et variante arabe", () => {
    const doc: LegalDoc = {
      fileTitle: "t", heading: "CONTRAT — TRAVAIL", subheading: "Ouvrier · Nador",
      blocks: [{ k: "p", t: "le salarié — présent" }, { k: "ul", items: ["clause →"] }],
      faitA: "Fait à X, le …", signatures: [{ title: "Pour l'Employeur —", lines: ["A · B"], caption: "(Signature)" }],
      ar: { heading: "عقد", blocks: [{ k: "p", t: "بند · مهم" }] },
    };
    const c = sanitizeLegalDoc(doc);
    const joined = JSON.stringify(c);
    for (const bad of ["—", "·", "…", "→"]) expect(joined).not.toContain(bad);
    expect(c.ar!.blocks[0]).toEqual({ k: "p", t: "بند - مهم" });
  });

  it("le HTML rendu d'un document remplace les caractères spéciaux du corps", () => {
    const doc: LegalDoc = {
      fileTitle: "t", heading: "TEST", blocks: [{ k: "p", t: "abc — def · ghi… → jkl" }],
      faitA: "Fait à Y, le 01/01/2026.",
      signatures: [{ title: "Le Gérant", lines: ["Miya BELKORA"], caption: "(Signature et cachet)" }],
    };
    const html = renderLegalHtml(firm, doc);
    expect(html).toContain("abc - def - ghi... vers jkl");
    expect(html).not.toContain("abc — def");
  });
});
