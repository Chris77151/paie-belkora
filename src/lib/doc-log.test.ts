import { describe, it, expect } from "vitest";
import { capDocEvents, monthKey, computeDocKpis, MAX_DOC_EVENTS } from "./doc-log";
import type { DocGenEvent } from "@/data/types";

const ev = (over: Partial<DocGenEvent> = {}): DocGenEvent => ({
  id: over.id ?? "d",
  at: over.at ?? "2026-07-10T09:00:00.000Z",
  firm_id: over.firm_id ?? "f1",
  doc_type: over.doc_type ?? "bulletin",
  format: over.format ?? "pdf",
  ...over,
});

describe("doc-log — plafonnement", () => {
  const mk = (i: number) => ev({ id: `e${i}`, at: `2026-07-10T00:00:${String(i % 60).padStart(2, "0")}.000Z` });

  it("en dessous de la limite : inchangé", () => {
    const list = [mk(1), mk(2)];
    expect(capDocEvents(list)).toEqual(list);
  });
  it("au-dessus : ne garde que les plus récents (queue)", () => {
    const list = Array.from({ length: MAX_DOC_EVENTS + 3 }, (_, i) => mk(i));
    const capped = capDocEvents(list);
    expect(capped).toHaveLength(MAX_DOC_EVENTS);
    expect(capped[0].id).toBe("e3");
  });
  it("limite personnalisée", () => {
    expect(capDocEvents([mk(1), mk(2), mk(3), mk(4)], 2).map((e) => e.id)).toEqual(["e3", "e4"]);
  });
});

describe("doc-log — monthKey", () => {
  it("extrait AAAA-MM d'un ISO", () => {
    expect(monthKey("2026-07-10T09:00:00.000Z")).toBe("2026-07");
  });
  it("chaîne vide si non ISO", () => {
    expect(monthKey("n'importe quoi")).toBe("");
  });
});

describe("doc-log — computeDocKpis", () => {
  const now = "2026-07-26T12:00:00.000Z";
  const events: DocGenEvent[] = [
    ev({ id: "1", at: "2026-07-02T08:00:00.000Z", doc_type: "bulletin", format: "pdf", employee_id: "e1", subject: "A B" }),
    ev({ id: "2", at: "2026-07-15T08:00:00.000Z", doc_type: "bulletin", format: "html", employee_id: "e1", subject: "A B" }),
    ev({ id: "3", at: "2026-07-20T08:00:00.000Z", doc_type: "attestation", format: "apercu", employee_id: "e2", subject: "C D" }),
    ev({ id: "4", at: "2026-06-10T08:00:00.000Z", doc_type: "declaration_cnss", format: "bds" }), // mois précédent, non nominatif
  ];

  it("totaux, ce mois-ci et mois précédent", () => {
    const k = computeDocKpis(events, now);
    expect(k.total).toBe(4);
    expect(k.thisMonth).toBe(3); // juillet
    expect(k.prevMonth).toBe(1); // juin
  });

  it("salariés distincts = employés nominatifs uniques (la déclaration ne compte pas)", () => {
    expect(computeDocKpis(events, now).distinctEmployees).toBe(2);
  });

  it("répartition par type et par format, ordre décroissant", () => {
    const k = computeDocKpis(events, now);
    expect(k.byType[0]).toMatchObject({ key: "bulletin", count: 2 });
    expect(k.byFormat.find((f) => f.key === "pdf")?.count).toBe(1);
    expect(k.byFormat.reduce((a, f) => a + f.count, 0)).toBe(4);
  });

  it("série mensuelle chronologique croissante", () => {
    const k = computeDocKpis(events, now);
    expect(k.monthly.map((m) => m.key)).toEqual(["2026-06", "2026-07"]);
    expect(k.monthly.at(-1)).toMatchObject({ year: 2026, month: 7, count: 3 });
  });

  it("top salariés : e1 (2 docs) devant e2 (1 doc)", () => {
    const k = computeDocKpis(events, now);
    expect(k.topEmployees.map((e) => e.key)).toEqual(["e1", "e2"]);
    expect(k.topEmployees[0]).toMatchObject({ label: "A B", count: 2 });
  });

  it("dernier document = horodatage max", () => {
    expect(computeDocKpis(events, now).lastAt).toBe("2026-07-20T08:00:00.000Z");
  });

  it("bascule d'année pour le mois précédent (janvier → décembre)", () => {
    const jan = "2026-01-15T00:00:00.000Z";
    const evts = [ev({ id: "x", at: "2025-12-20T00:00:00.000Z" })];
    expect(computeDocKpis(evts, jan).prevMonth).toBe(1);
  });

  it("liste vide : KPI neutres", () => {
    const k = computeDocKpis([], now);
    expect(k).toMatchObject({ total: 0, thisMonth: 0, prevMonth: 0, distinctEmployees: 0 });
    expect(k.lastAt).toBeUndefined();
    expect(k.monthly).toEqual([]);
  });
});
