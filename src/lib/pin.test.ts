import { describe, it, expect } from "vitest";
import { isValidPin, hashPin, verifyPin } from "./pin";

describe("pin — code de validation à 4 chiffres", () => {
  it("isValidPin : exactement 4 chiffres", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("hashPin : ne renvoie jamais le code en clair, et est déterministe", async () => {
    const h = await hashPin("1234", "firm-1");
    expect(h).not.toContain("1234");
    expect(h).toHaveLength(64); // SHA-256 hex
    expect(await hashPin("1234", "firm-1")).toBe(h); // déterministe
  });

  it("hashPin : salé par société — même code, empreintes différentes", async () => {
    expect(await hashPin("1234", "firm-1")).not.toBe(await hashPin("1234", "firm-2"));
  });

  it("verifyPin : vrai seulement pour le bon code et le bon sel", async () => {
    const salt = "firm-1";
    const hash = await hashPin("4271", salt);
    expect(await verifyPin("4271", salt, hash)).toBe(true);
    expect(await verifyPin("0000", salt, hash)).toBe(false); // mauvais code
    expect(await verifyPin("4271", "firm-2", hash)).toBe(false); // mauvais sel
    expect(await verifyPin("427", salt, hash)).toBe(false); // format invalide
    expect(await verifyPin("4271", salt, undefined)).toBe(false); // aucune empreinte
  });
});
