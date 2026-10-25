"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { parseBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

const PATH = "/renda";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function back(kind: "erro" | "ok", message: string): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(message)}`);
}

function date(fd: FormData, key: string): string {
  const v = text(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) back("erro", "Informe a data.");
  return v;
}

export async function saveUberDay(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const workedOn = date(formData, "worked_on");
  const gross = parseBRL(text(formData, "gross"));
  if (gross === null || gross < 0) back("erro", "Valor bruto inválido. Use o formato 1.234,56.");
  const hours = Number(text(formData, "hours").replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) back("erro", "Horas rodadas devem ser entre 0 e 24 (ex.: 8,5).");
  const { data: existing } = await supabase.from("uber_days").select("id").eq("worked_on", workedOn).maybeSingle();
  const { error } = await supabase.from("uber_days").upsert(
    {
      household_id: household.id,
      worked_on: workedOn,
      gross_cents: gross,
      hours: Math.round(hours * 100) / 100,
      notes: text(formData, "notes") || null,
    },
    { onConflict: "household_id,worked_on" },
  );
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", existing ? "Dia do Uber atualizado (substituiu o lançamento anterior)." : "Dia do Uber lançado.");
}

export async function deleteUberDay(id: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from("uber_days").delete().eq("id", id);
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", "Dia do Uber excluído.");
}

export async function saveIncomeEntry(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const receivedOn = date(formData, "received_on");
  const amount = parseBRL(text(formData, "amount"));
  if (amount === null || amount <= 0) back("erro", "Valor inválido. Use o formato 1.234,56.");
  const source = text(formData, "source") === "outros" ? "outros" : "salario";
  const earner = text(formData, "earner");
  const { error } = await supabase.from("income_entries").insert({
    household_id: household.id,
    received_on: receivedOn,
    amount_cents: amount,
    source,
    description: text(formData, "description") || null,
    earner_user_id: earner && earner !== "casa" ? earner : null,
  });
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", "Entrada lançada.");
}

export async function deleteIncomeEntry(id: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from("income_entries").delete().eq("id", id);
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", "Entrada excluída.");
}
