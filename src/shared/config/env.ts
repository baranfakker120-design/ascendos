/**
 * Zentrale Umgebungs-Konfiguration.
 * Produktionsreife-Regel: Fehlende Env-Vars dürfen NIE einen weißen
 * Bildschirm erzeugen (Modul-Throw), sondern einen lesbaren Hinweis —
 * main.tsx prüft `envReady` vor dem App-Start.
 *
 * VITE_SUPABASE_* werden zur Build-Zeit von Vite eingefügt (Cloudflare
 * Pages Environment Variables). `npm run build` bricht ab, wenn sie fehlen
 * (scripts/assert-vite-supabase-env.mjs).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const envReady = Boolean(url && anonKey);

export const env = {
  supabaseUrl: url ?? 'http://env-missing.invalid',
  supabaseAnonKey: anonKey ?? 'env-missing',
};
