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
import type { AppRole, AppUser } from "@/data/types";

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

/** Le rôle a-t-il le droit de MODIFIER des données ? « lecture_seule » = consultation seule. */
export function canWrite(role: AppRole | undefined | null): boolean {
  return !!role && role !== "lecture_seule";
}

/** Hook réactif : l'utilisateur connecté peut-il écrire (créer/modifier/supprimer) ? */
export function useCanWrite(): boolean {
  return canWrite(useSession()?.role);
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

/* ------------------------------------------------------------------ contrôle d'accès par rôle ------------------------------------------------------------------ */

/** Administrateurs (accès total, y compris Paramètres et Sécurité). */
export const ADMIN_ROLES: AppRole[] = ["super_admin", "firm_admin"];

/**
 * Politique d'accès aux routes — SOURCE UNIQUE partagée par la navigation (Layout) et le
 * garde de routes (App). Une route ABSENTE de cette table est ouverte à tout compte connecté
 * (volets de consultation / opérationnels). Une route PRÉSENTE n'est accessible qu'aux rôles listés.
 *
 * Règle : « deny-by-default » sur les routes sensibles. Le rôle fait foi via le compte
 * authentifié (session.role), jamais via une valeur modifiable librement dans l'UI.
 */
export const ROUTE_ACCESS: Record<string, AppRole[]> = {
  "/settings": ADMIN_ROLES, // paramétrage société (le volet persistance cloud y est réservé au super admin)
  "/securite": ["super_admin"], // ZONE SENSIBLE : audit des données bancaires (RIB) — super admin uniquement
  "/stability": ["super_admin"], // Stabilisation & Calculs : audit technique — super admin uniquement
  "/assistant": ["super_admin", "firm_admin", "gestionnaire_paie"], // l'IA peut modifier/supprimer des données
};

/** Normalise un chemin en son premier segment (« /employees?q=x » → « /employees »). */
function routeKey(path: string): string {
  const seg = path.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").filter(Boolean)[0];
  return seg ? `/${seg}` : "/";
}

/**
 * Le rôle `role` a-t-il accès à la route `path` ?
 * - Route non restreinte → oui (tout compte connecté).
 * - Route restreinte → uniquement si le rôle figure dans la liste (sinon refus).
 * - Rôle absent → refus (défaut sûr).
 */
export function canAccess(role: AppRole | undefined | null, path: string): boolean {
  const allowed = ROUTE_ACCESS[routeKey(path)];
  if (!allowed) return true;
  return !!role && allowed.includes(role);
}
