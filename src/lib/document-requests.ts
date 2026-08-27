/**
 * Demandes de documents des salariés (self-service depuis l'accueil) — helpers PURS & testés.
 * Échéance de traitement = 48 h OUVRABLES (2 jours ouvrés, week-ends exclus) après la demande.
 */
import type { DocumentRequestStatus, DocumentRequestType } from "@/data/types";

/** Libellés FR des types de document demandables. */
export const DOC_REQUEST_TYPE_LABEL: Record<DocumentRequestType, string> = {
  attestation_travail: "Attestation de travail",
  attestation_salaire: "Attestation de salaire",
  certificat_travail: "Certificat de travail",
  domiciliation_irrevocable: "Attestation de domiciliation irrévocable de salaire",
  bulletin_paie: "Bulletin de paie",
  autre: "Autre document",
};

/** Libellés FR des statuts de traitement. */
export const DOC_REQUEST_STATUS_LABEL: Record<DocumentRequestStatus, string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  traite: "Traité",
  refuse: "Refusé",
};

/** Un statut est-il « clos » (plus d'échéance à tenir) ? */
export function isRequestClosed(status: DocumentRequestStatus): boolean {
  return status === "traite" || status === "refuse";
}

/**
 * Échéance de traitement (date ISO « AAAA-MM-JJ ») = 2 JOURS OUVRABLES après `requestedIso`
 * (week-ends samedi/dimanche exclus — « 48 h ouvrables »). PURE : la date d'entrée est fournie,
 * jamais `new Date()` implicite.
 */
export function documentRequestDeadline(requestedIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(requestedIso);
  if (!m) return requestedIso.slice(0, 10);
  // Calcul en UTC pur : indépendant du fuseau horaire (déterministe en test comme en prod).
  let ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let added = 0;
  while (added < 2) {
    ts += 86_400_000;
    const day = new Date(ts).getUTCDay(); // 0 = dimanche, 6 = samedi
    if (day !== 0 && day !== 6) added++;
  }
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * La demande est-elle EN RETARD ? `deadline`/`todayIso` au format « AAAA-MM-JJ ». Une demande close
 * (traitée/refusée) n'est jamais en retard. PURE.
 */
export function isRequestOverdue(deadline: string, todayIso: string, status: DocumentRequestStatus): boolean {
  if (isRequestClosed(status)) return false;
  return todayIso > deadline;
}
