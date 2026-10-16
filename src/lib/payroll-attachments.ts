/**
 * Pièces justificatives de paie — moteur PUR (traçabilité des fonds et des preuves).
 *
 * Trois natures, un seul registre par entité × période :
 *   - fiche signée (`emargement_signee`) : la fiche d'émargement SIGNÉE par les
 *     salariés = PREUVE du paiement (art. 370) ;
 *   - mise à disposition (`mise_a_disposition`) : les fonds alloués pour payer,
 *     avec leur montant constaté = base du RAPPROCHEMENT réel ;
 *   - livre manuel (`livre_paie_manuel`) : le livre de paie tenu À LA MAIN et signé
 *     (preuve côté déclarés, art. 371-373).
 *
 * Le rapprochement compare, pour une période, le total VERSÉ (saisies de l'app)
 * au total MIS À DISPOSITION (pièces) : tout écart est un reliquat à justifier.
 */
import type { PayrollAttachment, PayrollAttachmentKind } from "@/data/types";

export const PAYROLL_ATTACHMENT_LABEL: Record<PayrollAttachmentKind, string> = {
  emargement_signee: "Fiche d'émargement signée",
  mise_a_disposition: "Mise à disposition des fonds",
  livre_paie_manuel: "Livre de paie manuel signé",
};

export const PAYROLL_ATTACHMENT_HINT: Record<PayrollAttachmentKind, string> = {
  emargement_signee: "Scan de la fiche signée ou empreintée par les salariés (preuve de paiement, art. 370).",
  mise_a_disposition: "Justificatif des fonds alloués (retrait, avance au payeur) + montant constaté.",
  livre_paie_manuel: "Livre de paie tenu à la main et signé (preuve, art. 371-373).",
};

/** Pièces d'une entité sur une période (mois 0 = toute l'année pour le livre annuel). */
export function payrollAttachmentsOf(
  list: PayrollAttachment[] | undefined,
  firmId: string,
  year: number,
  month: number,
): PayrollAttachment[] {
  return (list ?? [])
    .filter((a) => a.firm_id === firmId && a.year === year && (month === 0 || a.month === month))
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

/** Total des mises à disposition constatées (DH) sur une période. */
export function misesADispositionTotal(
  list: PayrollAttachment[] | undefined,
  firmId: string,
  year: number,
  month: number,
): number {
  const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
  return payrollAttachmentsOf(list, firmId, year, month)
    .filter((a) => a.kind === "mise_a_disposition")
    .reduce((t, a) => r2(t + (a.montant ?? 0)), 0);
}

export interface Rapprochement {
  /** Total NET versé saisi dans l'app (DH). */
  verse: number;
  /** Total mis à disposition constaté sur pièces (DH). */
  misADisposition: number;
  /** Reliquat = mis à disposition − versé (positif = fonds non distribués). */
  ecart: number;
  /** Le rapprochement est-il équilibré (au centime) ? */
  equilibre: boolean;
  /** Y a-t-il matière à rapprocher (au moins un versement ou une mise) ? */
  aMatiere: boolean;
}

/**
 * Rapprochement RÉEL d'une période : ce qui a été versé (saisies) contre ce qui
 * a été mis à disposition (pièces). PUR et testé.
 */
export function rapprocherPaie(verseNet: number, misADisposition: number): Rapprochement {
  const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
  const verse = r2(verseNet);
  const mis = r2(misADisposition);
  const ecart = r2(mis - verse);
  return {
    verse, misADisposition: mis, ecart,
    equilibre: ecart === 0,
    aMatiere: verse !== 0 || mis !== 0,
  };
}
