/**
 * Journal des connexions — logique PURE (aucun effet de bord, aucune dépendance au DOM).
 *
 * Construit les événements d'audit d'accès et borne la taille du journal. L'horodatage et
 * l'identifiant sont INJECTÉS (paramètres) pour que ces fonctions restent déterministes et
 * testables — la capture réelle vit dans auth.ts, la persistance dans le store.
 *
 * Règle de sécurité : le mot de passe saisi n'apparaît JAMAIS dans un événement, même en
 * cas d'échec. On ne conserve que l'identifiant tenté (utile pour repérer des tentatives
 * répétées) et, si l'identifiant correspond à un compte connu, ses métadonnées de compte.
 */
import type { AppUser, LoginEvent, LoginFailReason } from "@/data/types";

/** Taille maximale du journal : au-delà, les entrées les plus anciennes sont oubliées. */
export const MAX_LOGIN_EVENTS = 500;

/** Événement construit à partir du compte authentifié (connexion réussie / déconnexion). */
function accountEvent(user: AppUser, outcome: "success" | "logout", id: string, at: string): LoginEvent {
  return {
    id,
    at,
    outcome,
    username: user.username,
    user_id: user.id,
    full_name: user.full_name,
    role: user.role,
    firm_id: user.firm_id ?? null,
  };
}

/** Événement d'une connexion RÉUSSIE, à partir du compte authentifié. */
export function successEvent(user: AppUser, id: string, at: string): LoginEvent {
  return accountEvent(user, "success", id, at);
}

/** Événement d'une DÉCONNEXION, à partir du compte qui se déconnecte. */
export function logoutEvent(user: AppUser, id: string, at: string): LoginEvent {
  return accountEvent(user, "logout", id, at);
}

/**
 * Événement d'un ÉCHEC de connexion. `username` est l'identifiant SAISI (jamais le mot de
 * passe). `user` n'est fourni que lorsque l'identifiant correspond à un compte existant
 * (ex. compte désactivé ou mauvais mot de passe) : on enrichit alors l'événement.
 */
export function failureEvent(
  username: string,
  reason: LoginFailReason,
  id: string,
  at: string,
  user?: AppUser | null,
): LoginEvent {
  return {
    id,
    at,
    outcome: "failed",
    username,
    reason,
    ...(user
      ? { user_id: user.id, full_name: user.full_name, role: user.role, firm_id: user.firm_id ?? null }
      : {}),
  };
}

/**
 * Borne le journal en conservant les entrées les plus RÉCENTES. On suppose l'ordre d'entrée
 * chronologique (ajout en fin) : on garde donc la queue.
 */
export function capLoginEvents(events: LoginEvent[], max = MAX_LOGIN_EVENTS): LoginEvent[] {
  return events.length <= max ? events : events.slice(events.length - max);
}
