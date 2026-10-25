"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { loadDebts } from "@/lib/debts-data";
import { isPayable, priorityOrder } from "@/lib/finance/plan";
import { requireHousehold } from "@/lib/session";

function back(kind: "erro" | "ok", message: string): never {
  redirect(`/plano?${kind}=${encodeURIComponent(message)}`);
}

export async function setTargetDate(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const date = String(formData.get("target_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back("erro", "Escolha uma data.");
  const { error } = await supabase.from("households").update({ target_date: date }).eq("id", household.id);
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", "Data-alvo salva.");
}

/** Move uma dívida na ordem de quitação (grava a ordem completa como manual). */
export async function moveDebt(id: string, direction: -1 | 1) {
  const { supabase } = await requireHousehold();
  const debts = (await loadDebts(supabase)).filter(isPayable);
  const order = priorityOrder(debts).map((d) => d.id);
  const i = order.indexOf(id);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= order.length) back("erro", "Não foi possível mover.");
  [order[i], order[j]] = [order[j], order[i]];
  const results = await Promise.all(
    order.map((debtId, index) => supabase.from("debts").update({ priority_override: index + 1 }).eq("id", debtId)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) back("erro", friendlyError(failed.error.message));
  revalidatePath("/", "layout");
  redirect("/plano#ordem");
}

export async function resetOrder() {
  const { supabase, household } = await requireHousehold();
  const { error } = await supabase.from("debts").update({ priority_override: null }).eq("household_id", household.id);
  if (error) back("erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back("ok", "Ordem automática (avalanche) restaurada.");
}
