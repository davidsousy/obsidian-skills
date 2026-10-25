"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { CATEGORIES, type CostCategory } from "@/lib/finance/costs";
import { monthStart } from "@/lib/finance/dates";
import { parseBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

const FIXOS = "/custos";
const VARIAVEIS = "/custos?aba=variaveis";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function back(path: string, kind: "erro" | "ok", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

function parseCategory(fd: FormData): CostCategory | null {
  const c = text(fd, "category") as CostCategory;
  return CATEGORIES.includes(c) ? c : null;
}

/** "casa" → null; senão o user_id do membro. */
function parsePerson(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  return v && v !== "casa" ? v : null;
}

function fixedFields(fd: FormData, errorPath: string) {
  const name = text(fd, "name");
  if (!name) back(errorPath, "erro", "Informe o nome do custo.");
  const amount = parseBRL(text(fd, "amount"));
  if (amount === null || amount < 0) back(errorPath, "erro", "Valor inválido. Use o formato 1.234,56.");
  const category = parseCategory(fd);
  if (!category) back(errorPath, "erro", "Escolha a categoria.");
  const dueRaw = text(fd, "due_day");
  const due = dueRaw ? Number(dueRaw) : null;
  if (due !== null && (!Number.isInteger(due) || due < 1 || due > 31)) back(errorPath, "erro", "Dia de vencimento deve ser entre 1 e 31.");
  const starts = text(fd, "starts_on");
  return {
    name,
    amount_cents: amount,
    category,
    due_day: due,
    owner_user_id: parsePerson(fd, "owner"),
    is_approximate: fd.get("is_approximate") === "on",
    active: fd.get("inactive") !== "on",
    starts_on: starts ? monthStart(starts.length === 7 ? `${starts}-01` : starts) : null,
    notes: text(fd, "notes") || null,
  };
}

export async function createFixedCost(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const fields = fixedFields(formData, FIXOS);
  const { error } = await supabase.from("fixed_costs").insert({ ...fields, household_id: household.id });
  if (error) back(FIXOS, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(FIXOS, "ok", `“${fields.name}” adicionado.`);
}

export async function updateFixedCost(id: string, formData: FormData) {
  const { supabase } = await requireHousehold();
  const fields = fixedFields(formData, `/custos/fixos/${id}`);
  const { error } = await supabase.from("fixed_costs").update(fields).eq("id", id);
  if (error) back(`/custos/fixos/${id}`, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(FIXOS, "ok", `“${fields.name}” atualizado.`);
}

export async function deleteFixedCost(id: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from("fixed_costs").delete().eq("id", id);
  if (error) back(`/custos/fixos/${id}`, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(FIXOS, "ok", "Custo excluído.");
}

export async function loadSeedFixedCosts() {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("load_seed_fixed_costs");
  if (error) back(FIXOS, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(FIXOS, "ok", "Custos fixos de outubro/2026 carregados.");
}

export async function createExpense(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const month = text(formData, "mes");
  const path = month ? `${VARIAVEIS}&mes=${month}` : VARIAVEIS;
  const amount = parseBRL(text(formData, "amount"));
  if (amount === null || amount <= 0) back(path, "erro", "Informe um valor válido, ex.: 87,50.");
  const spentOn = text(formData, "spent_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) back(path, "erro", "Informe a data.");
  const category = parseCategory(formData);
  if (!category) back(path, "erro", "Escolha a categoria.");
  const { error } = await supabase.from("variable_expenses").insert({
    household_id: household.id,
    spent_on: spentOn,
    amount_cents: amount,
    category,
    description: text(formData, "description") || null,
    spent_by: parsePerson(formData, "spent_by"),
  });
  if (error) back(path, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(`${VARIAVEIS}&mes=${spentOn.slice(0, 7)}`, "ok", "Gasto lançado.");
}

export async function deleteExpense(id: string, month: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.from("variable_expenses").delete().eq("id", id);
  const path = `${VARIAVEIS}&mes=${month}`;
  if (error) back(path, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(path, "ok", "Gasto excluído.");
}
