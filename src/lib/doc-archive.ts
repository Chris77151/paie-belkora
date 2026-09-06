/**
 * Archivage des documents produits — le pont entre la production d'un PDF et le Journal des
 * documents.
 *
 * Jusqu'ici le journal traçait qu'un document avait été produit ; il ne le CONSERVAIT pas.
 * Or c'est la pièce réellement remise qui fait foi : une régénération ultérieure porterait
 * d'autres données (barème de l'année, fiche salarié modifiée, signataire changé) et ne serait
 * donc plus le même acte. On archive donc le binaire exact, sous la clé de sa trace.
 *
 * L'échec d'archivage n'annule JAMAIS la production du document : l'utilisateur a son PDF,
 * seule l'archive manque, et le journal le dit honnêtement (pas de bouton de téléchargement).
 */
import { actions } from "@/data/store";
import type { DocFormat, DocType, Employee, Firm } from "@/data/types";
import { sha256Hex } from "./attachments";
import { putBinary } from "./blob-store";
import type { GeneratedPdf } from "./rh-legal";

/** Trace d'un document produit, à consigner au journal. */
export interface DocTrace {
  firm: Firm;
  docType: DocType;
  format: DocFormat;
  employee?: Employee;
  /** Sujet affiché — par défaut le salarié, sinon la société. */
  subject?: string;
  periodYear?: number;
  periodMonth?: number;
}

/** Consigne un document au journal SANS archive (HTML, LaTeX, BDS, impression). */
export function traceDoc(tr: DocTrace): string {
  return actions.recordDocGeneration({
    firm_id: tr.firm.id,
    doc_type: tr.docType,
    format: tr.format,
    employee_id: tr.employee && tr.employee.id !== "__manual__" ? tr.employee.id : undefined,
    subject: tr.subject ?? (tr.employee ? `${tr.employee.first_name} ${tr.employee.last_name}`.trim() : tr.firm.name),
    period_year: tr.periodYear,
    period_month: tr.periodMonth,
  });
}

/**
 * Produit un PDF, le consigne au journal ET y attache le binaire exact.
 *
 * `produce` est la fonction d'export existante (elle télécharge déjà le fichier côté
 * utilisateur et renvoie son blob). Rien n'est recalculé : on archive ce qui a été remis.
 */
export async function traceAndArchivePdf(tr: DocTrace, produce: () => Promise<GeneratedPdf>): Promise<void> {
  const { blob, filename } = await produce();
  const eventId = traceDoc(tr);
  try {
    const bytes = await blob.arrayBuffer();
    await putBinary(eventId, blob, filename);
    actions.setDocArchive(eventId, { filename, size: blob.size, sha256: await sha256Hex(bytes) });
  } catch {
    // Stockage local indisponible (mode privé, quota) : le document reste produit et tracé,
    // simplement sans archive téléchargeable. On ne masque pas l'absence, on ne bloque rien.
  }
}
