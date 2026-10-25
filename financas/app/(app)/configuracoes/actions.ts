"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, withParam } from "@/lib/errors";
import { parseBRL, parsePercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

const PATH = "/configuracoes";

function fail(message: string): never {
  redirect(withParam(PATH, "erro", message));
}

function money(formData: FormData, key: string, label: string): number {
  const cents = parseBRL(String(formData.get(key) ?? ""));
  if (cents === null || cents < 0) fail(`Valor inválido em “${label}”. Use o formato 1.234,56.`);
  return cents;
}

export async function updateMyPreferences(formData: FormData) {
  const { supabase, user } = await requireHousehold();
  const days = Number(formData.get("alert_days_before"));
  if (!Number.isInteger(days) || days < 0 || days > 30) fail("Dias de antecedência deve ser entre 0 e 30.");
  const { error } = await supabase
    .from("household_members")
    .update({
      display_name: String(formData.get("display_name") ?? "").trim(),
      email_alerts: formData.get("email_alerts") === "on",
      alert_days_before: days,
    })
    .eq("user_id", user.id);
  if (error) fail(friendlyError(error.message));
  revalidatePath("/", "layout");
  redirect(withParam(PATH, "ok", "Preferências salvas."));
}

export async function updateHousehold(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const margin = parsePercent(String(formData.get("tight_margin_pct") ?? ""));
  if (margin === null) fail("Margem de “apertado” inválida.");
  const allocation = String(formData.get("car_cost_allocation"));
  if (allocation !== "por_hora" && allocation !== "por_dia") fail("Rateio do carro inválido.");

  const { error } = await supabase
    .from("households")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      reserve_target_cents: money(formData, "reserve_target", "Meta da reserva"),
      reserve_balance_cents: money(formData, "reserve_balance", "Reserva atual"),
      tight_margin_pct: Math.round(margin * 10000) / 100,
      car_cost_allocation: allocation,
      initial_variable_monthly_cents: money(formData, "initial_variable", "Gastos variáveis estimados"),
      initial_income_monthly_cents: money(formData, "initial_income", "Renda mensal estimada"),
    })
    .eq("id", household.id);
  if (error) fail(friendlyError(error.message));
  revalidatePath("/", "layout");
  redirect(withParam(PATH, "ok", "Configurações da casa salvas."));
}

export async function regenerateInvite() {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("regenerate_invite_code");
  if (error) fail(friendlyError(error.message));
  revalidatePath(PATH);
  redirect(withParam(PATH, "ok", "Novo código gerado. O antigo deixou de valer."));
}
