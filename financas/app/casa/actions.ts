"use server";

import { redirect } from "next/navigation";
import { friendlyError, withParam } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export async function createHousehold(formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_household", {
    p_name: String(formData.get("name") ?? "").trim(),
    p_display_name: String(formData.get("display_name") ?? "").trim(),
  });
  if (error) redirect(withParam("/casa", "erro", friendlyError(error.message)));
  redirect("/painel");
}

export async function joinHousehold(formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("join_household", {
    p_invite_code: String(formData.get("invite_code") ?? ""),
    p_display_name: String(formData.get("display_name") ?? "").trim(),
  });
  if (error) redirect(withParam("/casa", "erro", friendlyError(error.message)));
  redirect("/painel");
}
