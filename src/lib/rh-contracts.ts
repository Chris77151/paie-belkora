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

export type ContractModel = "cdd-chef" | "travail-determine";
/** Civilité — définition unique dans `rh-legal.ts`, ré-exportée pour les pages. */
export type { Civility };

export const CONTRACT_MODELS: { value: ContractModel; label: string; hint: string }[] = [
  { value: "cdd-chef", label: "CDD chantier — chef de projet", hint: "Accroissement temporaire (art. 16-17) · 3 mois" },
  { value: "travail-determine", label: "Contrat pour travail déterminé — ouvrier", hint: "Terme = achèvement des travaux (art. 16 al.1 & 33)" },
];

/** Projets chantier connus (préremplissent lieu d'exécution + juridiction). */
export const CONTRACT_PROJECTS: Record<string, { label: string; location: string; jurisdiction: string }> = {
  gotion: {
    label: "Projet Gotion",
    location: "Sidi Yahya El Gharb (province de Kénitra)",
    jurisdiction: "Tribunal de Première Instance de Kénitra, section sociale",
  },
  nador: {
    label: "Projet Nador Marchica",
    location: "Nador (province de Nador, région de l'Oriental)",
    jurisdiction: "Tribunal de Première Instance de Nador, section sociale",
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
  };
}

export const CONTRACT_TITLE: Record<ContractModel, string> = {
  "cdd-chef": "CONTRAT À DURÉE DÉTERMINÉE",
  "travail-determine": "CONTRAT POUR ACCOMPLIR UN TRAVAIL DÉTERMINÉ",
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
    { k: "center", t: "IL A ÉTÉ CONVENU CE QUI SUIT :", strong: true },
  ];
}

/**
 * Article 14 « Règlement intérieur » — version conservée pour le contrat pour travail déterminé
 * (ouvrier), en l'absence d'une version FR actualisée de son article 14 spécifique.
 */
const REGLEMENT_INTERIEUR_ART14: LegalBlock[] = [
  { k: "h", t: "Article 14 — Règlement intérieur" },
  {
    k: "p",
    t: "Le Salarié déclare avoir pris connaissance du règlement intérieur de l'entreprise (Art. 138 Code du Travail) et s'engage à en respecter les dispositions, notamment en matière d'horaires, de discipline et de sécurité.",
  },
];

/* ------------------------------------------------------------------ articles communs (fin de contrat) ------------------------------------------------------------------
 * Articles 7 à 16 communs aux deux modèles, sauf l'article 14 qui diffère selon le poste
 * (encadrement pour le chef de projet, règlement intérieur pour l'ouvrier) : il est donc injecté
 * par chaque modèle via `article14`, inséré entre les articles 13 et 15.
 */
function commonTailBlocks(v: RhContractView, article14: LegalBlock[]): LegalBlock[] {
  const p = project(v);
  return [
    { k: "h", t: "Article 7 — Couverture sociale" },
    {
      k: "p",
      t: "Le Salarié sera affilié à la CNSS (Dahir 1-72-184) et à l'AMO (Loi 65-00) pour la durée du contrat. Lorsque le Salarié n'est pas encore immatriculé à la CNSS, l'Employeur procède à son immatriculation et effectue la déclaration et le règlement des cotisations selon les taux en vigueur, sur la base du salaire réel. Le Salarié est couvert par l'assurance accidents du travail de l'entreprise (Loi 18-12) pendant toute la durée du contrat, y compris les trajets entre son domicile et le chantier.",
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
      t: "13.1. La rupture anticipée du présent contrat à l'initiative de l'une des Parties, en dehors de la période d'essai et hors faute grave de l'autre partie ou cas de force majeure, ouvre droit, au profit de la partie lésée, à des dommages-intérêts équivalents aux salaires correspondant à la période allant de la date de la rupture jusqu'au terme fixé par le contrat (article 33, al. 2 et 3 du Code du Travail).",
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

function travailDetermineBlocks(v: RhContractView): LegalBlock[] {
  const p = project(v);
  const wage = v.dailyWage?.trim() ? `${v.dailyWage.trim()} DH` : "sur la base du SMIG (17,92 DH de l'heure)";
  return [
    { k: "h", t: "Article 1 — Motif du recours au contrat (Art. 16)" },
    {
      k: "p",
      t: `Le présent contrat est conclu pour accomplir un travail déterminé, au sens de l'article 16, al. 1er du Code du Travail, en raison de l'accroissement temporaire d'activité (article 16, al. 2) résultant du chantier d'aménagement paysager du ${p.label}. Le chantier constitue le lieu d'exécution et son achèvement détermine le terme du contrat dans les conditions de l'article 2 ci-après.`,
    },
    { k: "h", t: "Article 2 — Nature, objet et durée du contrat (Art. 16 et 33)" },
    {
      k: "p",
      t: `2.1. Nature. Le présent contrat est conclu pour accomplir un travail déterminé (article 16 al. 1er de la loi n° 65-99), en raison de l'accroissement temporaire d'activité résultant du chantier du ${p.label}.`,
    },
    {
      k: "p",
      t: "2.2. Objet. Le contrat a pour objet l'exécution par le Salarié de l'ensemble des travaux d'aménagement paysager du chantier, notamment la préparation des sols, la pose et l'installation de gazon, la plantation, l'arrosage et tous travaux connexes nécessaires à l'achèvement de l'aménagement.",
    },
    {
      k: "p",
      t: `2.3. Prise d'effet et terme. Le contrat prend effet le ${valDate(v.startDate)}. Conformément à l'article 33 du Code du Travail, il prend fin de plein droit à l'achèvement des travaux qui en constituent l'objet, sans qu'il soit besoin de préavis. L'achèvement des travaux, qui constitue le terme du présent contrat, sera constaté par un procès-verbal de fin de travaux daté et signé.`,
    },
    {
      k: "p",
      t: "2.4. Durée minimale et estimation. Les Parties conviennent d'une durée minimale garantie de quinze (15) jours à compter de la date de prise d'effet. La durée prévisionnelle d'exécution est estimée à trente (30) jours, cette estimation étant purement indicative et non contractuelle, sans valeur de terme ; le terme effectif demeure constitué par l'achèvement des travaux.",
    },
    { k: "h", t: "Article 3 — Poste et lieu de travail" },
    {
      k: "p",
      t: `Le Salarié est engagé en qualité de ${val(v.jobTitle ?? v.employee.position) === PH ? "ouvrier de chantier (ouvrier paysagiste, aide-jardinier ou manœuvre)" : val(v.jobTitle ?? v.employee.position)}. Le lieu d'exécution principal est le chantier d'aménagement paysager du ${p.label}, sis à ${p.location}. Le Salarié peut être amené à se déplacer sur les différentes zones du même chantier, ou sur les autres sites de l'entreprise, selon les nécessités du chantier.`,
    },
    { k: "h", t: "Article 4 — Période d'essai (Art. 14)" },
    {
      k: "p",
      t: "La durée du contrat étant inférieure à six (6) mois, la période d'essai est fixée à un (1) jour par semaine de travail effectif, dans la limite de deux (2) semaines (article 14 du Code du Travail).",
    },
    { k: "h", t: "Article 5 — Rémunération et modalités de paiement" },
    {
      k: "p",
      t: `5.1. Salaire de base. Le Salarié perçoit un salaire journalier brut de ${wage}, calculé au prorata des heures (ou journées) effectivement travaillées, ne pouvant être inférieur au SMIG (art. 356) — salaire de référence 3 422,72 DH pour 191 heures.`,
    },
    {
      k: "p",
      t: "5.2. Indemnités représentatives de frais professionnels. En sus du salaire de base, le Salarié perçoit, dans la limite des plafonds légaux exonérés de cotisations et d'IR : une indemnité de transport interurbain (28,82 DH par journée, plafond 750 DH/mois), une indemnité de panier (35,00 DH par journée), et une indemnité de salissure (74,00 DH par mois). Toute fraction excédant les plafonds est réintégrée dans l'assiette soumise.",
    },
    {
      k: "p",
      t: "5.3. Charges et paiement. Le salaire de base et la fraction des indemnités excédant les plafonds sont soumis aux cotisations CNSS/AMO et à l'IR sur la base du salaire réel. La rémunération est versée par quinzaine, par virement bancaire ou, à défaut de RIB, en espèces contre reçu signé. Un bulletin de paie conforme à l'article 370 est remis à chaque paiement.",
    },
    { k: "h", t: "Article 6 — Durée du travail (Art. 184)" },
    {
      k: "p",
      t: "La durée du travail est de 44 heures hebdomadaires. Toute heure supplémentaire fait l'objet d'une autorisation écrite préalable et est rémunérée selon les majorations légales (Art. 196-202). Le Salarié bénéficie d'un repos hebdomadaire d'au moins vingt-quatre (24) heures (Art. 205).",
    },
    ...commonTailBlocks(v, REGLEMENT_INTERIEUR_ART14),
  ];
}

/* ------------------------------------------------------------------ assemblage du document ------------------------------------------------------------------ */
export function buildContractDoc(v: RhContractView): LegalDoc {
  const p = project(v);
  const body = v.model === "cdd-chef" ? cddChefBlocks(v) : travailDetermineBlocks(v);
  const subheading =
    v.model === "cdd-chef"
      ? `Accroissement temporaire d'activité — renfort de chantier · ${p.label} — Paysagiste chef de projet`
      : `Accroissement temporaire d'activité — renfort de chantier · ${p.label} — Ouvrier`;

  const faitCity = v.issueCity?.trim() || (p.location !== PH ? p.location.split("(")[0].trim() : v.firm.city) || PH;

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
  };
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
  if (v.model === "cdd-chef" && !v.endDate?.trim()) out.push("Date de fin");
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

export function openContractHtml(v: RhContractView) {
  const html = renderLegalHtml(v.firm, buildContractDoc(v));
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
