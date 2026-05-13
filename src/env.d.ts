/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly LABOR_MARKET_GREENHOUSE_BOARDS?: string;
  readonly LABOR_MARKET_LEVER_COMPANIES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
