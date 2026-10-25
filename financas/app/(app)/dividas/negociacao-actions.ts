"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { parseBRL, parsePercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

function back(debtId: string, kind: "erro" | "ok", message: string): never {
  redirect(`/dividas/${debtId}?${kind}=${encodeURIComponent(message)}#negociacoes`);
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function openNegotiation(debtId: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("open_negotiation", { p_debt_id: debtId });
  if (error) back(debtId, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(debtId, "ok", "Negociação aberta. A dívida está marcada como em negociação.");
}

export async function addNegotiationEntry(debtId: string, negotiationId: string, formData: FormData) {
  const { supabase, household } = await requireHousehold();
  const kind = text(formData, "kind");
  if (!["contato", "proposta_feita", "proposta_recebida"].includes(kind)) back(debtId, "erro", "Escolha o tipo do registro.");
  const date = text(formData, "occurred_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(debtId, "erro", "Informe a data.");
  const rawAmount = text(formData, "amount");
  const amount = rawAmount ? parseBRL(rawAmount) : null;
  if (rawAmount && (amount === null || amount < 0)) back(debtId, "erro", "Valor inválido. Use o formato 1.234,56.");
  if (kind !== "contato" && amount === null) back(debtId, "erro", "Informe o valor da proposta.");
  const rawN = text(formData, "installments");
  const installments = rawN ? Number(rawN) : kind === "contato" ? null : 1;
  if (installments !== null && (!Number.isInteger(installments) || installments < 1)) back(debtId, "erro", "Parcelas inválidas.");
  const { error } = await supabase.from("negotiation_entries").insert({
    household_id: household.id,
    negotiation_id: negotiationId,
    occurred_on: date,
    kind,
    amount_cents: amount,
    installments,
    conditions: text(formData, "conditions") || null,
  });
  if (error) back(debtId, "erro", friendlyError(error.message));
  revalidatePath(`/dividas/${debtId}`);
  back(debtId, "ok", "Registro adicionado à negociação.");
}

export async function acceptProposal(debtId: string, entryId: string, formData: FormData) {
  const { supabase } = await requireHousehold();
  const amount = parseBRL(text(formData, "amount"));
  if (amount === null || amount <= 0) back(debtId, "erro", "Informe o valor acordado.");
  const installments = Number(text(formData, "installments"));
  if (!Number.isInteger(installments) || installments < 1) back(debtId, "erro", "Informe o número de parcelas.");
  const dueRaw = text(formData, "due_day");
  const due = dueRaw ? Number(dueRaw) : null;
  if (due !== null && (!Number.isInteger(due) || due < 1 || due > 31)) back(debtId, "erro", "Dia de vencimento deve ser entre 1 e 31.");
  const rateRaw = text(formData, "monthly_rate");
  const rate = rateRaw ? parsePercent(rateRaw) : null;
  if (rateRaw && rate === null) back(debtId, "erro", "Taxa inválida.");
  const { error } = await supabase.rpc("accept_proposal", {
    p_entry_id: entryId,
    p_amount_cents: amount,
    p_installments: installments,
    p_due_day: due,
    p_monthly_rate: rate,
  });
  if (error) back(debtId, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(debtId, "ok", "Proposta aceita: a dívida foi convertida para o acordo.");
}

export async function closeNegotiation(debtId: string, negotiationId: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("close_negotiation", { p_negotiation_id: negotiationId });
  if (error) back(debtId, "erro", friendlyError(error.message));
  revalidatePath("/", "layout");
  back(debtId, "ok", "Negociação encerrada sem acordo.");
}
