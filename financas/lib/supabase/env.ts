// Variáveis do Supabase. Aceita os nomes novos (publishable/secret) e os criados pela integração
// Supabase da Vercel (anon/service_role).
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublicKey());
}
