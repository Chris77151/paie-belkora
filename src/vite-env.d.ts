/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase (persistance cloud) — optionnel, sinon saisi dans Paramètres. */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé anon (public) Supabase — optionnel, sinon saisie dans Paramètres. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
