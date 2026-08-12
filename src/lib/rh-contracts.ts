/**
 * Contrat RH — sous-volet B.1 du skill « documents-rh-conformes », porté au navigateur.
 *
 * Deux modèles de contrats de travail au gabarit Miya Belkora Design (chantiers d'aménagement
 * paysager), calqués sur les modèles LaTeX du skill :
 *   - `cdd-chef`          : CDD — accroissement temporaire (art. 16 al.2), paysagiste chef de projet, 3 mois.
 *   - `travail-determine` : contrat pour accomplir un travail déterminé (art. 16 al.1 & 33), ouvrier.
 *
 * Les données salarié/entité viennent du store (réelles) ; tout champ absent (dates, salaire,
 * nationalité, adresse…) est rendu en placeholder pointillé et listé — ZÉRO INVENTION. Un contrat
 * est un acte structurant : l'app rappelle de le faire valider (agent legal) avant signature.
 */
import type { Employee, Firm } from "@/data/types";
import {
  employerParagraph,
  fullName,
  legalFileName,
  PH,
  renderLegalHtml,
  renderLegalPdf,
  val,
  valDate,
  type Civility,
  type LegalBlock,
  type LegalDoc,
} from "./rh-legal";
import { dateFr } from "./format";
import { buildTravailDetermineAr, buildCddCdiAr } from "./rh-contracts-ar";

export type ContractModel = "cdd-chef" | "travail-determine" | "cdd-cdi";
/** Civilité — définition unique dans `rh-legal.ts`, ré-exportée pour les pages. */
export type { Civility };

export const CONTRACT_MODELS: { value: ContractModel; label: string; hint: string }[] = [
  { value: "cdd-chef", label: "CDD chantier — chef de projet", hint: "Accroissement temporaire (art. 16-17) · 3 mois" },
  { value: "travail-determine", label: "Contrat pour travail déterminé — ouvrier", hint: "Terme = achèvement des travaux (art. 16 al.1 & 33)" },
  { value: "cdd-cdi", label: "CDD ouvrier — renouvelable, vocation CDI", hint: "Durée déterminée · renouvelable · évolution vers CDI (art. 16-17)" },
];

/** Preset d'un projet chantier (préremplit lieu, juridiction, site de production, ville d'arrêté). */
export interface ContractProject {
  label: string;
  location: string;
  jurisdiction: string;
  /** Site de production des végétaux (phase préparatoire), le cas échéant (ex. Gotion → Sidi Taibi). */
  productionSite?: string;
  /** Ville du « Fait à … » (siège du tribunal), sinon déduite du lieu. */
  faitCity?: string;
}

/** Projets chantier connus (préremplissent lieu d'exécution, juridiction, site de production). */
export const CONTRACT_PROJECTS: Record<string, ContractProject> = {
  gotion: {
    label: "Projet Gotion Power Morocco",
    location: "l'Atlantic Free Zone, commune d'Ameur Seflia (province de Kénitra)",
    jurisdiction: "Tribunal de Première Instance de Kénitra, section sociale",
    productionSite: "Sidi Taibi (province de Kénitra)",
    faitCity: "Kénitra",
  },
  nador: {
    label: "Projet Nador Marchica",
    location: "Nador (province de Nador, région de l'Oriental)",
    jurisdiction: "Tribunal de Première Instance de Nador, section sociale",
    faitCity: "Nador",
  },
};

export interface RhContractView {
  firm: Firm;
  employee: Employee;
  model: ContractModel;
  civility?: Civility;
  /** Clé de CONTRACT_PROJECTS, ou libellé libre saisi. */
  projectKey?: string;
  projectLabel?: string;
  location?: string;
  jurisdiction?: string;
  /** Données personnelles complémentaires (jamais dans le store minimal). */
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  address?: string;
  cin?: string;
  cnss?: string;
  /** Poste précisé (par défaut : employee.position). */
  jobTitle?: string;
  /** Dates du contrat. */
  startDate?: string;
  endDate?: string;
  /** Salaire journalier brut (texte libre, ex. « 250,00 »). */
  dailyWage?: string;
  /** Ancien salarié déjà connu de l'entreprise → préambule + dispense de période d'essai (art. 13-14). */
  priorEmployee?: boolean;
  /** Ouvrier logé en nature (chantier éloigné) → clause de logement en nature. */
  housing?: boolean;
  /** Indemnité de panier journalière (texte, ex. « 27 » ou « 47 »). Défaut : 27. */
  dailyBasket?: string;
  /** Date de délivrance / « Fait à ». */
  issueDate: string;
  issueCity?: string;
  signatoryName?: string;
  signatoryRole?: string;
}

function civilityLabel(c: Civility): string {
  return c === "Mme" ? "Madame" : c === "M." ? "Monsieur" : "Monsieur / Madame";
}

function project(v: RhContractView) {
  const preset = v.projectKey ? CONTRACT_PROJECTS[v.projectKey] : undefined;
  return {
    label: v.projectLabel?.trim() || preset?.label || PH,
    location: v.location?.trim() || preset?.location || PH,
    jurisdiction: v.jurisdiction?.trim() || preset?.jurisdiction || PH,
    productionSite: preset?.productionSite,
    faitCity: preset?.faitCity,
  };
}

/** Plafond journalier d'exonération de l'indemnité de panier : 2 × SMIG horaire (17,92). */
const PANIER_CAP = 35.84;

/** Paragraphe « 5.2 Indemnité de panier » adapté au montant (exonéré, ou fraction réintégrée). PURE. */
export function panierParagraph(dailyBasket?: string): string {
  const amount = Number((dailyBasket ?? "27").trim().replace(",", ".")) || 27;
  const shown = amount.toFixed(2).replace(".", ",");
  const base = `5.2. Indemnité de panier. En sus du salaire de base, le Salarié perçoit une indemnité de panier (repas) de ${shown} DH par journée de travail effectif. Cette indemnité a la nature d'une indemnité représentative de frais professionnels ; `;
  if (amount <= PANIER_CAP) {
    return `${base}elle demeure inférieure au plafond légal d'exonération (deux fois le taux horaire du SMIG, soit 35,84 DH par jour) et est donc intégralement exonérée de cotisations sociales et d'impôt sur le revenu. Elle n'est pas due en cas d'absence ou de repas fourni par l'Employeur.`;
  }
  const excess = (amount - PANIER_CAP).toFixed(2).replace(".", ",");
  return `${base}elle est exonérée de cotisations sociales et d'impôt sur le revenu dans la limite du plafond légal (deux fois le taux horaire du SMIG, soit 35,84 DH par jour), la fraction excédentaire, soit ${excess} DH par journée, étant réintégrée dans l'assiette soumise aux cotisations et à l'impôt. Elle n'est pas due en cas d'absence ou de repas fourni par l'Employeur.`;
}

export const CONTRACT_TITLE: Record<ContractModel, string> = {
  "cdd-chef": "CONTRAT À DURÉE DÉTERMINÉE",
  "travail-determine": "CONTRAT POUR ACCOMPLIR UN TRAVAIL DÉTERMINÉ",
  "cdd-cdi": "CONTRAT À DURÉE DÉTERMINÉE",
};

/* ------------------------------------------------------------------ bloc « parties » commun ------------------------------------------------------------------ */
function partiesBlocks(v: RhContractView): LegalBlock[] {
  const e = v.employee;
  const salarie = [
    `Civilité : ${civilityLabel(v.civility ?? null)}`,
    `Prénom et NOM : ${fullName(e)}`,
    `Né(e) le : ${valDate(v.birthDate ?? e.birth_date)}  —  à : ${val(v.birthPlace)}`,
    `CIN n° : ${val(v.cin ?? e.cin)}  —  Nationalité : ${val(v.nationality)}`,
    `Demeurant à : ${val(v.address ?? e.address)}`,
    `Numéro CNSS : ${val(v.cnss ?? e.cnss_number)}`,
  ];
  return [
    { k: "p", t: "Entre les soussignés :" },
    { k: "h", t: "L'EMPLOYEUR" },
    { k: "p", t: `${employerParagraph(v.firm)}` },
    { k: "p", t: "Ci-après « l'Employeur », d'une part," },
    { k: "h", t: "LE SALARIÉ" },
    { k: "ul", items: salarie },
    { k: "p", t: "Ci-après « le Salarié », d'autre part." },
    // « IL A ÉTÉ CONVENU » vient APRÈS le préambule pour un ancien salarié : le corps l'ajoute alors lui-même.
    ...(v.priorEmployee ? [] : [{ k: "center" as const, t: "IL A ÉTÉ CONVENU CE QUI SUIT :", strong: true }]),
  ];
}

/**
 * Article 14 « Règlement intérieur » — version conservée pour le contrat pour travail déterminé
 * (ouvrier), en l'absence d'une version FR actualisée de son article 14 spécifique.
 */
/* ------------------------------------------------------------------ articles communs (fin de contrat) ------------------------------------------------------------------
 * Articles 7 à 16 communs aux modèles CDD chef et travail déterminé, sauf l'article 14 qui diffère
 * selon le poste (encadrement pour le chef de projet, « Fiche de poste » pour l'ouvrier) : il est donc
 * injecté par chaque modèle via `article14`, inséré entre les articles 13 et 15.
 */
function commonTailBlocks(v: RhContractView, article14: LegalBlock[]): LegalBlock[] {
  const p = project(v);
  return [
    { k: "h", t: "Article 7 — Couverture sociale" },
    {
      k: "p",
      // Salarié déjà connu : déclaration d'entrée (reprise) au lieu d'une première immatriculation.
      t: v.priorEmployee
        ? "Le Salarié sera affilié à la CNSS (Dahir 1-72-184) et à l'AMO (Loi 65-00) pour la durée du contrat. Le Salarié ayant déjà été déclaré par l'Employeur au titre de la relation antérieure visée au préambule, l'Employeur procède à sa déclaration d'entrée (reprise) et au règlement des cotisations selon les taux en vigueur, sur la base du salaire réel ; à défaut d'immatriculation valide, l'Employeur y procède dans le délai légal. Le Salarié est couvert par l'assurance accidents du travail de l'entreprise (Loi 18-12) pendant toute la durée du contrat, y compris les trajets entre son domicile et le chantier."
        : "Le Salarié sera affilié à la CNSS (Dahir 1-72-184) et à l'AMO (Loi 65-00) pour la durée du contrat. Lorsque le Salarié n'est pas encore immatriculé à la CNSS, l'Employeur procède à son immatriculation et effectue la déclaration et le règlement des cotisations selon les taux en vigueur, sur la base du salaire réel. Le Salarié est couvert par l'assurance accidents du travail de l'entreprise (Loi 18-12) pendant toute la durée du contrat, y compris les trajets entre son domicile et le chantier.",
    },
    { k: "h", t: "Article 8 — Visite médicale d'embauche et médecine du travail (Art. 304-331)" },
    {
      k: "p",
      t: "Conformément aux articles 304 à 331 du Code du Travail, le Salarié s'engage à se soumettre à la visite médicale d'embauche dans un délai de 30 jours à compter de sa prise de fonction, ainsi qu'aux visites médicales périodiques organisées par l'Employeur. L'Employeur prend en charge les frais de ces visites et garantit l'accès du Salarié au service de médecine du travail conformément à la législation en vigueur.",
    },
    { k: "h", t: "Article 9 — Hygiène et sécurité — Équipements de protection" },
    {
      k: "p",
      t: "Le Salarié doit obligatoirement porter les équipements de protection individuelle (EPI) fournis par l'entreprise :",
    },
    {
      k: "ul",
      items: [
        "Casque de sécurité",
        "Gilet haute visibilité",
        "Chaussures de sécurité à embout renforcé",
        "Gants de protection",
        "Protection auditive en cas d'utilisation de machines bruyantes",
        "Harnais de sécurité pour tout travail en hauteur supérieure à 3 mètres",
      ],
    },
    {
      k: "p",
      t: "Le non-port des EPI constitue une faute disciplinaire pouvant entraîner une sanction immédiate. Le Salarié respecte les consignes de sécurité du site du client et les instructions du chef de projet. À la fin du contrat, il restitue les équipements de protection, outillages et matériels mis à sa disposition ; toute non-restitution ou dégradation fautive engage sa responsabilité et peut donner lieu à retenue.",
    },
    { k: "h", t: "Article 10 — Congés payés et fin de contrat" },
    {
      k: "p",
      t: "10.1. Le Salarié a droit à une indemnité compensatrice de congés payés égale à 1/12e de la rémunération totale brute perçue pendant la durée du contrat (Art. 231 du Code du Travail).",
    },
    {
      k: "p",
      t: "10.2. Le présent contrat prend fin de plein droit à son terme. Aucune indemnité de fin de contrat n'est due au Salarié, le Code du Travail marocain (Loi 65-99) n'en ayant pas prévu pour ce type de contrat arrivant à son terme normal.",
    },
    { k: "h", t: "Article 11 — Protection des données personnelles du Salarié (Loi n° 09-08)" },
    {
      k: "p",
      t: `11.1. Cadre légal et responsable du traitement. Le traitement des données personnelles du Salarié est effectué par l'Employeur, ${v.firm.name.toUpperCase()}, agissant en qualité de responsable du traitement au sens de l'article 5 de la loi marocaine n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, et conformément au décret n° 2-09-165 et aux délibérations de la Commission Nationale de contrôle de la Protection des Données à caractère Personnel (CNDP).`,
    },
    {
      k: "p",
      t: "11.2. Finalités du traitement (Art. 4 Loi 09-08). Les données personnelles du Salarié sont collectées et traitées pour les finalités suivantes, et uniquement celles-ci :",
    },
    {
      k: "ul",
      items: [
        "Gestion administrative du personnel (dossier salarié, contrat, avenants, attestations) ;",
        "Calcul et versement de la paie (salaires, primes, indemnités) ;",
        "Déclarations sociales obligatoires (CNSS, AMO, IR sur salaires, TFP) ;",
        "Suivi de la médecine du travail (Art. 304-331 Code Travail) ;",
        "Gestion de la formation professionnelle ;",
        "Évaluation et suivi de carrière ;",
        "Sécurité des personnes et des biens sur les sites et chantiers de l'Employeur ;",
        "Gestion disciplinaire et exercice des droits attachés au contrat de travail.",
      ],
    },
    {
      k: "p",
      t: "11.3. Catégories de données traitées. Sont traitées les données d'identification (nom, prénom, CIN, photo, adresse, coordonnées), familiales (état civil, ayants droit AMO), professionnelles (CV, diplômes, expérience), de paie (salaire, RIB, numéro CNSS), de santé dans la stricte limite de la médecine du travail, et de présence (pointage, congés, absences).",
    },
    {
      k: "p",
      t: "11.4. Durée de conservation. Les données personnelles sont conservées pendant la durée du contrat puis :",
    },
    {
      k: "ul",
      items: [
        "Pièces sociales (contrat, bulletins de paie, déclarations CNSS) : cinq (5) ans après la fin du contrat (conservation prudentielle ; les actions nées du contrat de travail se prescrivent par deux ans, art. 395 du Code du Travail) ;",
        "Pièces comptables liées à la paie : dix (10) ans (Code de commerce, art. 22) ;",
        "Données de santé issues de la médecine du travail : durée fixée par la réglementation sectorielle de la médecine du travail.",
      ],
    },
    {
      k: "p",
      t: "11.5. Sous-traitants (Art. 24 Loi 09-08). L'Employeur peut recourir à des sous-traitants pour certains traitements (logiciel de paie SaaS, prestataire de paie externalisée, cabinet d'expertise comptable). Chaque sous-traitant s'engage par contrat à respecter les obligations de la loi 09-08, sous la responsabilité de l'Employeur.",
    },
    {
      k: "p",
      t: "11.6. Droits du Salarié (Art. 7 à 9 Loi 09-08). Le Salarié dispose des droits d'accès (art. 7), de rectification des données inexactes, incomplètes ou périmées (art. 8) et d'opposition au traitement pour des motifs légitimes (art. 9). Il les exerce par demande écrite adressée à l'Employeur — par courrier électronique ou courrier recommandé au siège — accompagnée d'une copie de sa CIN. L'Employeur s'engage à répondre à toute demande dans un délai de trente (30) jours.",
    },
    {
      k: "p",
      t: "11.7. Sécurité et confidentialité (Art. 23 Loi 09-08). L'Employeur met en œuvre les mesures techniques et organisationnelles nécessaires pour assurer la sécurité, la confidentialité et l'intégrité des données du Salarié, et s'engage à ne pas les communiquer à des tiers non autorisés, sauf obligation légale ou réglementaire.",
    },
    {
      k: "p",
      t: "11.8. Transferts internationaux (Art. 43-44 Loi 09-08). Tout transfert de données personnelles vers un pays étranger ne peut intervenir qu'après autorisation préalable expresse de la CNDP, sauf si le pays destinataire figure sur la liste blanche reconnue par la CNDP comme assurant un niveau de protection équivalent.",
    },
    {
      k: "p",
      t: "11.9. Violation de données. En cas de violation des données personnelles du Salarié portant atteinte à ses droits, l'Employeur en informera le Salarié ainsi que la CNDP dans un délai raisonnable, et prendra toutes les mesures appropriées pour limiter les conséquences de la violation.",
    },
    { k: "h", t: "Article 12 — Confidentialité" },
    {
      k: "p",
      t: "Le Salarié s'engage, tant pendant la durée du contrat qu'après sa cessation, à ne divulguer aucune information confidentielle relative à l'entreprise, à ses clients, aux chantiers sur lesquels il intervient, à ses techniques ou méthodes commerciales. Toute violation pourra donner lieu à des poursuites judiciaires en réparation du préjudice (DOC art. 77-78) indépendamment des sanctions disciplinaires (Art. 39 Code du Travail — divulgation de secret professionnel = faute grave).",
    },
    { k: "h", t: "Article 13 — Rupture anticipée (Art. 33)" },
    {
      k: "p",
      // Salarié dispensé d'essai : la mention « en dehors de la période d'essai » n'a pas lieu d'être.
      t: `13.1. La rupture anticipée du présent contrat à l'initiative de l'une des Parties, ${v.priorEmployee ? "" : "en dehors de la période d'essai et "}hors faute grave de l'autre partie ou cas de force majeure, ouvre droit, au profit de la partie lésée, à des dommages-intérêts équivalents aux salaires correspondant à la période allant de la date de la rupture jusqu'au terme fixé par le contrat (article 33, al. 2 et 3 du Code du Travail).`,
    },
    {
      k: "p",
      t: "13.2. En cas de faute grave dûment constatée selon la procédure des articles 62 à 65 du Code du Travail (audition préalable, PV, notification motivée), la rupture peut intervenir sans indemnité. L'abandon de poste et les absences injustifiées constituent une faute grave autorisant la rupture sans indemnité ni préavis.",
    },
    ...article14,
    { k: "h", t: "Article 15 — Droit applicable et juridiction compétente" },
    {
      k: "p",
      t: `Le présent contrat est régi par le droit marocain, notamment la Loi 65-99 portant Code du Travail, la Loi 09-08 et le Dahir des Obligations et Contrats. Conformément à l'article 28 du Code de procédure civile, le lieu d'exécution du travail étant situé à ${p.location}, tout litige né de la conclusion, de l'exécution ou de la rupture du présent contrat sera soumis, après tentative de conciliation, au ${p.jurisdiction}, territorialement compétent.`,
    },
    { k: "h", t: "Article 16 — Dispositions finales" },
    {
      k: "p",
      t: "Le présent contrat est établi en deux (2) exemplaires originaux, dont un est remis au Salarié. Conformément à l'article 15 du Code du Travail, les signatures du Salarié et de l'Employeur sont légalisées par l'autorité communale compétente. Toute modification doit faire l'objet d'un avenant écrit et signé par les deux Parties.",
    },
  ];
}

/* ------------------------------------------------------------------ articles spécifiques par modèle ------------------------------------------------------------------ */
function cddChefBlocks(v: RhContractView): LegalBlock[] {
  const p = project(v);
  const wage = v.dailyWage?.trim() ? `${v.dailyWage.trim()} DH` : PH;
  // Article 14 propre au chef de projet : missions d'encadrement et de supervision du chantier.
  const chefArt14: LegalBlock[] = [
    { k: "h", t: "Article 14 — Fiche de poste, note de service et obligations professionnelles" },
    {
      k: "p",
      t: "Le Salarié reconnaît avoir reçu sa fiche de poste, annexée au présent contrat, qui définit ses missions d'encadrement et de supervision du chantier. Il s'engage à exercer ses fonctions avec soin, diligence et loyauté sous l'autorité de l'Employeur (Art. 20 et 21 du Code du Travail), à faire respecter et à respecter lui-même les horaires communiqués par note de service (Art. 24), les consignes de sécurité, ainsi que le règlement intérieur de l'entreprise dès sa communication (Art. 138 du Code du Travail), et à assurer la bonne exécution et la qualité des travaux confiés à son équipe. Tout manquement à ces obligations peut donner lieu aux sanctions disciplinaires prévues aux articles 37 et suivants du Code du Travail, dans le respect de la procédure légale.",
    },
  ];
  return [
    { k: "h", t: "Article 1 — Motif du recours au CDD — Accroissement temporaire d'activité (Art. 16)" },
    {
      k: "p",
      t: `Le présent contrat à durée déterminée est conclu au titre de l'accroissement temporaire d'activité prévu à l'article 16, al. 2 du Code du Travail, résultant du chantier d'aménagement paysager du ${p.label}, sis à ${p.location}. Le chantier constitue le lieu d'exécution du contrat. La réalité du surcroît temporaire d'activité justifiant ce renfort est établie par les pièces justificatives (devis du maître d'ouvrage, planning des chantiers) conservées par l'Employeur.`,
    },
    { k: "h", t: "Article 2 — Durée et terme du contrat (Art. 17)" },
    {
      k: "p",
      t: `2.1. Le présent contrat prend effet le ${valDate(v.startDate)} et prendra fin le ${valDate(v.endDate)}, pour une durée totale de trois (3) mois.`,
    },
    {
      k: "p",
      t: "2.2. Le contrat cessera de plein droit à l'échéance du terme fixé ci-dessus, sans qu'il soit nécessaire de délivrer un préavis.",
    },
    {
      k: "p",
      t: "2.3. Conformément à l'article 17 du Code du Travail, le présent contrat peut être renouvelé une seule fois, pour une durée ne pouvant excéder la durée du contrat initial, dans la limite d'une durée totale de douze (12) mois. Au-delà, le contrat devient automatiquement à durée indéterminée.",
    },
    {
      k: "p",
      t: "2.4. À l'issue du présent contrat, si la relation de travail se poursuit au-delà de la durée convenue, y compris après renouvellement, le contrat sera réputé à durée indéterminée et régi comme tel (Art. 17, in fine).",
    },
    { k: "h", t: "Article 3 — Poste et lieu de travail" },
    {
      k: "p",
      t: `Le Salarié est engagé en qualité de ${val(v.jobTitle ?? v.employee.position) === PH ? "paysagiste, chef de projet" : val(v.jobTitle ?? v.employee.position)}. Le lieu d'exécution principal est le chantier désigné à l'article 1, soit le chantier d'aménagement paysager du ${p.label}, sis à ${p.location}. Le Salarié peut être amené à se déplacer sur les différentes zones du même chantier, ou sur les autres sites de l'entreprise, selon les nécessités du chantier.`,
    },
    { k: "h", t: "Article 4 — Période d'essai (Art. 14)" },
    { k: "p", t: "Conformément à l'article 14, al. 2 du Code du Travail, la période d'essai du présent CDD est :" },
    {
      k: "ul",
      items: [
        "1 jour par semaine de travail effectif, dans la limite de 2 semaines, lorsque la durée totale du CDD est inférieure ou égale à 6 mois ;",
        "1 mois maximum, lorsque la durée totale du CDD est supérieure à 6 mois.",
      ],
    },
    {
      k: "p",
      t: "Le présent contrat étant conclu pour une durée de trois (3) mois (inférieure à six mois), la période d'essai applicable est au maximum de deux (2) semaines, calculée à raison d'un (1) jour par semaine de travail effectif. Toute période d'essai excédant ce maximum légal est nulle de plein droit, le Salarié étant alors réputé définitivement embauché dès le premier jour.",
    },
    { k: "h", t: "Article 5 — Rémunération" },
    {
      k: "p",
      t: `Le Salarié percevra un salaire journalier brut de ${wage}, soit pour la durée totale du contrat : ${PH} DH. Le salaire est payé par virement bancaire sur le compte du Salarié à la fin du contrat ou, en cas de prolongation au-delà de 15 jours, mensuellement. Le paiement en espèces n'est admis qu'à titre exceptionnel et contre reçu signé. Le salaire journalier brut, multiplié par le nombre de jours travaillés effectivement, constitue l'assiette des cotisations CNSS et AMO, calculées sans prorata du plafond (Dahir 1-72-184 et circulaires CNSS). Ce salaire ne peut être inférieur au SMIG en vigueur (Art. 356 du Code du Travail). Pour les emplois agricoles, le SMAG s'applique à la place du SMIG.`,
    },
    { k: "h", t: "Article 6 — Durée du travail (Art. 184)" },
    {
      k: "p",
      t: "La durée du travail est de 44 heures hebdomadaires. Les horaires de travail sont fixés par l'Employeur et communiqués au Salarié par écrit, au moyen d'une note de service affichée sur le chantier et remise contre décharge (Art. 24 du Code du Travail). Toute heure supplémentaire effectuée fait l'objet d'une autorisation écrite préalable et est rémunérée selon les majorations légales (Art. 196-202 du Code du Travail). Le Salarié bénéficie d'un repos hebdomadaire d'au moins vingt-quatre (24) heures, conformément à l'article 205 du Code du Travail.",
    },
    ...commonTailBlocks(v, chefArt14),
  ];
}

/** Article 14 « Règlement intérieur » — version ouvrier des contrats Nador (sans site de production). */
const REGLEMENT_INTERIEUR_ART14: LegalBlock[] = [
  { k: "h", t: "Article 14 — Règlement intérieur" },
  {
    k: "p",
    t: "Le Salarié déclare avoir pris connaissance du règlement intérieur de l'entreprise (Art. 138 Code du Travail) et s'engage à en respecter les dispositions, notamment en matière d'horaires, de discipline et de sécurité.",
  },
];

/** Article 14 « Fiche de poste » — version ouvrier (missions + cadence de référence attendue). */
const OUVRIER_ART14: LegalBlock[] = [
  { k: "h", t: "Article 14 — Fiche de poste, note de service et obligations professionnelles" },
  {
    k: "p",
    t: "Le Salarié reconnaît avoir reçu sa fiche de poste, annexée au présent contrat, qui définit ses missions et la cadence de référence attendue à conditions équivalentes. Il s'engage à exécuter son travail avec soin, diligence et loyauté sous l'autorité de l'Employeur (Art. 20 et 21 du Code du Travail), à respecter les horaires portés à sa connaissance par note de service affichée sur le chantier (Art. 24), les consignes de sécurité et le port des équipements de protection individuelle, ainsi que le règlement intérieur de l'entreprise dès sa communication (Art. 138 du Code du Travail). Une insuffisance de rendement significative, répétée et non justifiée au regard de cette cadence, comme tout manquement aux obligations ci-dessus, peut donner lieu aux sanctions disciplinaires prévues aux articles 37 et suivants du Code du Travail, dans le respect de la procédure légale.",
  },
];

/** Article 6 bis « Interruption des travaux (fait du maître d'ouvrage) » — modèle travail déterminé. */
const OUVRIER_ART6BIS: LegalBlock[] = [
  { k: "h", t: "Article 6 bis — Interruption des travaux (fait du maître d'ouvrage)" },
  {
    k: "p",
    t: "6bis.1. Définition. L'exécution des travaux dépend de la mise à disposition, par le maître d'ouvrage du chantier, des conditions préalables nécessaires à leur réalisation (accès au site, alimentation en eau, travaux de terrassement et de viabilisation). Constitue une interruption des travaux tout arrêt, total ou partiel, du chantier résultant du fait du maître d'ouvrage ou d'une cause étrangère à l'Employeur.",
  },
  {
    k: "p",
    t: "6bis.2. Coupure temporaire. La rémunération étant exclusivement calculée au prorata des journées effectivement travaillées (article 5.1), les journées non travaillées du fait de l'interruption ne donnent pas lieu à rémunération. Pendant toute la durée de l'interruption, le Salarié n'est pas tenu de se maintenir à la disposition de l'Employeur : il recouvre sa pleine liberté, n'est soumis à aucune obligation d'exclusivité et peut occuper tout autre emploi. Lorsque le chantier est en mesure de reprendre, l'Employeur en informe le Salarié et lui propose de reprendre son poste, sans que le Salarié soit tenu d'y déférer. À défaut de reprise dans un délai de trente (30) jours à compter de l'interruption, ou si celle-ci révèle l'abandon définitif des travaux, le contrat prend fin dans les conditions de l'article 2 et il est procédé au solde de tout compte (jours travaillés et congés).",
  },
  {
    k: "p",
    t: "6bis.3. Arrêt définitif ou force majeure. Si l'interruption traduit l'achèvement ou l'abandon définitif des travaux objet du contrat, ou résulte d'un cas de force majeure (événement extérieur, imprévisible, irrésistible et définitif), le contrat prend fin dans les conditions de l'article 2 ; l'achèvement est constaté par un procès-verbal de fin de travaux, ou, à défaut, par un accord de rupture d'un commun accord. Il est alors procédé au solde de tout compte (jours travaillés et congés), sans dommages-intérêts.",
  },
  { k: "p", t: "6bis.4. Les stipulations du présent article s'appliquent dans le respect des dispositions impératives du Code du Travail." },
];

/**
 * Contrat pour travail déterminé (ouvrier) — PARAMÉTRÉ selon les variantes fournies :
 *  - `priorEmployee` : préambule « déclarations préalables » + dispense de période d'essai (art. 13-14) ;
 *  - `housing`       : clause de logement en nature (chantier éloigné) ;
 *  - `dailyBasket`   : panier 27 (exonéré) ou 47 (fraction 11,16 réintégrée) ;
 *  - projet avec `productionSite` (ex. Gotion → Sidi Taibi) : lieu d'exécution à deux sites + transport en nature.
 */
function travailDetermineBlocks(v: RhContractView): LegalBlock[] {
  const p = project(v);
  const wage = v.dailyWage?.trim() ? `${v.dailyWage.trim()} DH` : "sur la base du SMIG (17,92 DH de l'heure)";
  const poste =
    val(v.jobTitle ?? v.employee.position) === PH
      ? "ouvrier de chantier en aménagement paysager"
      : val(v.jobTitle ?? v.employee.position);
  const de = /^[aeiouhâàéèêîïôùû]/i.test(poste) ? "d'" : "de ";
  const prod = p.productionSite; // ex. Gotion → Sidi Taibi (phase de production)

  const blocks: LegalBlock[] = [];

  // Préambule — salarié déjà connu de l'entreprise (dispense d'essai + absence de reprise d'ancienneté).
  if (v.priorEmployee) {
    blocks.push(
      { k: "center", t: "PRÉAMBULE — DÉCLARATIONS PRÉALABLES DES PARTIES", strong: true },
      {
        k: "p",
        t: "Les Parties reconnaissent que le Salarié a précédemment collaboré avec l'Employeur dans le cadre d'une relation contractuelle distincte, aujourd'hui définitivement arrivée à son terme et ayant donné lieu à un solde de tout compte. Le présent contrat constitue un contrat nouveau et autonome, conclu pour le motif qui lui est propre (Article 1) ; il ne constitue ni la prolongation, ni le renouvellement, ni la continuation du ou des contrats antérieurs, et n'emporte aucune reprise d'ancienneté, les droits nés de la relation antérieure ayant été intégralement réglés. La mention de cette collaboration antérieure a pour seul objet la transparence entre les Parties et la dispense de période d'essai prévue à l'Article 4.",
      },
      { k: "center", t: "IL A ÉTÉ CONVENU CE QUI SUIT :", strong: true },
    );
  }

  blocks.push(
    { k: "h", t: "Article 1 — Motif du recours au contrat (Art. 16)" },
    {
      k: "p",
      t: prod
        ? `Le présent contrat est conclu pour accomplir un travail déterminé, au sens de l'article 16, al. 1er du Code du Travail, à savoir la réalisation des travaux d'aménagement paysager du ${p.label}, ouvrage nettement individualisé dont l'achèvement constitue le terme du contrat dans les conditions de l'article 2 ci-après. Le chantier constitue le lieu d'exécution principal ; la phase préparatoire de production des végétaux destinés à ce projet s'exécute sur le site de production de ${prod}, dans les conditions de l'article 3.`
        : `Le présent contrat est conclu pour accomplir un travail déterminé, au sens de l'article 16, al. 1er du Code du Travail, à savoir la réalisation des travaux d'aménagement paysager du ${p.label}, ouvrage nettement individualisé dont l'achèvement constitue le terme du contrat dans les conditions de l'article 2 ci-après. Le chantier constitue le lieu d'exécution.`,
    },
    { k: "h", t: "Article 2 — Nature, objet et durée du contrat (Art. 16 et 33)" },
    {
      k: "p",
      t: `2.1. Nature du contrat. Le présent contrat est conclu pour accomplir un travail déterminé, conformément à l'article 16 (al. 1er) de la loi n° 65-99 portant Code du Travail, à savoir la réalisation d'un ouvrage déterminé : l'ensemble des travaux d'aménagement paysager du ${p.label}.`,
    },
    {
      k: "p",
      t: prod
        ? `2.2. Objet. Le contrat a pour objet l'exécution par le Salarié de l'ensemble des travaux d'aménagement paysager du ${p.label}, en ce compris la phase préparatoire de production et de préparation des végétaux destinés à ce même projet (préparation, semis, repiquage, rempotage, élevage réalisés sur le site de production de ${prod}), le terrassement et la préparation des sols, la plantation et l'installation de gazon, la plantation de sujets, l'arrosage, la fertilisation, le désherbage et tous travaux connexes. Le Salarié peut être affecté à l'une quelconque de ces tâches selon les besoins du projet. L'ensemble de ces travaux constitue un ouvrage unique dont l'achèvement, constaté par procès-verbal de fin de travaux, vaut terme du présent contrat.`
        : `2.2. Objet. Le contrat a pour objet l'exécution par le Salarié de l'ensemble des travaux d'aménagement paysager nécessaires à la réalisation du chantier, notamment : la préparation et le terrassement des sols, la plantation, l'engazonnement, l'arrosage, la fertilisation, le désherbage et tous travaux connexes. Le Salarié peut être affecté à l'une quelconque de ces tâches selon les besoins du chantier.`,
    },
    {
      k: "p",
      t: `2.3. Prise d'effet et terme. Le contrat prend effet le ${valDate(v.startDate)}. Conformément à l'article 33 du Code du Travail, il prend fin de plein droit à l'achèvement des travaux qui en constituent l'objet, sans qu'il soit besoin de préavis, l'achèvement desdits travaux valant terme du contrat. L'achèvement des travaux, qui constitue le terme du présent contrat, sera constaté par un procès-verbal de fin de travaux daté et signé.`,
    },
    {
      k: "p",
      t: "2.4. Durée minimale et estimation. Les Parties conviennent d'une durée minimale garantie de quinze (15) jours à compter de la date de prise d'effet. La durée prévisionnelle d'exécution est estimée à trente (30) jours, cette estimation étant purement indicative et non contractuelle, sans valeur de terme ; le terme effectif du contrat demeure constitué par l'achèvement des travaux objet du présent contrat. L'Employeur informera le Salarié de la date prévisible d'achèvement des travaux dans un délai de prévenance raisonnable.",
    },
    {
      k: "p",
      t: "2.5. Si, après l'achèvement des travaux objet du présent contrat, la relation de travail se poursuit, le contrat sera réputé à durée indéterminée (Art. 16, al. 1er).",
    },
    { k: "h", t: "Article 3 — Poste et lieu de travail" },
    {
      k: "p",
      t: prod
        ? `Le Salarié est engagé en qualité ${de}${poste}. Le lieu d'exécution du présent contrat comprend : (a) le chantier d'aménagement paysager du ${p.label}, sis à ${p.location}, lieu d'exécution principal ; (b) le site de production de ${prod}, pour la seule phase préparatoire de production et de préparation des végétaux destinés au projet. Ce site est mis à la disposition de l'Employeur en vertu d'une convention conclue avec l'exploitant du site. Le Salarié y demeure à tout moment sous l'autorité et la subordination exclusives de l'Employeur, dont il reçoit seul ses instructions, et n'est ni intégré à l'organisation ni placé sous la direction de l'exploitant du site. Le Salarié peut être amené à se déplacer entre les différentes zones du chantier. En cas de nécessité, il peut être affecté temporairement à un autre chantier de l'Employeur.`
        : `Le Salarié est engagé en qualité ${de}${poste}. Le lieu d'exécution principal est le chantier désigné à l'article 1, soit le chantier d'aménagement paysager du ${p.label}, sis à ${p.location}. Le Salarié peut être amené à se déplacer entre les différentes zones du même chantier. En cas de nécessité, il peut être affecté temporairement à un autre chantier de l'Employeur.`,
    },
  );

  if (v.housing) {
    blocks.push({
      k: "p",
      t: "Logement en nature. Le Salarié ne résidant pas dans la région du chantier, il est logé en nature par l'Employeur, sur le site ou à proximité immédiate, pour la seule durée du chantier. Ce logement est imposé par l'éloignement du chantier et fourni dans le seul intérêt du service ; il ne constitue ni un avantage en nature ni un complément de salaire et ne peut donner lieu à aucune contrepartie en espèces. Le transport nécessaire au déplacement est également assuré en nature par l'Employeur.",
    });
  }

  if (v.priorEmployee) {
    blocks.push(
      { k: "h", t: "Article 4 — Dispense de période d'essai (Art. 13 et 14)" },
      {
        k: "p",
        t: "La période d'essai a pour objet de permettre à chacune des Parties d'apprécier les aptitudes professionnelles du Salarié et l'adéquation au poste (Art. 13 du Code du Travail). Le Salarié ayant déjà occupé le même emploi, auprès du même Employeur, dans le cadre de la relation antérieure visée au préambule, ses aptitudes professionnelles sont d'ores et déjà connues et appréciées. Une période d'essai destinée à apprécier des aptitudes déjà éprouvées serait dépourvue d'objet. En conséquence, et faisant usage de la faculté ouverte par l'article 14 (dernier alinéa) du Code du Travail — qui autorise la stipulation de périodes d'essai inférieures aux durées maximales légales —, les Parties conviennent expressément qu'aucune période d'essai ne s'applique au présent contrat. Le Salarié est réputé définitivement engagé dès le premier jour d'exécution du présent contrat.",
      },
    );
  } else {
    blocks.push(
      { k: "h", t: "Article 4 — Période d'essai (Art. 14)" },
      {
        k: "p",
        t: "Conformément à l'article 14 du Code du Travail, la durée du contrat étant inférieure à six (6) mois, la période d'essai est fixée à un (1) jour par semaine de travail effectif, dans la limite de deux (2) semaines, soit pour le présent contrat quatre (4) jours (1 jour par semaine de travail, dans la limite légale de 2 semaines).",
      },
    );
  }

  blocks.push(
    { k: "h", t: "Article 5 — Rémunération et modalités de paiement" },
    {
      k: "p",
      t: `5.1. Salaire de base. Le Salarié perçoit un salaire de base de ${wage}, correspondant à un salaire de base mensuel de référence de 3 422,72 DH pour cent quatre-vingt-onze (191) heures de travail effectif (Art. 356), calculé au prorata des heures (ou journées) effectivement travaillées.`,
    },
    { k: "p", t: panierParagraph(v.dailyBasket) },
  );
  if (prod) {
    blocks.push({
      k: "p",
      t: `5.3. Transport assuré en nature. Le transport du Salarié entre son domicile et les différents lieux d'exécution est assuré en nature par l'Employeur ; aucune indemnité de transport n'est due à ce titre. Il couvre l'acheminement vers le site de production de ${prod} pour la phase préparatoire de production des végétaux destinés au projet, ainsi que la récupération des fournitures et produits nécessaires au chantier.`,
    });
  }
  blocks.push(
    {
      k: "p",
      t: `${prod ? "5.4" : "5.3"}. Charges sociales et fiscales. Le salaire de base et, le cas échéant, la fraction des indemnités excédant les plafonds légaux, sont soumis aux cotisations sociales légales (CNSS, AMO) et à la retenue au titre de l'impôt sur le revenu (IR), sur la base du salaire réel (Dahir 1-72-184 et circulaires CNSS).`,
    },
    {
      k: "p",
      t: `${prod ? "5.5" : "5.4"}. Modalités de paiement. La rémunération est versée par quinzaine, par virement bancaire sur le compte du Salarié ou, à défaut de RIB, en espèces contre reçu signé par le Salarié et émargement du livre de paie. Un bulletin de paie conforme à l'article 370 du Code du Travail, détaillant le salaire de base, chaque indemnité, les cotisations et retenues, est remis à chaque paiement.`,
    },
    { k: "h", t: "Article 6 — Durée du travail (Art. 184)" },
    {
      k: "p",
      // Chantier avec site de production (Gotion) : horaires par note de service (Art. 24) ;
      // chantiers simples (Nador) : horaires fixés par le chef de projet.
      t: prod
        ? "La durée du travail est de 44 heures hebdomadaires. Les horaires de travail sont fixés par l'Employeur et communiqués au Salarié par écrit, au moyen d'une note de service affichée sur le chantier et remise contre décharge (Art. 24 du Code du Travail). Toute heure supplémentaire effectuée fait l'objet d'une autorisation écrite préalable et est rémunérée selon les majorations légales (Art. 196-202 du Code du Travail). Le Salarié bénéficie d'un repos hebdomadaire d'au moins vingt-quatre (24) heures, conformément à l'article 205 du Code du Travail."
        : "La durée du travail est de 44 heures hebdomadaires. Les horaires sont fixés par le chef de projet en fonction des contraintes du site et communiqués au Salarié à son arrivée. Toute heure supplémentaire effectuée fait l'objet d'une autorisation écrite préalable et est rémunérée selon les majorations légales (Art. 196-202 du Code du Travail). Le Salarié bénéficie d'un repos hebdomadaire d'au moins vingt-quatre (24) heures, conformément à l'article 205 du Code du Travail.",
    },
    ...OUVRIER_ART6BIS,
    // Art. 14 : « Fiche de poste » pour le chantier avec production (Gotion), « Règlement intérieur » sinon (Nador).
    ...commonTailBlocks(v, prod ? OUVRIER_ART14 : REGLEMENT_INTERIEUR_ART14),
  );

  return blocks;
}

/**
 * CDD ouvrier RENOUVELABLE à vocation CDI (titularisation) — version condensée fournie.
 * Distinct du travail déterminé : durée déterminée + renouvellement + évolution CDI (plafond 2 ans),
 * poste polyvalent multi-sites, article 6 bis « interruption d'un chantier » (réaffectation / chômage
 * technique art. 185), et un tronc d'articles 7-16 condensé.
 */
function cddCdiBlocks(v: RhContractView): LegalBlock[] {
  const p = project(v);
  const wage = v.dailyWage?.trim() ? `${v.dailyWage.trim()} DH` : "sur la base du SMIG (17,92 DH de l'heure)";
  const prod = p.productionSite ?? "Sidi Taibi (province de Kénitra)";
  const jur = p.jurisdiction;
  return [
    { k: "h", t: "Article 1 — Nature et motif du contrat (Art. 16)" },
    {
      k: "p",
      t: "Le présent contrat est un contrat de travail à durée déterminée (CDD), conclu conformément à l'article 16 du Code du Travail, au titre de l'accroissement temporaire de l'activité de l'entreprise résultant du surcroît de commandes et de la montée en charge des chantiers d'aménagement paysager actuellement en cours. À l'échéance du terme, les Parties ont l'intention, sous réserve de la persistance de ce surcroît d'activité, de poursuivre leur collaboration par la conclusion d'un contrat à durée indéterminée (Art. 16).",
    },
    { k: "h", t: "Article 2 — Durée, prise d'effet et terme" },
    {
      k: "p",
      t: `2.1. Le contrat est conclu pour une durée déterminée de ${PH} (par exemple six ou douze mois), prenant effet le ${valDate(v.startDate)} et venant à terme le ${valDate(v.endDate)}.`,
    },
    { k: "p", t: "2.2. Renouvellement. Le contrat peut être renouvelé par accord écrit des Parties, dans les limites légales, avant son terme." },
    {
      k: "p",
      t: "2.3. Évolution vers un CDI. À l'issue du présent contrat (ou de son renouvellement), la poursuite de la relation de travail donnera lieu à la conclusion d'un contrat à durée indéterminée. À défaut de terme écrit ou en cas de poursuite au-delà du terme, le contrat est réputé à durée indéterminée (Art. 16).",
    },
    {
      k: "p",
      t: "2.4. Plafond de durée. En tout état de cause, la durée cumulée du présent contrat et de son éventuel renouvellement n'excédera pas deux (2) ans ; au-delà, la relation se poursuit exclusivement sous forme de contrat à durée indéterminée (Art. 16).",
    },
    { k: "h", t: "Article 3 — Poste et lieux de travail" },
    {
      k: "p",
      t: `Le Salarié est engagé en qualité d'ouvrier de chantier en aménagement paysager. Compte tenu de la nature polyvalente de son emploi, il est affecté aux différents sites et chantiers de l'Employeur et peut être amené à se déplacer entre eux selon les besoins de l'activité (production horticole, plantation, engazonnement, entretien d'espaces verts). Ces sites incluent notamment le site de production de ${prod}, mis à la disposition de l'Employeur en vertu d'une convention conclue avec l'exploitant du site ; le Salarié y demeure à tout moment sous l'autorité et la subordination exclusives de l'Employeur, dont il reçoit seul ses instructions, et n'est ni intégré à l'organisation ni placé sous la direction de l'exploitant du site.`,
    },
    { k: "h", t: "Article 4 — Période d'essai (Art. 14)" },
    {
      k: "p",
      t: `La période d'essai est fixée à ${PH} : elle ne peut dépasser une (1) journée par semaine de travail dans la limite de deux (2) semaines pour un contrat inférieur à six mois, ni un (1) mois pour un contrat d'une durée supérieure ou égale à six mois.`,
    },
    { k: "h", t: "Article 5 — Rémunération et modalités de paiement" },
    {
      k: "p",
      t: `5.1. Salaire de base. Le Salarié perçoit un salaire de base de ${wage}, correspondant à un salaire de base mensuel de référence de 3 422,72 DH pour 191 heures (Art. 356), au prorata du travail effectif.`,
    },
    { k: "p", t: panierParagraph(v.dailyBasket) },
    { k: "p", t: "5.3. Transport. Lorsque le transport n'est pas assuré en nature par l'Employeur, une indemnité de transport peut être versée dans la limite du plafond légal exonéré." },
    { k: "p", t: "5.4. Charges. Le salaire de base et la fraction des indemnités excédant les plafonds sont soumis aux cotisations (CNSS, AMO) et à l'impôt sur le revenu (IR), sur la base du salaire réel." },
    { k: "p", t: "5.5. Paiement. La rémunération est versée par quinzaine, par virement bancaire ou, à défaut de RIB, en espèces contre reçu signé. Un bulletin de paie (Art. 370) est remis à chaque paiement." },
    { k: "h", t: "Article 6 — Durée du travail (Art. 184)" },
    { k: "p", t: "La durée du travail est de 44 heures hebdomadaires. Les horaires sont fixés par l'encadrement et communiqués au Salarié. Toute heure supplémentaire fait l'objet d'une autorisation écrite préalable et est rémunérée selon les majorations légales (Art. 196-202). Le Salarié bénéficie d'un repos hebdomadaire d'au moins vingt-quatre (24) heures (Art. 205)." },
    { k: "h", t: "Article 6 bis — Interruption d'un chantier" },
    {
      k: "p",
      t: "Le présent contrat n'étant pas rattaché à un chantier unique (Article 3), l'interruption d'un chantier n'affecte pas la rémunération du Salarié : l'Employeur le réaffecte à un autre site ou chantier, la rémunération demeurant due. Lorsqu'aucune réaffectation n'est possible, l'Employeur peut recourir au chômage technique (article 185 du Code du Travail) dans les conditions légales : indemnité au moins égale à 50 % du salaire, pour une durée n'excédant pas soixante (60) jours par an, après consultation des délégués des salariés ou, à défaut de délégués élus, après information des salariés concernés et de l'agent chargé de l'inspection du travail. En cas de cessation définitive et involontaire de l'activité constitutive d'un cas de force majeure au sens des articles 268 et 269 du D.O.C., il peut être mis fin au contrat sans indemnité ; hors ce cas, toute rupture avant le terme ouvre droit aux dommages-intérêts de l'article 33 (salaires restant dus jusqu'au terme).",
    },
    { k: "h", t: "Article 7 — Couverture sociale" },
    { k: "p", t: "Le Salarié est affilié à la CNSS (Dahir 1-72-184) et à l'AMO (Loi 65-00). Lorsqu'il n'est pas encore immatriculé, l'Employeur procède à son immatriculation et déclare les cotisations sur la base du salaire réel. Il est couvert par l'assurance accidents du travail (Loi 18-12) pendant toute la durée du contrat, trajets inclus." },
    { k: "h", t: "Article 8 — Visite médicale d'embauche et aptitude (Art. 290 et 304-331)" },
    { k: "p", t: "Le Salarié est soumis à une visite médicale d'embauche préalable à la prise de fonction, attestant de son aptitude au poste. L'Employeur adhère à un service médical du travail interentreprises, qui réalise cette visite et les visites périodiques, à ses frais." },
    { k: "h", t: "Article 9 — Hygiène et sécurité — Équipements de protection" },
    { k: "p", t: "Le Salarié porte obligatoirement les équipements de protection individuelle (EPI) fournis par l'entreprise et respecte les consignes de sécurité des sites et de l'encadrement. Le non-port des EPI constitue une faute disciplinaire. À la fin du contrat, il restitue les équipements et outillages ; toute non-restitution ou dégradation fautive engage sa responsabilité." },
    { k: "h", t: "Article 10 — Congés payés" },
    { k: "p", t: "Le Salarié a droit aux congés payés à raison d'un jour et demi (1,5) par mois de travail (Art. 231). À la fin du contrat, les congés acquis et non pris donnent lieu à une indemnité compensatrice égale à 1/12e de la rémunération brute perçue, cette modalité étant au moins aussi favorable au Salarié (Art. 11)." },
    { k: "h", t: "Article 11 — Protection des données personnelles (Loi n° 09-08)" },
    { k: "p", t: `L'Employeur, ${v.firm.name.toUpperCase()}, responsable du traitement (Art. 5), traite les données du Salarié pour les seules finalités de gestion du personnel, de paie, de déclarations sociales, de médecine du travail, de sécurité et de gestion disciplinaire. Les pièces sociales sont conservées cinq (5) ans après la fin du contrat, les pièces comptables dix (10) ans. Le Salarié dispose des droits d'accès, de rectification et d'opposition (Art. 7 à 9), exercés par demande écrite. L'Employeur assure la sécurité et la confidentialité des données (Art. 23) et ne procède à aucun transfert hors du Maroc sans autorisation préalable de la CNDP (Art. 43-44).` },
    { k: "h", t: "Article 12 — Confidentialité" },
    { k: "p", t: "Le Salarié s'engage, pendant et après le contrat, à ne divulguer aucune information confidentielle relative à l'entreprise, à ses clients, à ses chantiers ou à ses méthodes. Toute violation peut donner lieu à des poursuites (DOC art. 77-78) et à des sanctions disciplinaires (Art. 39)." },
    { k: "h", t: "Article 13 — Rupture anticipée (Art. 33)" },
    { k: "p", t: "13.1. La rupture anticipée du présent CDD, en dehors de la période d'essai et hors faute grave ou force majeure, ouvre droit, au profit de la partie lésée, à des dommages-intérêts équivalents aux salaires restant dus jusqu'au terme (Art. 33, al. 2 et 3)." },
    { k: "p", t: "13.2. En cas de faute grave dûment constatée selon la procédure des articles 62 à 65, la rupture peut intervenir sans indemnité. L'abandon de poste et les absences injustifiées constituent une faute grave." },
    { k: "h", t: "Article 14 — Règlement intérieur" },
    { k: "p", t: "Le Salarié déclare avoir pris connaissance du règlement intérieur (Art. 138) et s'engage à en respecter les dispositions." },
    { k: "h", t: "Article 15 — Droit applicable et juridiction compétente" },
    { k: "p", t: `Le présent contrat est régi par le droit marocain (Loi 65-99, Loi 09-08, DOC). Conformément à l'article 28 du Code de procédure civile, tout litige sera soumis, après tentative de conciliation, au ${jur}, section sociale.` },
    { k: "h", t: "Article 16 — Dispositions finales" },
    { k: "p", t: "Établi en deux (2) exemplaires originaux, dont un remis au Salarié. Conformément à l'article 15, les signatures sont légalisées par l'autorité communale. Toute modification fait l'objet d'un avenant écrit et signé." },
  ];
}

/* ------------------------------------------------------------------ assemblage du document ------------------------------------------------------------------ */
export function buildContractDoc(v: RhContractView): LegalDoc {
  const p = project(v);
  const body = v.model === "cdd-chef" ? cddChefBlocks(v) : v.model === "cdd-cdi" ? cddCdiBlocks(v) : travailDetermineBlocks(v);
  let subheading: string;
  if (v.model === "cdd-chef") {
    subheading = `Accroissement temporaire d'activité — renfort de chantier · ${p.label} — Paysagiste chef de projet`;
  } else if (v.model === "cdd-cdi") {
    subheading = `Ouvrier d'aménagement paysager · ${p.label} — Renouvelable, avec vocation à évoluer vers un CDI`;
  } else {
    const status = v.priorEmployee
      ? "Salarié déjà connu de l'entreprise — dispense de période d'essai"
      : "Renfort de chantier — ouvrage déterminé";
    const worker = v.housing ? "Ouvrier logé sur place (éloigné)" : "Ouvrier";
    subheading = `${status} · ${p.label} — ${worker}`;
  }

  // « Fait à » : ville d'arrêté du preset (siège du tribunal), sinon ville déduite du lieu, sinon siège société.
  const faitCity =
    v.issueCity?.trim() ||
    p.faitCity ||
    (p.location !== PH ? p.location.replace(/^l'/, "").split(",")[0].split("(")[0].trim() : v.firm.city) ||
    PH;

  return {
    fileTitle: `${CONTRACT_TITLE[v.model]} — ${fullName(v.employee)}`,
    heading: CONTRACT_TITLE[v.model],
    subheading,
    blocks: [...partiesBlocks(v), ...body],
    faitA: `Fait à ${faitCity}, le ${valDate(v.issueDate)}`,
    legalNote: "En deux exemplaires originaux — signatures légalisées (Art. 15 Code du Travail).",
    signatures: [
      {
        title: "Pour l'Employeur",
        lines: [v.firm.name.toUpperCase(), `Représentée par : ${val(v.signatoryName ?? v.firm.signatory_name)}`, val(v.signatoryRole ?? v.firm.signatory_role)],
        caption: "Signature, cachet et légalisation",
      },
      {
        title: "Le Salarié",
        lines: [`Prénom NOM : ${fullName(v.employee)}`, `CIN : ${val(v.cin ?? v.employee.cin)}`],
        caption: "Signature précédée de « Lu et approuvé », et légalisation",
      },
    ],
    // Variante arabe (RTL, HTML) — travail déterminé (paramétré) et CDD→CDI.
    ar:
      v.model === "travail-determine"
        ? buildTravailDetermineAr(v)
        : v.model === "cdd-cdi"
          ? buildCddCdiAr(v)
          : undefined,
  };
}

/** Le modèle dispose-t-il d'une version arabe (RTL) ? */
export function contractHasArabic(model: ContractModel): boolean {
  return model === "travail-determine" || model === "cdd-cdi";
}

/** Champs rendus en placeholder (à compléter à la main) — transparence « zéro invention ». PURE. */
export function contractMissingFields(v: RhContractView): string[] {
  const e = v.employee;
  const out: string[] = [];
  if (!(v.civility === "M." || v.civility === "Mme")) out.push("Civilité");
  if (!(v.cin ?? e.cin)?.trim()) out.push("N° CIN");
  if (!(v.cnss ?? e.cnss_number)?.trim()) out.push("N° CNSS");
  if (!(v.birthDate ?? e.birth_date)?.trim()) out.push("Date de naissance");
  if (!v.birthPlace?.trim()) out.push("Lieu de naissance");
  if (!v.nationality?.trim()) out.push("Nationalité");
  if (!(v.address ?? e.address)?.trim()) out.push("Adresse du salarié");
  if (!(v.projectLabel?.trim() || (v.projectKey && CONTRACT_PROJECTS[v.projectKey]))) out.push("Projet / chantier");
  if (!v.startDate?.trim()) out.push("Date de début");
  if ((v.model === "cdd-chef" || v.model === "cdd-cdi") && !v.endDate?.trim()) out.push("Date de fin");
  if (!v.dailyWage?.trim()) out.push("Salaire journalier brut");
  if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire employeur");
  return out;
}

/** Résumé « données injectées depuis le dossier salarié » (traçabilité, non-invention). PURE. */
export function contractPrefilled(v: RhContractView): { label: string; value: string }[] {
  const e = v.employee;
  const rows: { label: string; value: string }[] = [
    { label: "Salarié", value: fullName(e) },
    { label: "Entité signataire", value: v.firm.name.toUpperCase() },
    { label: "Poste", value: val(v.jobTitle ?? e.position) },
  ];
  if ((v.cin ?? e.cin)?.trim()) rows.push({ label: "CIN", value: (v.cin ?? e.cin)!.trim() });
  if ((v.cnss ?? e.cnss_number)?.trim()) rows.push({ label: "N° CNSS", value: (v.cnss ?? e.cnss_number)!.trim() });
  if ((v.birthDate ?? e.birth_date)?.trim()) rows.push({ label: "Naissance", value: dateFr(v.birthDate ?? e.birth_date) });
  return rows;
}

export function contractFileName(v: RhContractView): string {
  return legalFileName(CONTRACT_TITLE[v.model], `${v.employee.first_name}_${v.employee.last_name}`);
}

export async function exportContractPdf(v: RhContractView) {
  const doc = await renderLegalPdf(v.firm, buildContractDoc(v));
  doc.save(contractFileName(v));
}

export function openContractHtml(v: RhContractView, lang: "fr" | "ar" = "fr") {
  const html = renderLegalHtml(v.firm, buildContractDoc(v), lang);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
