/**
 * Jeu de départ. Les deux sociétés du Groupe Belkora sont pré-renseignées ; AUCUN salarié
 * fictif n'est chargé — la liste des salariés démarre vide (à saisir ou à importer depuis Odoo).
 * (Les identifiants ICE/RC/CNSS des sociétés restent à vérifier avant tout usage officiel.)
 */
import type { AppState, AppUser, Firm } from "./types";

/**
 * Super utilisateur racine de l'application (authentification locale).
 *
 * Identifiant : christian.agnamon@pepinierebelkora.com
 *
 * Seul le `password_hash` (empreinte SHA-256, non réversible) est stocké : le mot de passe
 * en clair n'apparaît NULLE PART dans le code ni dans le stockage. Le mot de passe initial a
 * été communiqué hors code ; il doit être changé à la première connexion et peut être
 * réinitialisé par le super administrateur dans Paramètres → Utilisateurs. Ce compte est
 * indestructible et toujours ré-injecté au chargement (cf. migrate()) pour empêcher tout
 * auto-verrouillage.
 */
export const SUPER_ADMIN: AppUser = {
  id: "user_super",
  username: "christian.agnamon@pepinierebelkora.com",
  full_name: "Christian Agnamon",
  role: "super_admin",
  firm_id: null,
  password_hash: "3a59f366fd671465fdb5df76402aed0b007b3b8b0016f7b6faa5c11acb71151d",
  is_active: true,
  is_super: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

export function seed(): AppState {
  const miya: Firm = {
    id: "firm_miya",
    name: "Miya Belkora Design SARL AU",
    legal_form: "SARL AU",
    share_capital: 100000,
    ice: "002700000000097",
    rc: "45231",
    rc_city: "Marrakech",
    cnss_affiliation: "7801234",
    if_fiscal: "45120078",
    patente: "45720012",
    phone: "+212 5 24 00 00 00",
    email: "contact@miyabelkoradesign.ma",
    regime: "SMIG",
    logo_path: "/logo-miya.png",
    city: "Marrakech",
    address: "Route de l'Ourika, Marrakech",
    signatory_name: "Miya BELKORA",
    signatory_role: "Gérante",
    odoo_company_id: 2, // Odoo res.company : Miya Belkora Design
  };
  const pep: Firm = {
    id: "firm_pep",
    name: "Pépinière Belkora",
    legal_form: "Personne physique",
    ice: "003100000000042",
    rc: "12874",
    rc_city: "Marrakech",
    cnss_affiliation: "1209876",
    if_fiscal: "22004510",
    patente: "45611230",
    phone: "+212 5 24 11 11 11",
    email: "contact@pepinierebelkora.com",
    regime: "SMAG",
    city: "Marrakech",
    address: "Douar Tnine, Ourika",
    signatory_name: "Ahmed BELKORA",
    signatory_role: "Gérant",
    brand_color: "#2E7D5B", // vert émeraude profond — spectre propre des bulletins Pépinière
    odoo_company_id: 1, // Odoo res.company : Pépinière Belkora
  };

  return {
    firms: [miya, pep],
    employees: [], // aucun salarié fictif — à saisir manuellement ou à importer depuis Odoo
    periods: [],
    payslips: [],
    leaves: [],
    workAccidents: [],
    accountingClosures: [],
    users: [SUPER_ADMIN],
    currentFirmId: "firm_miya",
    currentRole: "firm_admin",
    bankAudit: [],
    bankBaseline: [],
  };
}
