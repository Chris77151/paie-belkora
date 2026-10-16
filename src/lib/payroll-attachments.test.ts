import { describe, expect, it } from "vitest";
import type { PayrollAttachment } from "@/data/types";
import {
  misesADispositionTotal, payrollAttachmentsOf, rapprocherPaie,
} from "./payroll-attachments";

const att = (o: Partial<PayrollAttachment>): PayrollAttachment =>
  ({
    id: "a", firm_id: "f1", year: 2026, month: 10, kind: "mise_a_disposition",
    filename: "x.pdf", mime: "application/pdf", size: 1, sha256: "s",
    uploaded_at: "2026-10-05T00:00:00.000Z", ...o,
  }) as PayrollAttachment;

describe("pièces de paie + rapprochement réel", () => {
  it("filtre par entité et période (mois 0 = année)", () => {
    const list = [
      att({ id: "a1", month: 10, kind: "emargement_signee" }),
      att({ id: "a2", month: 9, kind: "emargement_signee" }),
      att({ id: "a3", firm_id: "f2", month: 10, kind: "emargement_signee" }),
    ];
    const ids10 = payrollAttachmentsOf(list, "f1", 2026, 10).map((a) => a.id);
    expect(ids10).toEqual(["a1"]);
    const idsAn = payrollAttachmentsOf(list, "f1", 2026, 0).map((a) => a.id).sort();
    expect(idsAn).toEqual(["a1", "a2"]);
  });

  it("total des mises à disposition constatées", () => {
    const list = [
      att({ id: "m1", kind: "mise_a_disposition", montant: 22000 }),
      att({ id: "m2", kind: "mise_a_disposition", montant: 500 }),
      att({ id: "e1", kind: "emargement_signee" }), // sans montant : ignorée du total
    ];
    expect(misesADispositionTotal(list, "f1", 2026, 10)).toBe(22500);
  });

  it("rapprochement : reliquat = mis à disposition − versé", () => {
    expect(rapprocherPaie(21842, 22500)).toEqual({
      verse: 21842, misADisposition: 22500, ecart: 658, equilibre: false, aMatiere: true,
    });
    expect(rapprocherPaie(21842, 21842).equilibre).toBe(true);
    expect(rapprocherPaie(0, 0).aMatiere).toBe(false);
  });
});
