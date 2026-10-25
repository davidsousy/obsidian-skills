// Alertas: próximos vencimentos, itens em atraso e dívidas cujos juros superam o que foi pago.

import { addDays, addMonths, dueDateInMonth, monthStart, type ISODate } from "./dates";
import { fixedCostApplies, type FixedCost } from "./costs";
import { debtBalance, isInstallment, type Debt } from "./debts";
import { applyRate, type Cents } from "./money";

export type PaymentRef = { debtId: string; paidOn: ISODate; amountCents: Cents; interestCents: Cents };

export type DueItem = {
  source: "debt" | "fixed_cost";
  id: string;
  name: string;
  dueDate: ISODate;
  amountCents: Cents;
};

function paidInMonth(payments: PaymentRef[], debtId: string, month: ISODate): boolean {
  return payments.some((p) => p.debtId === debtId && monthStart(p.paidOn) === monthStart(month));
}

/** Valor que vence no mês `month` para uma dívida com vencimento mensal (null = nada a vencer). */
function debtDueAmount(d: Debt, month: ISODate): Cents | null {
  if (isInstallment(d)) return Math.min(d.installmentCents ?? 0, debtBalance(d)) || null;
  if (d.kind === "juros_sobre_principal") {
    const open = d.charges
      .filter((c) => c.referenceMonth <= monthStart(month))
      .reduce((s, c) => s + c.amountCents - c.paidCents, 0);
    if (open > 0) return open;
    // mês ainda sem juros lançado: estimativa = principal × taxa
    const charged = d.charges.some((c) => c.referenceMonth === monthStart(month));
    return charged ? null : applyRate(d.principalCents ?? 0, d.monthlyRate ?? 0) || null;
  }
  return null; // conta em atraso não tem vencimento mensal (já venceu)
}

/** Vencimentos de `today` até `today + days` (dívidas com dia de vencimento e custos fixos). */
export function upcomingDues(
  debts: Debt[],
  payments: PaymentRef[],
  fixedCosts: FixedCost[],
  today: ISODate,
  days = 7,
): DueItem[] {
  const until = addDays(today, days);
  const out: DueItem[] = [];
  const months = [monthStart(today), addMonths(monthStart(today), 1)];

  for (const d of debts) {
    if (d.status === "quitada" || !d.dueDay || d.kind === "conta_em_atraso") continue;
    for (const m of months) {
      const due = dueDateInMonth(m, d.dueDay);
      if (due < today || due > until) continue;
      if (isInstallment(d) && paidInMonth(payments, d.id, m)) continue;
      const amount = debtDueAmount(d, m);
      if (amount) out.push({ source: "debt", id: d.id, name: d.name, dueDate: due, amountCents: amount });
    }
  }
  for (const c of fixedCosts) {
    if (!c.dueDay) continue;
    for (const m of months) {
      const due = dueDateInMonth(m, c.dueDay);
      if (due < today || due > until || !fixedCostApplies(c, m)) continue;
      out.push({ source: "fixed_cost", id: c.id, name: c.name, dueDate: due, amountCents: c.amountCents });
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.name.localeCompare(b.name)));
}

export type OverdueItem = { id: string; name: string; amountCents: Cents; reason: string };

/** Contas em atraso e parcelas/juros do mês que já venceram sem pagamento. */
export function overdueItems(debts: Debt[], payments: PaymentRef[], today: ISODate): OverdueItem[] {
  const out: OverdueItem[] = [];
  for (const d of debts) {
    if (d.status === "quitada") continue;
    if (d.kind === "conta_em_atraso" || d.status === "em_atraso") {
      out.push({
        id: d.id,
        name: d.name,
        amountCents: debtBalance(d),
        reason: d.status === "em_negociacao" ? "em atraso (em negociação)" : "em atraso",
      });
      continue;
    }
    if (!d.dueDay) continue;
    const due = dueDateInMonth(today, d.dueDay);
    if (due >= today) continue;
    if (isInstallment(d) && !paidInMonth(payments, d.id, today)) {
      out.push({ id: d.id, name: d.name, amountCents: Math.min(d.installmentCents ?? 0, debtBalance(d)), reason: `parcela vencida em ${due.slice(8, 10)}/${due.slice(5, 7)}` });
    } else if (d.kind === "juros_sobre_principal") {
      const open = d.charges.filter((c) => c.referenceMonth <= monthStart(today)).reduce((s, c) => s + c.amountCents - c.paidCents, 0);
      if (open > 0) out.push({ id: d.id, name: d.name, amountCents: open, reason: `juros vencidos em ${due.slice(8, 10)}/${due.slice(5, 7)}` });
    }
  }
  return out;
}

export type InterestAlert = { id: string; name: string; chargedCents: Cents; paidCents: Cents };

/** Dívidas em que os juros/multas lançados superam tudo o que já foi pago nelas. */
export function interestOverPaid(debts: Debt[], payments: PaymentRef[]): InterestAlert[] {
  const out: InterestAlert[] = [];
  for (const d of debts) {
    if (d.status === "quitada" || d.charges.length === 0) continue;
    const charged = d.charges.reduce((s, c) => s + c.amountCents, 0);
    const paid = payments.filter((p) => p.debtId === d.id).reduce((s, p) => s + p.amountCents, 0);
    if (charged > paid) out.push({ id: d.id, name: d.name, chargedCents: charged, paidCents: paid });
  }
  return out;
}

/** Itens que devem ir por e-mail hoje: vencem exatamente daqui a `daysBefore` dias. */
export function emailDues(dues: DueItem[], today: ISODate, daysBefore: number): DueItem[] {
  const target = addDays(today, daysBefore);
  return dues.filter((d) => d.dueDate === target);
}
