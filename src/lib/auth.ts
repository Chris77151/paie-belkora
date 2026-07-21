/**
 * Authentification locale de l'application.
 *
 * - Les COMPTES vivent dans le store persistant (localStorage, `AppState.users`).
 * - La SESSION active (id de l'utilisateur connecté) vit dans `sessionStorage` :
 *   fermer l'onglet/le navigateur déconnecte, un simple rafraîchissement conserve la session.
 * - Aucun mot de passe en clair : on ne compare que des empreintes SHA-256 (Web Crypto).
 *
 * NB : app 100 % locale, sans serveur. Ce n'est pas une authentification serveur (pas de
 * jeton signé, pas de politique de mot de passe côté API). Adapté à un usage local/personnel ;
 * pour un déploiement en ligne, brancher une vraie auth (ex. Supabase Auth + RLS).
 */
import { useSyncExternalStore } from "react";
import { actions, getState } from "@/data/store";
import type { AppUser } from "@/data/types";

const SESSION_KEY = "gca-paie-session-user";

let sessionUserId: string | null = sessionStorage.getItem(SESSION_KEY);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Empreinte SHA-256 (hex) d'un mot de passe — via l'API Web Crypto du navigateur. */
export async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Utilisateur actuellement connecté (ou null). Lit le store en direct. */
export function currentUser(): AppUser | null {
  if (!sessionUserId) return null;
  return getState().users?.find((u) => u.id === sessionUserId && u.is_active) ?? null;
}

/** Hook réactif : renvoie l'utilisateur connecté (re-render sur login/logout). */
export function useSession(): AppUser | null {
  return useSyncExternalStore(subscribe, currentUser, currentUser);
}

/** Tente une connexion. Identifiant comparé sans casse ni espaces superflus. */
export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const uname = username.trim().toLowerCase();
  if (!uname || !password) return { ok: false, error: "Renseignez l'identifiant et le mot de passe." };

  const user = getState().users?.find((u) => u.username.trim().toLowerCase() === uname);
  if (!user) return { ok: false, error: "Identifiant inconnu." };
  if (!user.is_active) return { ok: false, error: "Ce compte est désactivé. Contactez un administrateur." };

  const hash = await hashPassword(password);
  if (hash !== user.password_hash) return { ok: false, error: "Mot de passe incorrect." };

  sessionUserId = user.id;
  sessionStorage.setItem(SESSION_KEY, user.id);
  actions.setCurrentRole(user.role); // garde la logique de rôles existante en phase
  emit();
  return { ok: true };
}

/** Déconnecte l'utilisateur courant. */
export function logout(): void {
  sessionUserId = null;
  sessionStorage.removeItem(SESSION_KEY);
  emit();
}

/** Libellés lisibles des rôles (partagés par l'écran de connexion et les Paramètres). */
export const ROLE_LABELS: Record<AppUser["role"], string> = {
  super_admin: "Super administrateur",
  firm_admin: "Administrateur société",
  gestionnaire_paie: "Gestionnaire de paie",
  lecture_seule: "Lecture seule",
};
