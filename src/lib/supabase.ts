/**
 * Persistance cloud Supabase — permanente et partagée entre appareils.
 *
 * Architecture offline-first : le localStorage reste le cache local et le fallback ; Supabase
 * est la source de vérité partagée quand il est configuré. Tout l'AppState est sérialisé dans
 * UNE ligne JSONB (table `app_state`, id = espace de travail), ce qui épouse le store existant
 * sans schéma relationnel lourd. Résolution des conflits : dernière écriture gagnante
 * (`updated_at`).
 *
 * RÈGLE : ce module ne DOIT JAMAIS bloquer ni casser l'application. Toute erreur réseau /
 * configuration absente est avalée et l'app retombe sur le localStorage.
 *
 * Configuration : saisie dans Paramètres (stockée en localStorage `gca-supabase`) OU variables
 * d'environnement Vite (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). La saisie manuelle prime.
 * La clé « anon » est publique par conception (protégée par les politiques RLS côté Supabase).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "@/data/types";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Identifiant de l'espace de travail partagé (une ligne app_state). */
  workspace?: string;
}

const CONFIG_KEY = "gca-supabase";
const DEFAULT_WORKSPACE = "belkora";
const TABLE = "app_state";

/**
 * AUCUN projet par défaut. L'ancien hôte intégré ne résout plus en DNS (NXDOMAIN
 * constaté le 16/10/2026 : projet supprimé côté Supabase) et affichait une erreur
 * de synchronisation sur tous les postes. Sans configuration explicite (saisie
 * Paramètres ou variables d'environnement Vercel), l'app reste 100 % locale —
 * sans erreur affichée. La clé « anon » reste publique par conception (RLS).
 */
const DEFAULT_CONFIG: SupabaseConfig | null = null;

/** Normalise une URL de projet : espaces et barres finales en moins (source d'échecs silencieux). */
export function normalizeSupabaseUrl(url: string): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

/**
 * Valide le format d'une URL de projet. Retourne le message d'erreur, ou null si OK.
 * Pure et testée — aucun réseau ici.
 */
export function validateSupabaseUrl(url: string): string | null {
  const u = (url ?? "").trim();
  if (!u) return "Renseignez l'URL du projet (https://xxxxx.supabase.co).";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(u)) {
    return "URL invalide : elle doit ressembler à https://xxxxx.supabase.co, sans chemin ajouté (/rest, /auth…) ni espace.";
  }
  return null;
}

/** Lit la config : localStorage > variables d'environnement Vite. Aucun défaut intégré. */
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as SupabaseConfig;
      if (cfg.url && cfg.anonKey) {
        return { workspace: DEFAULT_WORKSPACE, ...cfg, url: normalizeSupabaseUrl(cfg.url) };
      }
    }
  } catch {
    /* ignore */
  }
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) {
    return { url: normalizeSupabaseUrl(envUrl), anonKey: envKey, workspace: DEFAULT_WORKSPACE };
  }
  if (DEFAULT_CONFIG && DEFAULT_CONFIG.url && DEFAULT_CONFIG.anonKey) {
    return DEFAULT_CONFIG;
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/** Enregistre (ou efface avec `null`) la configuration Supabase saisie manuellement. */
export function setSupabaseConfig(cfg: SupabaseConfig | null) {
  try {
    if (cfg && cfg.url && cfg.anonKey) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ workspace: DEFAULT_WORKSPACE, ...cfg }));
    } else {
      localStorage.removeItem(CONFIG_KEY);
    }
  } catch {
    /* ignore */
  }
  _client = null;
  _clientKey = "";
}

let _client: SupabaseClient | null = null;
let _clientKey = "";

/** Client Supabase mémoïsé (recréé si la config change). `null` si non configuré. */
export function getClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    _client = null;
    return null;
  }
  const key = `${cfg.url}::${cfg.anonKey}`;
  if (_client && _clientKey === key) return _client;
  try {
    _client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },
    });
    _clientKey = key;
    return _client;
  } catch {
    _client = null;
    return null;
  }
}

function workspaceId(): string {
  return getSupabaseConfig()?.workspace || DEFAULT_WORKSPACE;
}

/** Charge l'état distant, ou `null` si non configuré / absent / erreur. */
export async function loadRemoteState(): Promise<{ data: AppState; updatedAt: string } | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("data, updated_at")
      .eq("id", workspaceId())
      .maybeSingle();
    if (error || !data?.data) return null;
    return { data: data.data as AppState, updatedAt: (data.updated_at as string) ?? "" };
  } catch {
    return null;
  }
}

/** Écrit (upsert) l'état complet dans Supabase. Ne lève jamais : renvoie un statut. */
export async function saveRemoteState(state: AppState): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "non-configuré" };
  try {
    const { error } = await client
      .from(TABLE)
      .upsert(
        { id: workspaceId(), data: state, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erreur inconnue" };
  }
}

/** Course contre la montre : un hôte injoignable ne doit pas figer l'interface. */
async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("__timeout__")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const DIAG_TIMEOUT_MS = 15000;

/**
 * Diagnostic étagé de la connexion (pour l'UI Paramètres). Chaque étape échoue
 * avec un message ACTIONNABLE — jamais un brut « Failed to fetch ».
 */
export async function diagnoseConnection(
  rawCfg?: SupabaseConfig,
): Promise<{ ok: boolean; error?: string }> {
  const url = normalizeSupabaseUrl(rawCfg?.url ?? "");
  const anonKey = (rawCfg?.anonKey ?? "").trim();
  if (!url || !anonKey) return { ok: false, error: "Renseignez l'URL du projet ET la clé anon." };

  // Étape 1 — format de l'URL (aucun réseau).
  const badUrl = validateSupabaseUrl(url);
  if (badUrl) return { ok: false, error: badUrl };

  // Étape 2 — l'hôte répond-il ? (DNS, projet en pause/supprimé, hors-ligne, pare-feu).
  // Le point de santé Auth ne demande aucune table : il sépare le réseau de la base.
  try {
    const res = await withTimeout(
      fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }),
      DIAG_TIMEOUT_MS,
    );
    if (res.status === 404) {
      return { ok: false, error: "URL inexacte (404 sur le projet) : reprenez l'URL exacte depuis Project Settings → API, sans y ajouter de chemin." };
    }
  } catch (e) {
    if (e instanceof Error && e.message === "__timeout__") {
      return { ok: false, error: "Délai dépassé (15 s) : connexion trop lente ou hôte injoignable. Réessayez, puis vérifiez le réseau." };
    }
    // TypeError: Failed to fetch = DNS/TCP/TLS : le cas du projet en pause ou supprimé.
    return {
      ok: false,
      error: "Projet injoignable : pas de réponse réseau du projet. Vérifiez (1) que l'URL est exacte, "
        + "(2) que le projet existe et n'est pas EN PAUSE (dashboard Supabase → Restore/Unpause — la pause auto suit l'inactivité des projets gratuits), "
        + "(3) votre connexion internet.",
    };
  }

  // Étape 3 — la table et les droits (clé, RLS, SQL).
  let client: SupabaseClient;
  try {
    client = createClient(url, anonKey, { auth: { persistSession: false } });
  } catch {
    return { ok: false, error: "URL invalide : impossible de construire le client." };
  }
  try {
    const { error } = await withTimeout(
      client.from(TABLE).select("id").eq("id", rawCfg?.workspace || DEFAULT_WORKSPACE).maybeSingle(),
      DIAG_TIMEOUT_MS,
    );
    if (error) {
      // 42P01 = table inexistante -> guider l'utilisateur vers le script SQL.
      if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
        return { ok: false, error: "Projet joignable, mais la table « app_state » est absente : exécutez le script SQL fourni (SQL Editor), puis retestez." };
      }
      if (error.code === "42501" || /row-level security|policy/i.test(error.message)) {
        return { ok: false, error: "Politiques RLS bloquantes : exécutez le bloc « policies » du script SQL fourni (lecture/écriture anon autorisées)." };
      }
      if (/invalid (api key|apikey)|unauthorized|401/i.test(error.message)) {
        return { ok: false, error: "Clé rejetée par le projet (accès refusé) : reprenez la clé « anon public » depuis Project Settings → API." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "__timeout__") {
      return { ok: false, error: "Délai dépassé (15 s) sur la base : réessayez, puis vérifiez que le projet n'est pas en pause." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "échec de connexion" };
  }
}

/** Teste la connexion + l'existence de la table (diagnostic pour l'UI Paramètres). */
export function testConnection(cfg?: SupabaseConfig): Promise<{ ok: boolean; error?: string }> {
  if (cfg) return diagnoseConnection(cfg);
  const current = getSupabaseConfig();
  if (!current) return Promise.resolve({ ok: false, error: "Configuration absente" });
  return diagnoseConnection(current);
}

/** Script SQL à exécuter une fois dans Supabase (éditeur SQL) pour créer la table + RLS. */
export const SUPABASE_SQL = `-- Table unique : tout l'état de l'application dans une ligne JSONB partagée.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS activée. Outil interne mono-espace : on autorise la clé anon à lire/écrire la ligne.
alter table public.app_state enable row level security;

drop policy if exists "app_state_read" on public.app_state;
create policy "app_state_read" on public.app_state
  for select using (true);

drop policy if exists "app_state_write" on public.app_state;
create policy "app_state_write" on public.app_state
  for all using (true) with check (true);`;
