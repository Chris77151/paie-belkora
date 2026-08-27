import { describe, expect, it } from "vitest";
import {
  DOC_REQUEST_STATUS_LABEL, DOC_REQUEST_TYPE_LABEL,
  documentRequestDeadline, isRequestClosed, isRequestOverdue,
} from "./document-requests";

describe("documentRequestDeadline — 48 h ouvrables", () => {
  it("ajoute 2 jours ouvrés en pleine semaine (mercredi -> vendredi)", () => {
    // 2026-08-26 est un mercredi
    expect(documentRequestDeadline("2026-08-26T09:00:00.000Z")).toBe("2026-08-28");
  });

  it("saute le week-end (jeudi -> lundi)", () => {
    // 2026-08-27 est un jeudi : +2 ouvrés = vendredi(1) puis lundi(2)
    expect(documentRequestDeadline("2026-08-27T09:00:00.000Z")).toBe("2026-08-31");
  });

  it("saute le week-end (vendredi -> mardi)", () => {
    // 2026-08-28 est un vendredi : lundi(1) puis mardi(2)
    expect(documentRequestDeadline("2026-08-28T09:00:00.000Z")).toBe("2026-09-01");
  });

  it("gère une demande le week-end (samedi -> mardi)", () => {
    // 2026-08-29 est un samedi : lundi(1) puis mardi(2)
    expect(documentRequestDeadline("2026-08-29T12:00:00.000Z")).toBe("2026-09-01");
  });

  it("retourne la date brute si l'entrée est invalide", () => {
    expect(documentRequestDeadline("pas-une-date")).toBe("pas-une-da");
  });
});

describe("isRequestOverdue", () => {
  it("en retard si aujourd'hui dépasse l'échéance et non clos", () => {
    expect(isRequestOverdue("2026-08-28", "2026-08-31", "en_attente")).toBe(true);
    expect(isRequestOverdue("2026-08-28", "2026-08-31", "en_cours")).toBe(true);
  });

  it("jamais en retard si traité ou refusé", () => {
    expect(isRequestOverdue("2026-08-01", "2026-08-31", "traite")).toBe(false);
    expect(isRequestOverdue("2026-08-01", "2026-08-31", "refuse")).toBe(false);
  });

  it("pas en retard avant l'échéance", () => {
    expect(isRequestOverdue("2026-08-31", "2026-08-28", "en_attente")).toBe(false);
  });
});

describe("labels & clôture", () => {
  it("isRequestClosed", () => {
    expect(isRequestClosed("traite")).toBe(true);
    expect(isRequestClosed("refuse")).toBe(true);
    expect(isRequestClosed("en_attente")).toBe(false);
    expect(isRequestClosed("en_cours")).toBe(false);
  });

  it("chaque type et statut a un libellé non vide", () => {
    for (const label of Object.values(DOC_REQUEST_TYPE_LABEL)) expect(label.length).toBeGreaterThan(0);
    for (const label of Object.values(DOC_REQUEST_STATUS_LABEL)) expect(label.length).toBeGreaterThan(0);
  });
});
