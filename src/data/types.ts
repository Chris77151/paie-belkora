/**
 * Types de données — calqués sur le schéma Supabase de la spécification (§3.1).
 * En V1 la persistance est locale (localStorage) ; ces types restent valides pour
 * un branchement Supabase ultérieur (mêmes colonnes).
 */
import type { PayrollResult, CnssExemption } from "@/lib/payroll-engine";
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
  /** Couleur de marque (hex, ex. « #8DB94E ») — spectre des bulletins. Vide = vert Miya par défaut. */
  brand_color?: string;
  payslip_template_latex?: string;
  address?: string;
  city?: string;
  /** Signataire par défaut des documents RH (attestations, certificats). Éditable avant émission. */
  signatory_name?: string;
  signatory_role?: string;
  /** Identifiant de la société correspondante dans Odoo (res.company.id) pour l'import. */
  odoo_company_id?: number;
  /**
   * Sel (256 bits, hex) de l'audit RIB — sert à calculer l'empreinte HMAC-SHA-256 des RIB.
   * Généré automatiquement à la première base de référence. Ne contient AUCUN RIB.
   */
  bank_audit_salt?: string;
}

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
  other_gross: number;
  transport_outside_urban?: boolean;
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

export type BankEventClass =
  | "AUTORISE" | "NON_AUTORISE" | "A_VERIFIER" | "NOUVEAU" | "SUPPRIME";
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

export interface AppState {
  firms: Firm[];
  employees: Employee[];
  periods: PayrollPeriod[];
  payslips: Payslip[];
  leaves: Leave[];
  /** Registre des accidents du travail. */
  workAccidents?: WorkAccident[];
  /** Clôtures comptables validées (verrou + snapshot par période). */
  accountingClosures?: AccountingClosure[];
  /** Comptes de connexion à l'application (auth locale). */
  users?: AppUser[];
  currentFirmId: string;
  odoo?: OdooConfig;
  /** Rôle simulé de l'utilisateur courant (V1 local ; auth Supabase à brancher). */
  currentRole?: AppRole;
  /** Dernier rapport d'audit RIB (par société), masqué. */
  bankAudit?: BankAuditEvent[];
  /** Base de référence des RIB validés (empreintes) pour la détection d'écart. */
  bankBaseline?: BankBaseline[];
}
