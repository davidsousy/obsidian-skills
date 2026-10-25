"use server";

import { redirect } from "next/navigation";
import { friendlyError, withParam } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) redirect(withParam("/entrar", "erro", friendlyError(error.message)));
  redirect("/painel");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(credentials(formData));
  if (error) redirect(withParam("/entrar", "erro", friendlyError(error.message)));
  if (!data.session) {
    redirect(withParam("/entrar", "ok", "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre."));
  }
  redirect("/casa");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
