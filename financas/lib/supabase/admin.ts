import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseSecretKey, supabaseUrl } from "./env";

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente com a chave secreta (ignora o RLS). Só no servidor. */
export function createAdminClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  return url && key ? createClient(url, key, options) : null;
}

/** Cliente público sem cookies (para entrar com uma conta interna dentro do servidor). */
export function createPlainClient(): SupabaseClient {
  return createClient(supabaseUrl()!, supabasePublicKey()!, options);
}
