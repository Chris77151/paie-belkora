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

/** Lit la configuration : localStorage prioritaire, sinon variables d'environnement Vite. */
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as SupabaseConfig;
      if (cfg.url && cfg.anonKey) return { workspace: DEFAULT_WORKSPACE, ...cfg };
    }
  } catch {
    /* ignore */
  }
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, workspace: DEFAULT_WORKSPACE };
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

/** Teste la connexion + l'existence de la table (diagnostic pour l'UI Paramètres). */
export async function testConnection(
  cfg?: SupabaseConfig,
): Promise<{ ok: boolean; error?: string }> {
  let client: SupabaseClient | null;
  try {
    client = cfg
      ? createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } })
      : getClient();
  } catch {
    return { ok: false, error: "URL invalide" };
  }
  if (!client) return { ok: false, error: "Configuration absente" };
  try {
    const { error } = await client
      .from(TABLE)
      .select("id")
      .eq("id", cfg?.workspace || DEFAULT_WORKSPACE)
      .maybeSingle();
    if (error) {
      // 42P01 = table inexistante -> guider l'utilisateur vers le script SQL.
      if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
        return { ok: false, error: "Connecté, mais la table « app_state » est absente : exécutez le script SQL fourni." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "échec de connexion" };
  }
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
