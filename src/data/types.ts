/**
 * Types de données — calqués sur le schéma Supabase de la spécification (§3.1).
 * En V1 la persistance est locale (localStorage) ; ces types restent valides pour
 * un branchement Supabase ultérieur (mêmes colonnes).
 */
import type { PayrollResult, CnssExemption } from "@/lib/payroll-engine";
import type { DepartureReason } from "@/lib/stc-engine";
import type { JournalEntry } from "@/lib/payroll-accounting";

export type Regime = "SMIG" | "SMAG";
export type ContractType = "CDI" | "CDD" | "ANAPEC" | "Interim" | "Stagiaire";
export type PeriodStatus = "draft" | "validated" | "declared" | "paid";
export type LeaveType = "conge_paye" | "maladie" | "AT" | "absence_injustifiee" | "maternite";
export type AlertType =
  | "cnss_missing"
  | "cin_missing"
  | "minor_hazardous"
  | "cdd_expiring"
  | "contract_missing";
export type Severity = "info" | "warning" | "critical";

export interface Firm {
  id: string;
  name: string;
  /** Forme juridique : SARL, SARL AU, SA, SNC, personne physique, auto-entrepreneur… */
  legal_form?: string;
  /** Capital social en dirhams (sociétés de capitaux ; laissé vide pour une personne physique). */
  share_capital?: number;
  ice?: string;
  rc?: string;
  /** Ville du tribunal de commerce où la société est immatriculée au RC. */
  rc_city?: string;
  cnss_affiliation?: string;
  if_fiscal?: string;
  /** Numéro de patente / taxe professionnelle (TP). */
  patente?: string;
  phone?: string;
  email?: string;
  regime: Regime;
  logo_path?: string;
  /** Couleur de marque (hex, ex. « #97BC62 ») — spectre des bulletins. Vide = palette Miya du LaTeX mbd-style. */
  brand_color?: string;
  /** Template LaTeX du BULLETIN (conservé pour compatibilité ; plus édité depuis Paramètres). */
  payslip_template_latex?: string;
  /** Template LaTeX des DOCUMENTS RH (attestations, contrats…). Éditable dans Paramètres. Vide =
   *  gabarit LaTeX par défaut généré à partir du document. N'a AUCUN impact sur le bulletin. */
  rh_template_latex?: string;
  address?: string;
  city?: string;
  /** Signataire par défaut des documents RH (attestations, certificats). Éditable avant émission. */
  signatory_name?: string;
  signatory_role?: string;
  /** Identifiant de la société correspondante dans Odoo (res.company.id) pour l'import. */
  odoo_company_id?: number;
  /**
   * Correspondance CODE de compte app → CODE de compte Odoo, pour l'envoi des écritures de paie
   * (ex. { "5141": "51410000", "4441": "44410000" }) quand le plan Odoo n'utilise pas les mêmes
   * codes que le PCGE court de l'app. Vide = mêmes codes (aucune traduction).
   */
  odoo_account_map?: Record<string, string>;
  /**
   * Sel (256 bits, hex) de l'audit RIB — sert à calculer l'empreinte HMAC-SHA-256 des RIB.
   * Généré automatiquement à la première base de référence. Ne contient AUCUN RIB.
   */
  bank_audit_salt?: string;
  /**
   * Empreinte SHA-256 (hex) du code de validation à 4 chiffres, salée par l'id société.
   * Défini dans le volet Paramètres (admin). Requis pour valider la paie et les écritures
   * comptables. Ne contient JAMAIS le code en clair. Absent = aucun code exigé.
   */
  validation_pin_hash?: string;
  /**
   * Source des congés affichés sur le BULLETIN de paie : `app` = décompte interne
   * (`leave-balance.ts`, art. 231-232), `odoo` = soldes importés d'Odoo (`Employee.odoo_leave`).
   * Défaut (absent) : `app`. Choisi dans Paramètres.
   */
  payslip_leave_source?: "app" | "odoo";
  /**
   * Mode de règlement des salaires nets, qui pilote le compte de trésorerie de l'écriture de
   * règlement de paie : `virement`/`cheque` → Banque (5141), `especes` → Caisse (5161). Les
   * organismes (CNSS, IR, TFP) restent réglés par banque. Défaut (absent) : `virement`.
   */
  payroll_payment_mode?: PaymentMode;
}

/** Mode de règlement des salaires nets (pilote le compte de trésorerie des écritures de paie). */
export type PaymentMode = "virement" | "cheque" | "especes";

/** Paramètres de connexion à l'API Odoo (JSON-RPC). */
export interface OdooConfig {
  url: string; // ex. https://belkora.odoo.com  (ou /odoo via proxy dev)
  db: string;
  username: string;
  apiKey: string; // clé API / mot de passe
}

export interface Employee {
  id: string;
  firm_id: string;
  matricule?: string;
  first_name: string;
  last_name: string;
  cin?: string;
  cnss_number?: string;
  birth_date?: string;
  hire_date: string;
  contract_type: ContractType;
  contract_end?: string;
  position?: string;
  site?: string;
  base_hourly_rate: number;
  monthly_hours: number;
  marital_status?: string;
  dependents: number;
  bank_rib?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  hazardous_site?: boolean; // site BTP/dangereux -> contrôle mineur
  /** Exonération CNSS/AMO/AF/TFP (dispositif ANAPEC/stage). Défaut : droit commun. */
  cnss_exemption?: CnssExemption;
  /**
   * La prime d'ancienneté (art. 350-352) s'applique-t-elle ? Défaut (absent/true) : OUI — c'est
   * un droit légal. `false` = non appliquée (cas conventionnel particulier, à documenter par
   * l'employeur) → la prime est mise à 0 dans le calcul.
   */
  seniority_bonus?: boolean;
  /**
   * Date de sortie effective des effectifs (ISO). Distincte de `contract_end`, qui est le TERME
   * PRÉVU d'un CDD : un CDD peut être rompu avant son terme, ou se prolonger de fait.
   * C'est cette date — et elle seule — qui figure au certificat de travail (art. 24) et au
   * registre des mouvements.
   */
  exit_date?: string;
  /** Motif de la sortie — même nomenclature que le calcul de solde de tout compte. */
  exit_reason?: DepartureReason;
  /** Lien vers l'enregistrement hr.employee d'Odoo (renseigné à l'import / à la synchro). */
  _odoo_id?: number;
  /** Soldes de congés importés d'Odoo (jours). Sert de source alternative au décompte de l'app. */
  odoo_leave?: { allocated: number; taken: number; remaining: number; fetched_at: string };
  /**
   * Mode de règlement du salaire net de CE salarié : `virement`/`cheque` → Banque (5141),
   * `especes` → Caisse (5161). Pilote la ventilation de trésorerie de l'écriture de règlement de
   * paie. Absent → on retombe sur le mode de la société (`Firm.payroll_payment_mode`), puis `virement`.
   */
  payment_mode?: PaymentMode;
}

export interface PayrollPeriod {
  id: string;
  firm_id: string;
  year: number;
  month: number;
  status: PeriodStatus;
}

/** Saisie variable du mois (avant calcul). */
export interface PayslipInput {
  days_worked: number;
  hours_normal: number;
  hours_ot_25: number;
  hours_ot_50: number;
  hours_ot_100: number;
  prime_anciennete_override?: number | null;
  panier: number;
  transport: number;
  salissure: number;
  lait?: number;
  representation?: number;
  /**
   * Autres indemnités du barème légal (caisse, outillage, déplacement, kilométrique, tournée,
   * titres-restaurant, gratifications…), par clé. Leur part exonérée est calculée par le moteur,
   * jamais saisie : c'est le barème de params.ts qui décide, pas l'opérateur.
   */
  indemnites?: Partial<Record<import("@/lib/params").IndemniteKey, number>>;
  /** Kilomètres professionnels du mois — sans eux, l'indemnité kilométrique n'est pas exonérée. */
  km_professionnels?: number;
  /** Kilomètres entre l'ancien et le nouveau lieu d'habitation (indemnité de mutation). */
  km_mutation?: number;
  /** Nuitées de mission du mois — sans elles, les frais d'hébergement ne sont pas exonérés. */
  nuitees?: number;
  /**
   * Voiture de service du mois. Au-delà de l'avantage en nature, elle fait TOMBER l'exonération
   * du transport, de l'indemnité kilométrique et (côté CNSS) de la prime de tournée.
   */
  voiture_service?: "aucune" | "retour_quotidien" | "permanente";
  /** Voiture permanente justifiée : cadre dirigeant, ou agent itinérant avec lettre d'affectation. */
  voiture_service_justifiee?: boolean;
  /** Valeur mensuelle de l'avantage en nature voiture (voiture laissée en permanence). */
  avantage_voiture?: number;
  other_gross: number;
  transport_outside_urban?: boolean;
  /** Avances / acomptes déjà versés ce mois, déduits du net à payer (livre de paie). Défaut : 0. */
  advances?: number;
}

export interface Payslip {
  id: string;
  period_id: string;
  employee_id: string;
  input: PayslipInput;
  /** Résultat figé à la validation (null tant que non calculé). */
  result?: PayrollResult | null;
}

export interface Leave {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  cnss_ipe: boolean;
}

/**
 * Avance sur salaire au personnel. Deux natures :
 *  - `acompte` : paiement anticipé d'un salaire pour un travail DÉJÀ effectué le mois courant
 *    → retenu EN UNE FOIS sur la paie du mois (échappe au plafond de la quotité cessible) ;
 *  - `avance` : somme prêtée, remboursée par retenues successives sur les mois suivants
 *    → échelonnée (`months`) et plafonnée à la quotité cessible du net.
 */
export interface SalaryAdvance {
  id: string;
  firm_id: string;
  employee_id: string;
  kind: "acompte" | "avance";
  /** Date d'octroi (ISO « AAAA-MM-JJ »). */
  date: string;
  /** Montant accordé (DH). */
  amount: number;
  /** Nombre d'échéances de remboursement (1 = soldé en une fois). Pour un acompte : 1. */
  months: number;
  /** Mois de la 1re retenue (ISO « AAAA-MM »). Défaut : le mois de `date`. */
  start_month?: string;
  reason?: string;
}

export interface ComplianceAlert {
  id: string;
  firm_id: string;
  employee_id?: string;
  type: AlertType;
  severity: Severity;
  message: string;
  resolved: boolean;
}

/* ---- Sécurité / Audit des coordonnées bancaires (RIB) ---- */
/** Rôle de l'utilisateur courant de l'app (à câbler à l'auth réelle plus tard). */
export type AppRole = "super_admin" | "firm_admin" | "gestionnaire_paie" | "lecture_seule";

/**
 * Compte utilisateur de l'application (authentification locale).
 * Le mot de passe n'est JAMAIS stocké en clair : seule l'empreinte SHA-256 est conservée.
 */
export interface AppUser {
  id: string;
  /** Identifiant de connexion (e-mail ou login), unique, comparé sans casse. */
  username: string;
  full_name?: string;
  role: AppRole;
  /** Société de rattachement (null/undefined = toutes les sociétés, ex. super_admin). */
  firm_id?: string | null;
  /** Empreinte SHA-256 (hex) du mot de passe — jamais le clair. */
  password_hash: string;
  is_active: boolean;
  /** Super utilisateur racine : indestructible, toujours ré-injecté (anti-lockout). */
  is_super?: boolean;
  /** ISO. */
  created_at: string;
}

/* ---- Journal des connexions (audit d'accès à l'application) ---- */
/** Type d'événement d'accès : connexion réussie, échec de connexion, déconnexion. */
export type LoginOutcome = "success" | "failed" | "logout";
/** Cause d'un échec de connexion (jamais le mot de passe saisi). */
export type LoginFailReason = "empty" | "unknown_user" | "disabled" | "bad_password";

/**
 * Un événement d'accès à l'application (connexion réussie, échec, ou déconnexion).
 * Sécurité : on conserve l'IDENTIFIANT saisi (utile pour détecter les tentatives
 * répétées), mais JAMAIS le mot de passe, même en échec.
 */
export interface LoginEvent {
  id: string;
  /** ISO — horodatage de la tentative. */
  at: string;
  outcome: LoginOutcome;
  /** Identifiant saisi (tel quel, sans casse forcée). */
  username: string;
  /** Renseignés seulement si l'identifiant correspond à un compte connu. */
  user_id?: string;
  full_name?: string;
  role?: AppRole;
  firm_id?: string | null;
  /** Uniquement si outcome = "failed". */
  reason?: LoginFailReason;
}

/* ---- Journal des documents générés (traçabilité + KPI) ---- */
/** Famille du document produit. */
export type DocType =
  | "bulletin" | "attestation" | "contrat" | "disciplinaire" | "rupture" | "mineurs"
  | "declaration_cnss" | "regularisation";
/** Format/canal de production. */
export type DocFormat = "pdf" | "html" | "apercu" | "latex" | "bds" | "print";

/**
 * Un document réellement généré depuis l'application (bulletin, attestation, déclaration…).
 * Une trace = un document produit. Sert la traçabilité et les KPI mensuels ; ne contient
 * aucune donnée sensible (pas de RIB, pas de montant), seulement l'identité du document.
 */
export interface DocGenEvent {
  id: string;
  /** ISO — horodatage de la génération (pilote les KPI mensuels). */
  at: string;
  firm_id: string;
  doc_type: DocType;
  format: DocFormat;
  /** Salarié concerné (absent pour un document non nominatif, ex. mineurs/déclaration). */
  employee_id?: string;
  /** Libellé lisible du sujet (nom du salarié, ou société). */
  subject?: string;
  /** Période concernée par le document (bulletins, déclarations). */
  period_year?: number;
  period_month?: number;
  /** Identifiant (username) du compte qui a généré. */
  by?: string;
  /**
   * PDF archivé de CE document, retéléchargeable tel quel depuis le Journal des documents.
   * Absent pour un format non PDF (HTML, LaTeX, BDS) ou si l'archivage local a échoué.
   */
  archive?: DocArchiveRef;
}

/* ---- Pièces justificatives (dossier salarié + archive des documents produits) ---- */
/**
 * Nature de la pièce — nomenclature FERMÉE (cf. `src/lib/attachments.ts`). C'est elle qui rend
 * la complétude d'un dossier calculable ; un libellé libre ne le permettrait pas.
 */
export type AttachmentKind =
  | "cin" | "contrat" | "cnss" | "anapec" | "rib" | "medical"
  | "diplome" | "famille" | "residence" | "sortie" | "autre";

/**
 * Une pièce justificative déposée dans l'application. Le BINAIRE n'est PAS ici : il vit dans
 * IndexedDB sous la clé `id` (cf. `src/lib/blob-store.ts`), car l'`AppState` est sérialisé en un
 * seul JSON (localStorage + ligne JSONB Supabase) qu'un PDF en base64 ferait exploser.
 * Ce qui est stocké ici — et donc synchronisé partout — c'est la MÉTADONNÉE : qui a déposé quoi,
 * quand, sous quelle empreinte. Une pièce déposée sur un autre poste est donc connue de tous,
 * mais son fichier n'est téléchargeable que depuis le poste qui l'a reçue.
 */
export interface Attachment {
  id: string;
  firm_id: string;
  /** Salarié concerné. */
  employee_id: string;
  kind: AttachmentKind;
  /** Libellé libre — précision, surtout utile pour la nature « autre ». */
  label?: string;
  filename: string;
  mime: string;
  size: number;
  /** Empreinte SHA-256 (hex) du contenu — intégrité et non-répudiation. */
  sha256: string;
  /** Date portée par la pièce elle-même (ISO « AAAA-MM-JJ »), si connue. */
  issued_on?: string;
  /** Date d'expiration (ISO) — aptitude médicale, titre de séjour, assurance. */
  expires_on?: string;
  /** ISO — horodatage du dépôt. */
  uploaded_at: string;
  /** Identifiant (username) du compte déposant. */
  uploaded_by?: string;
  /**
   * Identifiant de l'`ir.attachment` correspondant dans Odoo, une fois la pièce poussée par la
   * synchronisation. Sa présence signifie « déjà partie » : une synchro ultérieure ne la
   * renverra pas.
   */
  _odoo_attachment_id?: number;
}

/**
 * Pointeur vers le PDF ARCHIVÉ d'un document produit par l'application. Le fichier lui-même est
 * dans IndexedDB sous la clé `DocGenEvent.id` : le Journal des documents ne trace donc plus
 * seulement qu'un document a été produit, il permet de le retélécharger TEL QUEL.
 */
export interface DocArchiveRef {
  filename: string;
  size: number;
  sha256: string;
}

export type BankEventClass =
  | "AUTORISE" | "NON_AUTORISE" | "A_VERIFIER" | "NOUVEAU" | "SUPPRIME"
  /**
   * Compte re-créé sous un AUTRE identifiant Odoo, numéro de compte INCHANGÉ (empreinte
   * identique). Ce n'est pas un changement de RIB, c'est une re-création technique — la
   * signaler comme « supprimé + nouveau » produisait deux alertes pour un non-événement.
   */
  | "DEPLACE";

/**
 * Ce qui a RÉELLEMENT changé sur un compte, en clair. Sans ce détail, chaque ligne du volet se
 * lit « ****1234 vers ****5678 » et pèse le même poids : l'utilisateur s'alarme autant d'une
 * re-création technique que d'une substitution frauduleuse, puis cesse de lire le volet.
 *
 * Aucun de ces indices ne descend jamais une gravité à lui seul — seule une empreinte PROUVÉE
 * identique le fait. Un fraudeur pourrait sinon fabriquer le signal rassurant.
 */
export interface BankChangeDetail {
  /** Ce qui a changé, formulé pour être lu tel quel. */
  nature: string;
  /** Pourquoi cela alerte — ou pourquoi c'est classé sans gravité. */
  whyAlert: string;
  /** Le geste de vérification concret, quand il y en a un. */
  whatToCheck?: string;
  /**
   * Les quatre derniers caractères sont identiques avant et après. Indice d'une correction de
   * saisie plutôt que d'une substitution — INFORMATIF, ne réduit aucune gravité.
   */
  sameTail?: boolean;
  /**
   * Changement techniquement bénin : le numéro de compte est PROUVÉ inchangé (même empreinte).
   * Seul cas où l'application se permet de ne pas alerter.
   */
  benign?: boolean;
  /** Identifiant Odoo d'origine, quand le compte a été re-créé ailleurs. */
  previousBankId?: number;
}
export type BankSeverity = "info" | "moyen" | "eleve" | "critique";

/** Un événement de changement de RIB détecté dans Odoo (données MASQUÉES). */
export interface BankAuditEvent {
  id: string;
  firm_id: string;
  odoo_bank_id: number;
  partner: string;
  partner_kind: "fournisseur" | "client" | "salarie";
  rib_before_masked?: string; // ****1234 — JAMAIS le numéro complet
  rib_after_masked?: string;
  actor_name: string;
  actor_login: string;        // e-mail pro du compte Odoo (attribution licite)
  actor_authorized: boolean;
  validated: boolean;
  on_payment: boolean;
  when: string;               // ISO
  classification: BankEventClass;
  severity: BankSeverity;
  /** Explication de CE qui a changé — pour distinguer le bruit du signal. */
  detail?: BankChangeDetail;
}

/** Référence d'un RIB validé (empreinte, pas le clair) pour la détection d'écart. */
export interface BankBaseline {
  odoo_bank_id: number;
  firm_id: string;
  partner: string;
  fingerprint: string; // empreinte du RIB (détection de changement, pas le clair)
  masked: string;      // ****1234
  validated_by: string;
  validated_at: string;
}

/* ---- Registre des accidents du travail (Loi 18-12 ; Code du travail) ---- */
export type WorkAccidentSeverity = "benin" | "avec_arret" | "grave" | "mortel";
export type WorkAccidentStatus = "ouvert" | "clos";

/**
 * Un accident du travail consigné au registre légal de l'employeur.
 * Le registre enregistre et suit ; il ne calcule pas les indemnités (hors périmètre).
 */
export interface WorkAccident {
  id: string;
  firm_id: string;
  employee_id: string;
  /** Date de l'accident (ISO, aaaa-mm-jj). */
  date: string;
  /** Heure (HH:MM), optionnelle. */
  time?: string;
  /** Lieu / poste de travail. */
  location?: string;
  /** Circonstances détaillées (obligatoire). */
  circumstances: string;
  /** Nature des lésions (ex. fracture, brûlure…). */
  injury_nature?: string;
  /** Siège des lésions (partie du corps). */
  injury_site?: string;
  /** Témoins éventuels. */
  witnesses?: string;
  severity: WorkAccidentSeverity;
  /** Arrêt de travail consécutif. */
  work_stoppage: boolean;
  /** Nombre de jours d'arrêt (si arrêt). */
  stoppage_days?: number;
  /** Déclaré à l'assureur / CNSS. */
  declared: boolean;
  /** Date de la déclaration (ISO). */
  declaration_date?: string;
  /** Référence / n° de la déclaration. */
  declaration_ref?: string;
  status: WorkAccidentStatus;
  notes?: string;
  /** ISO — horodatage de création de la fiche. */
  created_at: string;
}

/**
 * Clôture / validation des écritures comptables d'une période (verrou + instantané figé).
 * Les écritures étant dérivées des bulletins, la validation FIGE un snapshot : une
 * modification ultérieure d'un bulletin n'altère plus une période validée. Le retour en
 * brouillon supprime cette clôture et rend la période à nouveau modifiable.
 */
export interface AccountingClosure {
  /** Clé stable : `${firm_id}_${year}_${month}`. */
  id: string;
  firm_id: string;
  year: number;
  month: number;
  /** Instantané figé des écritures au moment de la validation. */
  entries: JournalEntry[];
  /** ISO. */
  validated_at: string;
  /** Identifiant (username) du valideur. */
  validated_by: string;
}

/** Type de document demandé par un salarié (self-service depuis l'accueil). */
export type DocumentRequestType =
  | "attestation_travail"
  | "attestation_salaire"
  | "certificat_travail"
  | "domiciliation_irrevocable"
  | "bulletin_paie"
  | "autre";

/** État de traitement d'une demande de document. */
export type DocumentRequestStatus = "en_attente" | "en_cours" | "traite" | "refuse";

/**
 * Demande de document faite par un SALARIÉ depuis l'accueil (self-service). Visible par les
 * utilisateurs de la société ; traitée par un gestionnaire/administrateur sous 48 h ouvrables.
 * La création est ouverte à tout compte connecté (y compris « lecture seule ») ; seul le
 * TRAITEMENT (changement de statut) est réservé aux comptes autorisés à écrire.
 */
export interface DocumentRequest {
  id: string;
  firm_id: string;
  /** Salarié concerné (si sélectionné dans la liste). */
  employee_id?: string;
  /** Nom du salarié (affiché, même sans fiche liée). */
  employee_name: string;
  type: DocumentRequestType;
  /** Précision libre (période, motif, destinataire…). */
  message?: string;
  /** Horodatage ISO de la demande. */
  requested_at: string;
  /** Identifiant (username) du demandeur, s'il est connecté. */
  requested_by?: string;
  /** Échéance ISO (date) = 48 h OUVRABLES après la demande (week-ends exclus). */
  deadline: string;
  status: DocumentRequestStatus;
  /** Horodatage ISO du traitement (statut final). */
  processed_at?: string;
  /** Identifiant (username) de l'agent traitant. */
  processed_by?: string;
}

/* ---- Cartographie des risques : saisie manuelle, plan d'action, suivi dans le temps ---- */

/**
 * Un risque saisi À LA MAIN, en complément du référentiel intégré. Même grammaire que le
 * référentiel (`RiskDefinition`) pour que les deux se cotent, s'exportent et se suivent
 * exactement de la même façon — un risque propre à l'entité n'est pas un citoyen de seconde zone.
 */
export interface CustomRisk {
  id: string;
  firm_id: string;
  /** Référence affichée. Préfixée « L » (local) à la création pour ne pas heurter R01-R25. */
  ref: string;
  step: string;
  category: string;
  event: string;
  basis: string;
  grossLikelihood: number;
  grossImpact: number;
  controls: CustomRiskControl[];
  created_at: string;
  created_by?: string;
}

/**
 * Contrôle d'un risque saisi à la main. `proven` est ici DÉCLARÉ par l'utilisateur — d'où
 * l'obligation d'une preuve écrite : sans elle, le contrôle n'abat rien, même coché.
 */
export interface CustomRiskControl {
  id: string;
  label: string;
  /** preventif | detectif | correctif */
  type: string;
  /** automatique | semi | manuel */
  automation: string;
  /** fort | moyen | faible */
  strength: string;
  proven: boolean;
  /** Nature de la preuve produite. Obligatoire dès que `proven` est vrai. */
  evidence?: string;
}

/** Avancement du traitement d'un risque hors appétence. */
export type RiskActionStatus = "a_lancer" | "en_cours" | "fait" | "abandonne";

/**
 * Plan de traitement d'un risque (référentiel ou saisi). Un plan sans responsable nommé ni
 * échéance datée n'est pas un plan : les deux champs sont donc portés explicitement.
 */
export interface RiskAction {
  id: string;
  firm_id: string;
  /** Référence du risque traité (R01… ou L01…). */
  risk_ref: string;
  action: string;
  owner: string;
  /** Échéance ISO « AAAA-MM-JJ ». */
  due: string;
  status: RiskActionStatus;
  /** Avancement déclaré, 0-100. */
  progress: number;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Photographie datée de l'exposition, prise à un instant donné. C'est la série de ces
 * instantanés qui rend l'amélioration VISIBLE : sans point de comparaison, un score résiduel
 * ne dit pas si le dispositif progresse ou se dégrade.
 */
export interface RiskSnapshot {
  id: string;
  firm_id: string;
  /** Date d'arrêté de la cartographie photographiée (ISO « AAAA-MM-JJ »). */
  asOf: string;
  /** ISO — horodatage de la prise. */
  taken_at: string;
  taken_by?: string;
  appetite: number;
  count: number;
  grossTotal: number;
  residualTotal: number;
  aboveAppetite: number;
  controlsProven: number;
  controlsTotal: number;
  /** Répartition résiduelle par niveau : faible / modere / eleve / critique. */
  residualByLevel: Record<string, number>;
  label?: string;
}

export interface AppState {
  firms: Firm[];
  employees: Employee[];
  periods: PayrollPeriod[];
  payslips: Payslip[];
  leaves: Leave[];
  /** Avances / acomptes sur salaire (registre par salarié, remboursement échelonné). */
  salaryAdvances?: SalaryAdvance[];
  /** Registre des accidents du travail. */
  workAccidents?: WorkAccident[];
  /** Demandes de documents des salariés (self-service depuis l'accueil). */
  documentRequests?: DocumentRequest[];
  /** Pièces justificatives du dossier salarié (métadonnées ; binaire en IndexedDB). */
  attachments?: Attachment[];
  /** Risques saisis à la main, en complément du référentiel intégré. */
  customRisks?: CustomRisk[];
  /** Plans de traitement des risques (responsable, échéance, avancement). */
  riskActions?: RiskAction[];
  /** Instantanés datés de l'exposition — la série qui rend l'amélioration visible. */
  riskSnapshots?: RiskSnapshot[];
  /** Clôtures comptables validées (verrou + snapshot par période). */
  accountingClosures?: AccountingClosure[];
  /** Comptes de connexion à l'application (auth locale). */
  users?: AppUser[];
  currentFirmId: string;
  odoo?: OdooConfig;
  /** Rôle simulé de l'utilisateur courant (V1 local ; auth Supabase à brancher). */
  currentRole?: AppRole;
  /** Journal des connexions à l'application (audit d'accès), borné aux plus récentes. */
  loginEvents?: LoginEvent[];
  /** Journal des documents générés (traçabilité + KPI), borné aux plus récents. */
  docGenerations?: DocGenEvent[];
  /** Dernier rapport d'audit RIB (par société), masqué. */
  bankAudit?: BankAuditEvent[];
  /** Base de référence des RIB validés (empreintes) pour la détection d'écart. */
  bankBaseline?: BankBaseline[];
  /**
   * Années ajoutées MANUELLEMENT par l'utilisateur aux sélecteurs (Paie, Livre de paie,
   * Écritures, Déclarations, Audit) — au-delà de la plage standard 2000→année+1. Partagées
   * par toutes les sociétés (simples options de sélection ; les données restent par société).
   */
  extraYears?: number[];
  /**
   * Versements internes aux salariés NON DÉCLARÉS (sans N° CNSS). Suivi de pilotage
   * et de régularisation — n'alimente JAMAIS la paie normale (BDS, livre art. 371,
   * écritures, IR 9421). Type importé de `src/lib/non-declares.ts` (évite un cycle).
   */
  nonDeclarePayments?: import("@/lib/non-declares").NonDeclarePayment[];
}
