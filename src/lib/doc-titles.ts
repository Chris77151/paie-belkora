/**
 * TITRES DES DOCUMENTS — source unique (centralisation).
 *
 * Les titres affichés en tête des documents tabulaires (bulletin, écritures, bordereau, livre de
 * paie, registre) étaient jusqu'ici codés EN DUR dans chaque module d'export — et « BULLETIN DE
 * PAIE » l'était même en triple (PDF, HTML, LaTeX). Ils sont désormais définis ICI, une seule fois.
 *
 * Les familles de documents à TITRE VARIABLE selon le type sont déjà centralisées dans leur module
 * (elles n'ont pas besoin d'être redéfinies ici) :
 *   - CONTRAT DE TRAVAIL     → `CONTRACT_TITLE`  (rh-contracts.ts)   ex. « CONTRAT POUR ACCOMPLIR UN TRAVAIL DÉTERMINÉ »
 *   - SANCTION DISCIPLINAIRE → `DISCIPLINE_TITLE` (rh-discipline.ts)
 *   - RUPTURE / STC          → `RUPTURE_TITLE`    (rh-rupture.ts)
 *   - TRAVAIL DES MINEURS    → `MINEUR_TITLE`     (rh-mineurs.ts)
 *   - ATTESTATIONS / DOCS RH → `DOC_TITLE`        (rh-documents.ts)
 *
 * Tous ces titres sont rendus CENTRÉS par le socle typographique commun (`pdf-kit.ts` :
 * `drawTitleText`/`drawTitleBox`) côté PDF, et par `text-align:center` côté HTML/aperçu.
 */
export const DOC_TITLES = {
  /** Bulletin de paie (payslip.ts — PDF, HTML, LaTeX). */
  bulletin: "BULLETIN DE PAIE",
  /** Écritures comptables de paie (accounting-export.ts). */
  ecritures: "Écritures comptables de paie",
  /** Bordereau de déclaration CNSS (declaration-export.ts). */
  bordereauCnss: "Bordereau de déclaration CNSS",
  /** Livre de paie (payroll-book-export.ts). */
  livrePaie: "Livre de paie",
  /** Registre des mouvements de main-d'œuvre (staff-register-export.ts). */
  registreMouvements: "Registre des mouvements de main-d'œuvre",
} as const;

export type DocTitleKey = keyof typeof DOC_TITLES;
