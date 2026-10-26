// Acesso sem tela de login: o app entra sozinho com uma de duas contas internas da casa
// (David ou Paola). As contas existem no Supabase Auth só para o RLS e o "quem lançou"
// continuarem funcionando; os e-mails usam o domínio reservado .invalid (nunca recebem nada)
// e as senhas são derivadas da chave secreta do Supabase, que só existe no servidor.

import { supabaseSecretKey } from "@/lib/supabase/env";

export const PEOPLE = {
  david: { name: "David", email: "david@financas-da-casa.invalid" },
  paola: { name: "Paola", email: "paola@financas-da-casa.invalid" },
} as const;

export type Person = keyof typeof PEOPLE;

export const PERSON_COOKIE = "pessoa";

export function parsePerson(value: string | undefined | null): Person {
  return value === "paola" ? "paola" : "david";
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith("@financas-da-casa.invalid"));
}

export function personByEmail(email: string | null | undefined): Person | null {
  if (email === PEOPLE.david.email) return "david";
  if (email === PEOPLE.paola.email) return "paola";
  return null;
}

function base64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Senha da conta interna: HMAC-SHA256(chave secreta do Supabase, pessoa). */
export async function personPassword(person: Person, secret = supabaseSecretKey()): Promise<string> {
  if (!secret) throw new Error("Falta a chave secreta do Supabase (SUPABASE_SERVICE_ROLE_KEY) na Vercel.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`financas-da-casa:${person}`));
  return base64url(signature);
}

export async function personCredentials(person: Person, secret?: string) {
  return { email: PEOPLE[person].email, password: await personPassword(person, secret) };
}

/** Caminho interno seguro para voltar depois do primeiro acesso. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/iniciar")) return "/painel";
  return value;
}
