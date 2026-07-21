/**
 * Jeu de démonstration. Données fictives à visée d'illustration
 * (les identifiants ICE/RC/CNSS ne sont PAS des immatriculations réelles).
 */
import type { AppState, AppUser, Employee, Firm } from "./types";

/**
 * Super utilisateur racine de l'application (authentification locale).
 *
 * Identifiant : christian.agnamon@pepinierebelkora.com   ·   Mot de passe : Chris77141
 *
 * `password_hash` = SHA-256("Chris77141") en hexadécimal. Le mot de passe en clair
 * n'apparaît NULLE PART dans le code ni dans le stockage. Ce compte est indestructible
 * et toujours ré-injecté au chargement (cf. migrate()) pour empêcher tout auto-verrouillage.
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
    odoo_company_id: 1, // Odoo res.company : Pépinière Belkora
  };

  const e = (o: Partial<Employee> & Pick<Employee, "id" | "firm_id" | "first_name" | "last_name" | "hire_date" | "contract_type" | "base_hourly_rate">): Employee => ({
    monthly_hours: 191,
    dependents: 0,
    is_active: true,
    ...o,
  });

  const employees: Employee[] = [
    e({
      id: "emp_1", firm_id: "firm_miya", matricule: "MBD-001",
      first_name: "Yassine", last_name: "El Amrani", cin: "EE123456",
      cnss_number: "112233445", birth_date: "1990-04-12", hire_date: "2019-03-01",
      contract_type: "CDI", position: "Concepteur paysagiste", site: "Bureau Marrakech",
      base_hourly_rate: 92.5, dependents: 2, marital_status: "marié", bank_rib: "0111...",
    }),
    e({
      id: "emp_2", firm_id: "firm_miya", matricule: "MBD-002",
      first_name: "Fatima", last_name: "Bennani", cin: "E987654",
      cnss_number: "223344556", birth_date: "1995-09-30", hire_date: "2022-06-15",
      contract_type: "CDI", position: "Assistante administrative", site: "Bureau Marrakech",
      base_hourly_rate: 25.0, dependents: 1,
    }),
    e({
      id: "emp_3", firm_id: "firm_miya", matricule: "MBD-003",
      first_name: "Karim", last_name: "Ouhbi", // pas de CNSS -> alerte critique
      birth_date: "1998-01-20", hire_date: "2024-11-01",
      contract_type: "ANAPEC", position: "Dessinateur", site: "Bureau Marrakech",
      base_hourly_rate: 22.0, dependents: 0,
    }),
    e({
      id: "emp_4", firm_id: "firm_miya", matricule: "MBD-004",
      first_name: "Salma", last_name: "Rachidi", cin: "EA221100",
      cnss_number: "334455667", birth_date: "1988-12-05", hire_date: "2015-02-10",
      contract_type: "CDI", position: "Directrice de projet", site: "Bureau Marrakech",
      base_hourly_rate: 157.0, dependents: 3, marital_status: "mariée",
    }),
    e({
      id: "emp_5", firm_id: "firm_pep", matricule: "PEP-014",
      first_name: "Brahim", last_name: "Ait Baha", cin: "HH445566",
      cnss_number: "445566778", birth_date: "1979-07-14", hire_date: "2012-05-20",
      contract_type: "CDI", position: "Chef de culture", site: "Ourika",
      base_hourly_rate: 17.92, dependents: 4,
    }),
    e({
      id: "emp_6", firm_id: "firm_pep", matricule: "PEP-031",
      first_name: "Hicham", last_name: "Zerouali", // CIN manquante -> warning
      cnss_number: "556677889", birth_date: "2007-10-02", hire_date: "2025-06-01",
      contract_type: "CDD", contract_end: "2026-07-20", // expire bientôt -> warning
      position: "Ouvrier arrosage", site: "Ourika", hazardous_site: true, // mineur + site -> critique
      base_hourly_rate: 17.92, dependents: 0,
    }),
    e({
      id: "emp_7", firm_id: "firm_pep", matricule: "PEP-032",
      first_name: "Rachida", last_name: "Naciri", cin: "H778899",
      cnss_number: "667788990", birth_date: "1992-03-18", hire_date: "2021-09-01",
      contract_type: "CDD", contract_end: "2026-12-31",
      position: "Ouvrière pépinière", site: "Ourika",
      base_hourly_rate: 17.92, dependents: 2,
    }),
  ];

  return {
    firms: [miya, pep],
    employees,
    periods: [],
    payslips: [],
    leaves: [
      { id: "lv_1", employee_id: "emp_2", type: "conge_paye", start_date: "2026-07-13", end_date: "2026-07-17", days: 5, cnss_ipe: false },
      { id: "lv_2", employee_id: "emp_5", type: "maladie", start_date: "2026-06-24", end_date: "2026-06-27", days: 4, cnss_ipe: true },
      { id: "lv_3", employee_id: "emp_4", type: "maternite", start_date: "2026-05-01", end_date: "2026-08-06", days: 98, cnss_ipe: true },
    ],
    users: [SUPER_ADMIN],
    currentFirmId: "firm_miya",
    currentRole: "firm_admin",
    bankAudit: [],
    bankBaseline: [],
  };
}
