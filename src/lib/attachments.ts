/**
 * Pièces justificatives — nomenclature FERMÉE et moteur de complétude (PUR, testé).
 *
 * La nomenclature est fermée à dessein : un libellé libre ne permet aucun calcul. C'est
 * `AttachmentKind` qui rend le dossier pilotable — « il manque la CIN et le contrat » plutôt
 * qu'un tas de fichiers sans qualification.
 *
 * Aucune dépendance au DOM ni à l'horloge hors des fonctions explicitement asynchrones
 * (empreinte SHA-256) : la complétude reçoit sa date d'arrêté en paramètre, comme le registre
 * du personnel, sans quoi elle ne serait ni testable ni reproductible d'une édition à l'autre.
 */
import type { Attachment, AttachmentKind, Employee } from "@/data/types";

/** Définition d'une nature de pièce. */
export interface AttachmentKindDef {
  key: AttachmentKind;
  label: string;
  /** Ce que la pièce prouve, et sa base quand elle en a une. */
  hint: string;
  /** Donnée sensible (identité, santé, bancaire) : accès restreint, minimisation loi 09-08. */
  confidential: boolean;
}

/**
 * Natures de pièces du dossier salarié. Ordre = ordre d'affichage (du plus structurant au
 * plus accessoire). Les bases légales citées sont à confirmer par le conseil juridique avant
 * tout usage contentieux.
 */
export const ATTACHMENT_KINDS: AttachmentKindDef[] = [
  { key: "cin", label: "CIN", hint: "Carte d'identité nationale, recto-verso — art. 24 CT.", confidential: true },
  { key: "contrat", label: "Contrat de travail signé", hint: "Exemplaire signé par les deux parties — art. 15 CT.", confidential: false },
  { key: "cnss", label: "Immatriculation CNSS", hint: "Attestation d'immatriculation ou accusé de déclaration d'entrée DAMANCOM.", confidential: false },
  { key: "anapec", label: "Convention ANAPEC / de stage", hint: "Pièce qui fonde l'exonération de cotisations (Idmaj, Tahfiz, stage).", confidential: false },
  { key: "rib", label: "RIB bancaire", hint: "RIB officiel + demande écrite du salarié — contrôle anti-fraude au virement.", confidential: true },
  { key: "medical", label: "Aptitude médicale", hint: "Visite d'embauche ou visite périodique — art. 327 CT.", confidential: true },
  { key: "diplome", label: "Diplôme / habilitation", hint: "Diplômes, certificats antérieurs, habilitations de chantier.", confidential: false },
  { key: "famille", label: "Situation de famille", hint: "Acte de mariage, actes de naissance, attestations de scolarité — déductions IR.", confidential: true },
  { key: "residence", label: "Justificatif de domicile", hint: "Fiabilise l'adresse de notification.", confidential: true },
  { key: "sortie", label: "Pièce de sortie", hint: "Démission, lettre de licenciement + AR, PV de fin de travaux, accord de rupture.", confidential: false },
  { key: "autre", label: "Autre pièce", hint: "Toute autre pièce du dossier — préciser le libellé.", confidential: false },
];

const BY_KEY = new Map(ATTACHMENT_KINDS.map((k) => [k.key, k]));

/** Libellé lisible d'une nature (repli sur la clé pour une valeur inconnue d'une version future). */
export function attachmentKindLabel(kind: AttachmentKind): string {
  return BY_KEY.get(kind)?.label ?? kind;
}

/** La nature porte-t-elle une donnée sensible ? Inconnue → traitée comme sensible (prudence). */
export function isConfidentialKind(kind: AttachmentKind): boolean {
  return BY_KEY.get(kind)?.confidential ?? true;
}

/* -------------------------------------------------- contrôle du fichier déposé -------------------------------------------------- */

/** Types acceptés : de quoi couvrir un scan, une photo de CIN et un PDF signé. */
export const ACCEPTED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/tiff",
] as const;

/** Attribut `accept` de l'input fichier (aligné sur `ACCEPTED_MIMES`). */
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff";

/** Plafond par fichier. Un scan de CIN ou un contrat de 10 pages tiennent largement dessous. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Message d'erreur si le fichier est refusé, `null` s'il est accepté. */
export function rejectReason(mime: string, size: number): string | null {
  if (size <= 0) return "Fichier vide.";
  if (size > MAX_ATTACHMENT_BYTES) {
    return `Fichier trop volumineux (${formatBytes(size)}) — maximum ${formatBytes(MAX_ATTACHMENT_BYTES)}.`;
  }
  if (!(ACCEPTED_MIMES as readonly string[]).includes(mime)) {
    return "Format non accepté — déposer un PDF ou une image (JPG, PNG, WEBP, HEIC, TIFF).";
  }
  return null;
}

/** Taille lisible, en unités binaires (1 Ko = 1024 o), séparateur français. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0).replace(".", ",")} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/* -------------------------------------------------- complétude du dossier -------------------------------------------------- */

/**
 * Pièces ATTENDUES pour ce salarié, déduites de sa situation réelle — jamais une liste figée :
 * une pièce n'est réclamée que si un fait la rend nécessaire (un RIB saisi appelle son
 * justificatif, un contrat ANAPEC appelle sa convention, une sortie appelle sa pièce).
 * `asOf` (ISO « AAAA-MM-JJ ») fixe la date d'arrêté du raisonnement.
 */
export function expectedKinds(emp: Employee, asOf: string): AttachmentKind[] {
  const out: AttachmentKind[] = ["cin", "contrat"];

  // Immatriculation : la pièce est attendue dès qu'un numéro est porté au dossier.
  if (emp.cnss_number?.trim()) out.push("cnss");

  // Régimes dérogatoires : l'exonération ne se présume pas, elle se prouve.
  if (emp.contract_type === "ANAPEC" || emp.contract_type === "Stagiaire" || (emp.cnss_exemption && emp.cnss_exemption !== "none")) {
    out.push("anapec");
  }

  // Le RIB n'est réclamé que si le salaire part effectivement par banque.
  const paysByBank = emp.payment_mode === "virement" || emp.payment_mode === "cheque" || !!emp.bank_rib?.trim();
  if (paysByBank) out.push("rib");

  // Aptitude médicale : exigée sur site dangereux et pour un mineur (art. 143-181, 327 CT).
  if (emp.hazardous_site || isMinorAt(emp.birth_date, asOf)) out.push("medical");

  // Déductions pour charge de famille : la pièce fonde l'abattement IR.
  if (emp.dependents > 0) out.push("famille");

  // Sortie : la pièce est attendue dès qu'une date ou un motif est saisi.
  if (emp.exit_date || emp.exit_reason) out.push("sortie");

  return out;
}

/** Le salarié a-t-il moins de 18 ans à la date d'arrêté ? Faux si la naissance est inconnue. */
export function isMinorAt(birthDate: string | undefined, asOf: string): boolean {
  if (!birthDate || !asOf) return false;
  const b = Date.parse(birthDate);
  const d = Date.parse(asOf);
  if (Number.isNaN(b) || Number.isNaN(d)) return false;
  const majority = new Date(birthDate);
  majority.setFullYear(majority.getFullYear() + 18);
  return d < majority.getTime();
}

export interface Completeness {
  /** Natures attendues pour ce salarié. */
  expected: AttachmentKind[];
  /** Natures effectivement couvertes par au moins une pièce. */
  present: AttachmentKind[];
  /** Natures attendues qu'aucune pièce ne couvre. */
  missing: AttachmentKind[];
  /** Pourcentage entier 0-100. 100 quand rien n'est attendu (dossier sans obligation). */
  pct: number;
}

/**
 * Confronte les pièces réellement déposées aux pièces attendues. `attachments` doit déjà être
 * filtré sur le salarié concerné — la fonction ne connaît pas le périmètre, elle compte.
 */
export function completeness(emp: Employee, attachments: Attachment[], asOf: string): Completeness {
  const expected = expectedKinds(emp, asOf);
  const have = new Set(attachments.map((a) => a.kind));
  const present = expected.filter((k) => have.has(k));
  const missing = expected.filter((k) => !have.has(k));
  const pct = expected.length === 0 ? 100 : Math.round((present.length / expected.length) * 100);
  return { expected, present, missing, pct };
}

/* -------------------------------------------------- empreinte -------------------------------------------------- */

/**
 * Empreinte SHA-256 (hex) du contenu. Même discipline que l'audit RIB : un scan sans empreinte,
 * sans horodatage et sans auteur n'a pas plus de valeur probante qu'une photocopie.
 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
