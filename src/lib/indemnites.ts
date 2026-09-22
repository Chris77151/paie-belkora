/**
 * Indemnités exonérées — calcul des parts exonérées IR et CNSS (moteur PUR, testé).
 *
 * Le barème vit dans `params.ts` (`indemnitesBareme`), établi sur les deux textes officiels :
 * l'arrêté n° 1314-25 publié au BO n° 7443 (CNSS) et la note de service DGI du 13 mars 2017 (IR).
 * Ce module ne fait que l'appliquer.
 *
 * Point structurant : les deux textes ne donnent PAS les mêmes plafonds. La CNSS exprime la
 * caisse, le lait, l'outillage et la salissure en multiples du SMIG horaire par 26 jours ;
 * l'IR les exprime en dirhams. Les gratifications sociales sont exonérées jusqu'à 5 000 DH/an
 * côté CNSS, 2 500 DH/an côté IR. Un moteur qui ne tient qu'une seule « part exonérée » se
 * trompe donc nécessairement sur l'une des deux assiettes : on calcule les deux, séparément.
 *
 * Aucune horloge, aucun état : les montants déjà exonérés dans l'année (plafonds annuels) sont
 * injectés par l'appelant.
 */
import type { CapRule, IndemniteDef, IndemniteKey, PayrollParams, Regime } from "./params";

export type { Regime } from "./params";

/** Situation de voiture de service du salarié pour le mois. */
export type VoitureService = "aucune" | "retour_quotidien" | "permanente";

/** Ce qu'il faut savoir du mois pour évaluer un plafond. */
export interface CapContext {
  smigHourly: number;
  daysWorked: number;
  /** Salaire de base du mois (proratisé), assiette des plafonds en pourcentage. */
  salaireBase: number;
  /**
   * Brut imposable de référence pour les plafonds « 20 % du salaire brut imposable » (panier et
   * titres côté IR) : brut HORS indemnités. Le vrai SBI dépend lui-même de ces exonérations —
   * le prendre créerait une boucle. Le brut hors indemnités lui est inférieur ou égal : le
   * plafond qui en résulte ne peut donc qu'être plus prudent.
   */
  brutRef: number;
  /** Kilomètres professionnels du mois (indemnité kilométrique). */
  km: number;
  /** Kilomètres entre l'ancien et le nouveau lieu d'habitation (indemnité de mutation). */
  kmMutation?: number;
  /** Trajet hors périmètre urbain : plafond de transport à 750 au lieu de 500. */
  transportOutsideUrban: boolean;
  /** Voiture de service : conditionne l'avantage en nature et fait tomber certaines indemnités. */
  voitureService?: VoitureService;
  /**
   * Voiture laissée en permanence : bénéficiaire cadre dirigeant, ou agent itinérant disposant
   * d'une lettre d'affectation. Sans cette justification, l'avantage en nature est soumis.
   */
  voitureJustifiee?: boolean;
}

/** Montants déjà exonérés depuis le 1er janvier, par régime — consomment les plafonds annuels. */
export type YtdExempt = Partial<Record<Regime, Partial<Record<IndemniteKey, number>>>>;

/** Une indemnité du mois, et son sort dans chaque régime. */
export interface IndemniteLine {
  key: IndemniteKey;
  label: string;
  montant: number;
  exoIr: number;
  exoCnss: number;
  /** Motif de non-cumul ayant fait tomber l'exonération, régime par régime. */
  exclusion?: Partial<Record<Regime, string>>;
}

type TransportCaps = Pick<PayrollParams, "transportIntraUrbanCap" | "transportOutsideUrbanCap">;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** La condition du texte est-elle remplie pour l'avantage voiture de service ? */
function voitureOk(ctx: CapContext): boolean {
  if (ctx.voitureService === "retour_quotidien") return true;
  if (ctx.voitureService === "permanente") return !!ctx.voitureJustifiee;
  return false;
}

/**
 * Plafond MENSUEL disponible pour une règle. Pour un plafond annuel, c'est le reliquat de
 * l'année. Pour une exonération conditionnelle, c'est le montant versé si la condition est
 * remplie, zéro sinon — jamais un plafond illimité.
 */
export function capOf(rule: CapRule, ctx: CapContext, p: TransportCaps, ytd = 0, montant = 0): number {
  const days = Math.max(0, ctx.daysWorked);
  const pctCap = (v: number, pct?: number) => (pct != null ? Math.min(v, round2(pct * Math.max(0, ctx.brutRef))) : v);
  switch (rule.kind) {
    case "fixe_mois": return rule.amount;
    case "fixe_jour": return pctCap(round2(rule.amount * days), rule.maxPctBrut);
    case "smig_jour": return pctCap(round2(rule.factor * ctx.smigHourly * days), rule.maxPctBrut);
    // BO 7443 : « n fois le SMIG horaire, pour chaque 26 jours de travail » — proratisé.
    case "smig_26j": return round2((rule.factor * ctx.smigHourly * days) / 26);
    case "indexe_smig": return round2((rule.base * ctx.smigHourly) / rule.smigRef);
    case "pct_base": {
      const v = round2(rule.rate * Math.max(0, ctx.salaireBase));
      return rule.max != null ? Math.min(v, rule.max) : v;
    }
    case "par_km": {
      const km = rule.kmField === "km_mutation" ? (ctx.kmMutation ?? 0) : ctx.km;
      return round2(rule.rate * Math.max(0, km));
    }
    case "fixe_an": return Math.max(0, round2(rule.amount - Math.max(0, ytd)));
    case "transport": return ctx.transportOutsideUrban ? p.transportOutsideUrbanCap : p.transportIntraUrbanCap;
    case "si_justifie": return voitureOk(ctx) ? Math.max(0, montant) : 0;
  }
}

/**
 * Répartit chaque indemnité entre part exonérée et part imposable, POUR CHAQUE RÉGIME.
 *
 * Deux mécanismes viennent des textes :
 *  - les NON-CUMULS (`excludedBy`) font tomber l'exonération d'une indemnité quand la situation
 *    visée se présente — le panier avec des titres-restaurant, le transport avec une voiture de
 *    service ;
 *  - les GROUPES partagent un seul plafond — la salissure et l'usure de vêtements sont un même
 *    élément : servir les deux ne double pas l'exonération.
 */
export function splitIndemnites(
  amounts: Partial<Record<IndemniteKey, number>>,
  bareme: IndemniteDef[],
  ctx: CapContext,
  p: TransportCaps,
  ytd: YtdExempt = {},
): IndemniteLine[] {
  const groupLeft: Record<Regime, Map<string, number>> = { ir: new Map(), cnss: new Map() };

  const situation = {
    titres_restaurant: (amounts.titres_restaurant ?? 0) > 0,
    voiture_service: !!ctx.voitureService && ctx.voitureService !== "aucune",
  };

  const exempt = (def: IndemniteDef, regime: Regime, montant: number): { exo: number; reason?: string } => {
    const excl = def.excludedBy?.find((x) => x.regimes.includes(regime) && situation[x.when]);
    if (excl) return { exo: 0, reason: excl.reason };

    const rule = regime === "ir" ? def.ir : def.cnss;
    const cap = capOf(rule, ctx, p, ytd[regime]?.[def.key] ?? 0, montant);
    if (!def.group) return { exo: round2(Math.min(montant, cap)) };
    const left = groupLeft[regime].has(def.group) ? groupLeft[regime].get(def.group)! : cap;
    const used = round2(Math.min(montant, left, cap));
    groupLeft[regime].set(def.group, round2(left - used));
    return { exo: used };
  };

  const lines: IndemniteLine[] = [];
  for (const def of bareme) {
    const montant = round2(Math.max(0, amounts[def.key] ?? 0));
    if (montant <= 0) continue;
    const ir = exempt(def, "ir", montant);
    const cnss = exempt(def, "cnss", montant);
    const exclusion: Partial<Record<Regime, string>> = {};
    if (ir.reason) exclusion.ir = ir.reason;
    if (cnss.reason) exclusion.cnss = cnss.reason;
    lines.push({
      key: def.key,
      label: def.label,
      montant,
      exoIr: ir.exo,
      exoCnss: cnss.exo,
      ...(ir.reason || cnss.reason ? { exclusion } : {}),
    });
  }
  return lines;
}

/** Totaux d'une répartition. */
export function totals(lines: IndemniteLine[]): { brut: number; exoIr: number; exoCnss: number } {
  return lines.reduce(
    (t, l) => ({
      brut: round2(t.brut + l.montant),
      exoIr: round2(t.exoIr + l.exoIr),
      exoCnss: round2(t.exoCnss + l.exoCnss),
    }),
    { brut: 0, exoIr: 0, exoCnss: 0 },
  );
}

/** Libellé lisible d'une règle de plafond, pour la saisie et le bulletin. */
export function describeCap(rule: CapRule, smigHourly: number): string {
  const dh = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} DH`;
  const pct = (x?: number) => (x != null ? `, max ${Math.round(x * 100)} % du brut imposable` : "");
  switch (rule.kind) {
    case "fixe_mois": return `${dh(rule.amount)} / mois`;
    case "fixe_jour": return `${dh(rule.amount)} / jour travaillé${pct(rule.maxPctBrut)}`;
    case "smig_jour": return `${rule.factor} x SMIG horaire / jour (${dh(rule.factor * smigHourly)})${pct(rule.maxPctBrut)}`;
    case "smig_26j": return `${rule.factor} x SMIG horaire / 26 jours (${dh(rule.factor * smigHourly)} / mois complet)`;
    case "indexe_smig": return `${dh(rule.base)} indexé SMIG (${dh((rule.base * smigHourly) / rule.smigRef)} / mois)`;
    case "pct_base": return `${Math.round(rule.rate * 100)} % du salaire de base${rule.max != null ? `, max ${dh(rule.max)}` : ""}`;
    case "par_km": return `${dh(rule.rate)} / km`;
    case "fixe_an": return `${dh(rule.amount)} / an`;
    case "transport": return "500 DH urbain / 750 DH hors périmètre";
    case "si_justifie": return "totalement, si la condition est justifiée";
  }
}
