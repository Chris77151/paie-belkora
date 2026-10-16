import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl, validateSupabaseUrl } from "./supabase";

describe("diagnostic Supabase", () => {
  it("normalise l'URL (espaces et barres finales, sources d'échecs silencieux)", () => {
    expect(normalizeSupabaseUrl("  https://xxxxx.supabase.co/  ")).toBe("https://xxxxx.supabase.co");
    expect(normalizeSupabaseUrl("https://xxxxx.supabase.co///")).toBe("https://xxxxx.supabase.co");
    expect(normalizeSupabaseUrl("")).toBe("");
  });

  it("valide le format sans réseau", () => {
    expect(validateSupabaseUrl("")).toContain("Renseignez");
    expect(validateSupabaseUrl("https://xxxxx.supabase.co/rest/v1")).toContain("sans chemin");
    expect(validateSupabaseUrl("http://xxxxx.supabase.co")).toContain("https://xxxxx.supabase.co");
    expect(validateSupabaseUrl("xxxxx.supabase.co")).toContain("https://xxxxx.supabase.co");
    expect(validateSupabaseUrl("https://xxxxx.supabase.co")).toBeNull();
    expect(validateSupabaseUrl("https://xxxxx.supabase.co/")).toBeNull();
  });
});
