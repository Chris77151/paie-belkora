import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_KINDS,
  attachmentKindLabel,
  completeness,
  expectedKinds,
  formatBytes,
  isConfidentialKind,
  isMinorAt,
  MAX_ATTACHMENT_BYTES,
  rejectReason,
} from "./attachments";
import type { Attachment, AttachmentKind, Employee } from "@/data/types";

const BASE: Employee = {
  id: "e1",
  firm_id: "f1",
  first_name: "Fadwa",
  last_name: "Semlani",
  hire_date: "2020-01-06",
  contract_type: "CDI",
  base_hourly_rate: 20,
  monthly_hours: 191,
  dependents: 0,
  is_active: true,
};

const emp = (patch: Partial<Employee> = {}): Employee => ({ ...BASE, ...patch });
const att = (kind: AttachmentKind): Attachment => ({
  id: `a_${kind}`,
  firm_id: "f1",
  employee_id: "e1",
  kind,
  filename: `${kind}.pdf`,
  mime: "application/pdf",
  size: 1024,
  sha256: "0".repeat(64),
  uploaded_at: "2026-09-01T10:00:00.000Z",
});

const ASOF = "2026-09-06";

describe("nomenclature", () => {
  it("n'a aucune clé en double", () => {
    const keys = ATTACHMENT_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("qualifie les pièces d'identité, de santé et bancaires comme confidentielles", () => {
    expect(isConfidentialKind("cin")).toBe(true);
    expect(isConfidentialKind("medical")).toBe(true);
    expect(isConfidentialKind("rib")).toBe(true);
    expect(isConfidentialKind("contrat")).toBe(false);
  });

  it("traite une nature inconnue comme confidentielle (prudence)", () => {
    expect(isConfidentialKind("inconnu" as AttachmentKind)).toBe(true);
    expect(attachmentKindLabel("inconnu" as AttachmentKind)).toBe("inconnu");
  });
});

describe("contrôle du fichier déposé", () => {
  it("accepte un PDF de taille raisonnable", () => {
    expect(rejectReason("application/pdf", 250_000)).toBeNull();
  });

  it("accepte une photo de CIN", () => {
    expect(rejectReason("image/jpeg", 900_000)).toBeNull();
  });

  it("refuse un format non prévu", () => {
    expect(rejectReason("application/zip", 1000)).toMatch(/Format non accepté/);
  });

  it("refuse un fichier au-delà du plafond", () => {
    expect(rejectReason("application/pdf", MAX_ATTACHMENT_BYTES + 1)).toMatch(/trop volumineux/);
  });

  it("refuse un fichier vide", () => {
    expect(rejectReason("application/pdf", 0)).toBe("Fichier vide.");
  });
});

describe("formatBytes", () => {
  it("bascule d'unité aux bons seuils", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3,0 Mo");
  });
});

describe("isMinorAt", () => {
  it("reconnaît un mineur la veille de ses 18 ans", () => {
    expect(isMinorAt("2008-09-07", "2026-09-06")).toBe(true);
  });

  it("ne compte plus mineur le jour même des 18 ans", () => {
    expect(isMinorAt("2008-09-06", "2026-09-06")).toBe(false);
  });

  it("ne devine rien sans date de naissance", () => {
    expect(isMinorAt(undefined, "2026-09-06")).toBe(false);
  });
});

describe("expectedKinds — la pièce est réclamée par un FAIT, jamais par principe", () => {
  it("réclame au minimum la CIN et le contrat", () => {
    expect(expectedKinds(emp(), ASOF)).toEqual(["cin", "contrat"]);
  });

  it("réclame la convention dès qu'une exonération est portée au dossier", () => {
    expect(expectedKinds(emp({ contract_type: "ANAPEC" }), ASOF)).toContain("anapec");
    expect(expectedKinds(emp({ cnss_exemption: "patronale" }), ASOF)).toContain("anapec");
    expect(expectedKinds(emp({ cnss_exemption: "none" }), ASOF)).not.toContain("anapec");
  });

  it("ne réclame le RIB que si le salaire part par banque", () => {
    expect(expectedKinds(emp({ payment_mode: "especes" }), ASOF)).not.toContain("rib");
    expect(expectedKinds(emp({ payment_mode: "virement" }), ASOF)).toContain("rib");
    expect(expectedKinds(emp({ bank_rib: "0111...  " }), ASOF)).toContain("rib");
  });

  it("réclame l'aptitude médicale sur site dangereux et pour un mineur", () => {
    expect(expectedKinds(emp({ hazardous_site: true }), ASOF)).toContain("medical");
    expect(expectedKinds(emp({ birth_date: "2010-05-01" }), ASOF)).toContain("medical");
    expect(expectedKinds(emp({ birth_date: "1990-05-01" }), ASOF)).not.toContain("medical");
  });

  it("réclame la pièce de sortie dès qu'une date OU un motif est saisi", () => {
    expect(expectedKinds(emp({ exit_date: "2026-06-30" }), ASOF)).toContain("sortie");
    expect(expectedKinds(emp({ exit_reason: "demission" }), ASOF)).toContain("sortie");
  });

  it("réclame les pièces de famille dès qu'une déduction est demandée", () => {
    expect(expectedKinds(emp({ dependents: 2 }), ASOF)).toContain("famille");
    expect(expectedKinds(emp({ dependents: 0 }), ASOF)).not.toContain("famille");
  });
});

describe("completeness", () => {
  it("est à 0 % sur un dossier vide", () => {
    const c = completeness(emp(), [], ASOF);
    expect(c.pct).toBe(0);
    expect(c.missing).toEqual(["cin", "contrat"]);
  });

  it("atteint 100 % quand toutes les pièces attendues sont là", () => {
    const c = completeness(emp(), [att("cin"), att("contrat")], ASOF);
    expect(c.pct).toBe(100);
    expect(c.missing).toEqual([]);
  });

  it("ignore une pièce déposée mais non attendue (elle n'améliore pas le score)", () => {
    const c = completeness(emp(), [att("cin"), att("diplome")], ASOF);
    expect(c.pct).toBe(50);
    expect(c.missing).toEqual(["contrat"]);
  });

  it("compte une seule fois deux pièces de même nature", () => {
    const two = [att("cin"), { ...att("cin"), id: "a_cin2" }];
    expect(completeness(emp(), two, ASOF).present).toEqual(["cin"]);
  });

  it("arrondit à l'entier", () => {
    const e = emp({ dependents: 1 }); // cin, contrat, famille
    expect(completeness(e, [att("cin")], ASOF).pct).toBe(33);
  });
});
