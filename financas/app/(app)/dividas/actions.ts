"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, withParam } from "@/lib/errors";
import { monthStart, todayISO } from "@/lib/finance/dates";
import type { DebtKind, DebtStatus } from "@/lib/finance/debts";
import { parseBRL, parsePercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

const KINDS: DebtKind[] = ["parcelada_sem_juros", "parcelada_com_juros", "juros_sobre_principal", "conta_em_atraso"];
const STATUSES: DebtStatus[] = ["em_dia", "em_atraso", "em_negociacao", "quitada"];

class FormError extends Error {}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function money(fd: FormData, key: string, label: string, required = true): number | null {
  const raw = text(fd, key);
  if (!raw && !required) return null;
  const cents = parseBRL(raw);
  if (cents === null || cents < 0) throw new FormError(`Valor inválido em “${label}”. Use o formato 1.234,56.`);
  return cents;
}

function percent(fd: FormData, key: string, label: string, required = false): number | null {
  const raw = text(fd, key);
  if (!raw) {
    if (required) throw new FormError(`Informe “${label}”.`);
    return null;
  }
  const rate = parsePercent(raw);
  if (rate === null) throw new FormError(`Percentual inválido em “${label}”.`);
  return rate;
}

function int(fd: FormData, key: string, label: string, min: number, max: number, required = false): number | null {
  const raw = text(fd, key);
  if (!raw) {
    if (required) throw new FormError(`Informe “${label}”.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new FormError(`“${label}” deve ser entre ${min} e ${max}.`);
  return n;
}

/** Converte o formulário em colunas da tabela debts, conforme o tipo. */
function debtFields(fd: FormData, isNew: boolean) {
  const kind = text(fd, "kind") as DebtKind;
  if (!KINDS.includes(kind)) throw new FormError("Escolha o tipo da dívida.");
  const status = text(fd, "status") as DebtStatus;
  if (!STATUSES.includes(status)) throw new FormError("Status inválido.");
  const name = text(fd, "name");
  if (!name) throw new FormError("Informe o nome da dívida.");

  const base = {
    name,
    creditor: text(fd, "creditor") || null,
    kind,
    status,
    due_day: int(fd, "due_day", "Dia de vencimento", 1, 31, kind === "juros_sobre_principal"),
    notes: text(fd, "notes") || null,
    risk_priority: fd.get("risk_priority") === "on",
    // limpa campos de outros tipos
    installment_cents: null as number | null,
    installments_known: true,
    balance_cents: null as number | null,
    monthly_rate: null as number | null,
    principal_cents: null as number | null,
    accrual_start_month: null as string | null,
    original_due_date: null as string | null,
    late_fee_rate: null as number | null,
    late_interest_rate: null as number | null,
  };
  let original: number | null = money(fd, "original", "Valor original", false);

  if (kind === "parcelada_sem_juros" || kind === "parcelada_com_juros") {
    const installment = money(fd, "installment", "Valor da parcela")!;
    if (installment === 0) throw new FormError("O valor da parcela precisa ser maior que zero.");
    const known = fd.get("installments_unknown") !== "on";
    const remaining = known ? int(fd, "installments_remaining", "Parcelas restantes", 0, 600, true)! : 1;
    base.installment_cents = installment;
    base.installments_known = known;
    base.balance_cents = installment * remaining;
    if (kind === "parcelada_com_juros") base.monthly_rate = percent(fd, "monthly_rate", "Taxa de juros mensal");
    original ??= installment * remaining;
  } else if (kind === "juros_sobre_principal") {
    base.principal_cents = money(fd, "principal", "Principal")!;
    base.monthly_rate = percent(fd, "monthly_rate", "Taxa de juros mensal", true);
    base.accrual_start_month = monthStart(text(fd, "accrual_start") || todayISO());
    original ??= base.principal_cents;
  } else {
    base.principal_cents = money(fd, "open_amount", "Valor em aberto")!;
    base.original_due_date = text(fd, "original_due_date") || null;
    base.late_fee_rate = percent(fd, "late_fee_rate", "Multa");
    base.late_interest_rate = percent(fd, "late_interest_rate", "Juros ao mês");
    if ((base.late_fee_rate || base.late_interest_rate) && !base.original_due_date) {
      throw new FormError("Para calcular multa/juros, informe a data do vencimento original.");
    }
    original ??= base.principal_cents;
  }

  if (base.status === "quitada" && isNew) throw new FormError("Uma dívida nova não pode começar quitada.");
  return { ...base, original_cents: original! };
}

export async function createDebt(formData: FormData) {
  const { supabase, household } = await requireHousehold();
  let id: string;
  try {
    const fields = debtFields(formData, true);
    const { data, error } = await supabase
      .from("debts")
      .insert({ ...fields, household_id: household.id })
      .select("id")
      .single();
    if (error) throw new FormError(friendlyError(error.message));
    id = data.id;
  } catch (e) {
    if (e instanceof FormError) redirect(withParam("/dividas/nova", "erro", e.message));
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(withParam(`/dividas/${id}`, "ok", "Dívida cadastrada."));
}

export async function updateDebt(id: string, formData: FormData) {
  const { supabase } = await requireHousehold();
  try {
    const fields = debtFields(formData, false);
    const { error } = await supabase.from("debts").update(fields).eq("id", id);
    if (error) throw new FormError(friendlyError(error.message));
  } catch (e) {
    if (e instanceof FormError) redirect(withParam(`/dividas/${id}/editar`, "erro", e.message));
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(withParam(`/dividas/${id}`, "ok", "Dívida atualizada."));
}

export async function deleteDebt(id: string, formData: FormData) {
  const { supabase } = await requireHousehold();
  if (formData.get("confirm") !== "on") {
    redirect(withParam(`/dividas/${id}`, "erro", "Marque a confirmação para excluir."));
  }
  const { error } = await supabase.from("debts").delete().eq("id", id);
  if (error) redirect(withParam(`/dividas/${id}`, "erro", friendlyError(error.message)));
  revalidatePath("/", "layout");
  redirect(withParam("/dividas", "ok", "Dívida excluída."));
}

export async function registerPayment(id: string, formData: FormData) {
  const { supabase } = await requireHousehold();
  const amount = parseBRL(text(formData, "amount"));
  const paidOn = text(formData, "paid_on");
  if (amount === null || amount <= 0) redirect(withParam(`/dividas/${id}`, "erro", "Informe um valor válido, ex.: 1.234,56."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) redirect(withParam(`/dividas/${id}`, "erro", "Informe a data do pagamento."));
  const { error } = await supabase.rpc("register_payment", {
    p_debt_id: id,
    p_paid_on: paidOn,
    p_amount_cents: amount,
    p_notes: text(formData, "notes") || null,
  });
  if (error) redirect(withParam(`/dividas/${id}`, "erro", friendlyError(error.message)));
  revalidatePath("/", "layout");
  redirect(withParam(`/dividas/${id}`, "ok", "Pagamento registrado."));
}

export async function undoLastPayment(id: string) {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("undo_last_payment", { p_debt_id: id });
  if (error) redirect(withParam(`/dividas/${id}`, "erro", friendlyError(error.message)));
  revalidatePath("/", "layout");
  redirect(withParam(`/dividas/${id}`, "ok", "Último pagamento desfeito."));
}

export async function loadSeedDebts() {
  const { supabase } = await requireHousehold();
  const { error } = await supabase.rpc("load_seed_debts");
  if (error) redirect(withParam("/dividas", "erro", friendlyError(error.message)));
  revalidatePath("/", "layout");
  redirect(withParam("/dividas", "ok", "Dívidas de outubro/2026 carregadas."));
}
