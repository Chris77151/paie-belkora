/**
 * Paramètres de cotation des risques — SOURCE UNIQUE des échelles, seuils et abattements.
 *
 * Même discipline que `params.ts` pour les taux de paie : aucune valeur de cotation n'est écrite
 * en dur ailleurs. Une grille de cotation qui se déplace d'un exercice à l'autre permet de faire
 * descendre un risque sans rien changer au dispositif — c'est précisément ce qu'il faut empêcher.
 */

/** Niveau de gravité d'un score (probabilité × impact). */
export type RiskLevel = "faible" | "modere" | "eleve" | "critique";

/** Échelle de PROBABILITÉ — chaque niveau ancré sur une fréquence observable. */
export const LIKELIHOOD_SCALE: { value: 1 | 2 | 3 | 4 | 5; label: string; anchor: string }[] = [
  { value: 1, label: "Rare", anchor: "Moins d'une fois tous les 5 ans ; jamais survenu ici." },
  { value: 2, label: "Peu probable", anchor: "Une fois tous les 2 à 5 ans ; survenu ailleurs dans le secteur." },
  { value: 3, label: "Possible", anchor: "Une fois par an environ ; déjà survenu une fois ici." },
  { value: 4, label: "Probable", anchor: "Plusieurs fois par an ; survient dès que l'attention baisse." },
  { value: 5, label: "Quasi certain", anchor: "Mensuel ou permanent, tant que rien ne change." },
];

/**
 * Échelle d'IMPACT. Trois dimensions — financière, juridique, réputationnelle — dont on retient
 * la PLUS ÉLEVÉE : un risque peu coûteux mais à conséquence pénale reste un impact 5.
 */
export const IMPACT_SCALE: { value: 1 | 2 | 3 | 4 | 5; label: string; anchor: string }[] = [
  { value: 1, label: "Négligeable", anchor: "Moins de 5 000 DH ; régularisation interne." },
  { value: 2, label: "Mineur", anchor: "5 000 à 25 000 DH ; observation, mise en conformité." },
  { value: 3, label: "Modéré", anchor: "25 000 à 100 000 DH ; redressement, majoration de retard." },
  { value: 4, label: "Majeur", anchor: "100 000 à 500 000 DH ; contentieux prud'homal, amende." },
  { value: 5, label: "Critique", anchor: "Plus de 500 000 DH ; travail dissimulé, sanction pénale." },
];

/** Seuils de niveau, bornes hautes incluses. Fixes d'un exercice à l'autre. */
export const LEVEL_THRESHOLDS: { max: number; level: RiskLevel }[] = [
  { max: 4, level: "faible" },
  { max: 9, level: "modere" },
  { max: 14, level: "eleve" },
  { max: 25, level: "critique" },
];

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  faible: "Faible",
  modere: "Modéré",
  eleve: "Élevé",
  critique: "Critique",
};

/** Ordre croissant de gravité — sert au tri et aux comparaisons. */
export const LEVEL_ORDER: RiskLevel[] = ["faible", "modere", "eleve", "critique"];

/**
 * Poids d'un contrôle selon sa force. Un contrôle BLOQUANT (l'opération est impossible sans lui)
 * pèse davantage qu'un contrôle systématique mais contournable.
 */
export const CONTROL_WEIGHT = {
  fort: 1.5,
  moyen: 1.0,
  faible: 0.5,
} as const;

/**
 * Facteur d'automatisation. Un contrôle manuel abat moins : il dépend d'une personne présente,
 * disponible et formée — trois conditions qui tombent le jour où elles comptent le plus.
 */
export const AUTOMATION_FACTOR = {
  automatique: 1.0,
  semi: 0.75,
  manuel: 0.5,
} as const;

/**
 * Plafond d'abattement, par axe et en points d'échelle.
 *
 * Sans plafond, empiler cinq contrôles ferait tomber n'importe quel risque à 1 × 1. Or un
 * dispositif de contrôle ne supprime ni l'erreur humaine, ni la fraude interne, ni la
 * défaillance du système. Avec un plafond à 2, un risque coté 5 × 5 = 25 descend au mieux à
 * 3 × 3 = 9 : il reste modéré, jamais négligeable. C'est le message honnête d'une cartographie
 * de paie, et la première chose qu'un auditeur vient vérifier.
 */
export const MAX_ABATEMENT_POINTS = 2;

/** Plancher de chaque axe : le risque zéro n'existe pas, un axe nul sortirait le risque du suivi. */
export const AXIS_FLOOR = 1;

/**
 * Appétence par défaut : score résiduel maximal accepté sans plan de traitement. 9 = haut du
 * niveau modéré. Ajustable dans le volet — c'est une décision de direction, pas un paramètre
 * technique.
 */
export const DEFAULT_APPETITE = 9;

/** Niveau correspondant à un score. */
export function levelOf(score: number): RiskLevel {
  return LEVEL_THRESHOLDS.find((t) => score <= t.max)?.level ?? "critique";
}
