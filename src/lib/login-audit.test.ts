import { describe, it, expect } from "vitest";
import { successEvent, failureEvent, logoutEvent, capLoginEvents, MAX_LOGIN_EVENTS } from "./login-audit";
import type { AppUser, LoginEvent } from "@/data/types";

const user: AppUser = {
  id: "u1",
  username: "christian.agnamon@pepinierebelkora.com",
  full_name: "Christian AGNAMON",
  role: "super_admin",
  firm_id: null,
  password_hash: "deadbeef",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("journal des connexions — construction des événements", () => {
  it("succès : capture l'identité du compte, jamais de mot de passe", () => {
    const e = successEvent(user, "log1", "2026-07-26T08:30:00Z");
    expect(e).toMatchObject({
      id: "log1",
      at: "2026-07-26T08:30:00Z",
      outcome: "success",
      username: user.username,
      user_id: "u1",
      full_name: "Christian AGNAMON",
      role: "super_admin",
      firm_id: null,
    });
    expect(e.reason).toBeUndefined();
    // Aucune fuite de secret : la sérialisation ne contient aucun champ mot de passe.
    expect(JSON.stringify(e)).not.toContain("password");
    expect(JSON.stringify(e)).not.toContain("deadbeef");
  });

  it("déconnexion : capture le compte qui se déconnecte, sans mot de passe ni cause", () => {
    const e = logoutEvent(user, "log4", "2026-07-26T18:00:00Z");
    expect(e).toMatchObject({
      id: "log4",
      outcome: "logout",
      username: user.username,
      user_id: "u1",
      role: "super_admin",
    });
    expect(e.reason).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("deadbeef");
  });

  it("échec identifiant inconnu : conserve l'identifiant saisi, sans métadonnées de compte", () => {
    const e = failureEvent("pirate@x.ma", "unknown_user", "log2", "2026-07-26T09:00:00Z");
    expect(e.outcome).toBe("failed");
    expect(e.username).toBe("pirate@x.ma");
    expect(e.reason).toBe("unknown_user");
    expect(e.user_id).toBeUndefined();
    expect(e.role).toBeUndefined();
  });

  it("échec sur compte connu (mauvais mot de passe) : enrichit avec le compte, sans secret", () => {
    const e = failureEvent(user.username, "bad_password", "log3", "2026-07-26T09:05:00Z", user);
    expect(e.outcome).toBe("failed");
    expect(e.reason).toBe("bad_password");
    expect(e.user_id).toBe("u1");
    expect(e.role).toBe("super_admin");
    expect(JSON.stringify(e)).not.toContain("deadbeef");
  });
});

describe("journal des connexions — plafonnement", () => {
  const mk = (i: number): LoginEvent => ({
    id: `e${i}`, at: `2026-07-26T00:00:${String(i % 60).padStart(2, "0")}Z`, outcome: "success", username: "x",
  });

  it("en dessous de la limite : liste inchangée (même référence de contenu)", () => {
    const list = [mk(1), mk(2), mk(3)];
    expect(capLoginEvents(list)).toEqual(list);
  });

  it("au-dessus de la limite : ne garde que les plus RÉCENTS (queue)", () => {
    const list = Array.from({ length: MAX_LOGIN_EVENTS + 5 }, (_, i) => mk(i));
    const capped = capLoginEvents(list);
    expect(capped).toHaveLength(MAX_LOGIN_EVENTS);
    expect(capped[0].id).toBe("e5"); // les 5 plus anciens (e0..e4) sont oubliés
    expect(capped[capped.length - 1].id).toBe(`e${MAX_LOGIN_EVENTS + 4}`);
  });

  it("limite personnalisée respectée", () => {
    const list = Array.from({ length: 10 }, (_, i) => mk(i));
    expect(capLoginEvents(list, 3).map((e) => e.id)).toEqual(["e7", "e8", "e9"]);
  });
});
