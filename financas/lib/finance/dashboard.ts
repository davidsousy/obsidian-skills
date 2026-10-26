// Indicadores do painel: meta de zerar atrasos e agiotas, progresso das dívidas (sem o carro),
// juros dos agiotas, custos essenciais × dá para cortar, vencimentos do mês, calendário e resumo do mês.

import { CATEGORY_LABEL, fixedCostApplies, type CostCategory, type FixedCost, type VariableExpense } from "./costs";
import { addDays, dueDateInMonth, endOfMonthISO, monthStart, parseISO, type ISODate } from "./dates";
import { debtBalance, debtGroup, isInstallment, openCharges, type Debt } from "./debts";
import { applyRate, type Cents } from "./money";

type PaymentLike = { debtId: string; paidOn: ISODate; amountCents: Cents; interestCents: Cents; principalCents: Cents };

// ---------- custos por categoria ----------

/** Categorias que não dá para cortar; as demais aparecem como "dá para cortar". */
export const ESSENTIAL_CATEGORIES: ReadonlySet<CostCategory> = new Set(["moradia", "alimentacao", "carro", "saude"]);

export type CategoryBar = { category: CostCategory; label: string; cents: Cents; essential: boolean };

/** Custos fixos ativos por categoria (maior primeiro) e os totais de essencial e de "dá para cortar". */
export function costsByCategory(costs: FixedCost[]): { bars: CategoryBar[]; essential: Cents; cuttable: Cents } {
  const map = new Map<CostCategory, Cents>();
  for (const c of costs) if (c.active) map.set(c.category, (map.get(c.category) ?? 0) + c.amountCents);
  const bars = [...map]
    .map(([category, cents]) => ({ category, label: CATEGORY_LABEL[category], cents, essential: ESSENTIAL_CATEGORIES.has(category) }))
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  const essential = bars.filter((b) => b.essential).reduce((s, b) => s + b.cents, 0);
  return { bars, essential, cuttable: bars.reduce((s, b) => s + b.cents, 0) - essential };
}

// ---------- progresso ----------

/** Parcelada sem número de parcelas (o carro): paga todo mês e nunca termina, então fica fora do progresso. */
export function isOpenEnded(d: Pick<Debt, "kind" | "installmentsKnown">): boolean {
  return isInstallment(d) && !d.installmentsKnown;
}

const pctOf = (part: Cents, total: Cents) => (total > 0 ? Math.floor((part / total) * 100) : 0);

export type DebtProgress = {
  paid: Cents; // principal já abatido
  installments: Cents; // saldo das parceladas
  overdueAndLoans: Cents; // saldo dos atrasos e dos agiotas (com juros/multas em aberto)
  pct: number; // pago ÷ (pago + parcelado + atrasos e agiotas), arredondado para baixo
  excluded: string[]; // dívidas fora da conta (o carro)
};

export function debtProgress(debts: Debt[], payments: PaymentLike[]): DebtProgress {
  const counted = debts.filter((d) => !isOpenEnded(d));
  const ids = new Set(counted.map((d) => d.id));
  const paid = payments.filter((p) => ids.has(p.debtId)).reduce((s, p) => s + p.principalCents, 0);
  let installments = 0;
  let overdueAndLoans = 0;
  for (const d of counted) {
    const group = debtGroup(d);
    if (group === "parceladas") installments += debtBalance(d);
    else if (group !== "quitadas") overdueAndLoans += debtBalance(d);
  }
  return {
    paid,
    installments,
    overdueAndLoans,
    pct: pctOf(paid, paid + installments + overdueAndLoans),
    excluded: debts.filter(isOpenEnded).map((d) => d.name),
  };
}

export type GoalProgress = { remaining: Cents; paid: Cents; pct: number; done: boolean };

/** Meta "zerar atrasos e agiotas": quanto falta (com juros/multas em aberto) e quanto do principal já foi pago. */
export function goalProgress(debts: Debt[], payments: PaymentLike[]): GoalProgress {
  const goal = debts.filter((d) => d.kind === "conta_em_atraso" || d.kind === "juros_sobre_principal" || debtGroup(d) === "atraso");
  const ids = new Set(goal.map((d) => d.id));
  const remaining = goal.filter((d) => d.status !== "quitada").reduce((s, d) => s + debtBalance(d), 0);
  const paid = payments.filter((p) => ids.has(p.debtId)).reduce((s, p) => s + p.principalCents, 0);
  return { remaining, paid, pct: pctOf(paid, paid + remaining), done: goal.length > 0 && remaining === 0 };
}

// ---------- agiotas ----------

export type LoanInterest = {
  monthly: Cents; // juros de um mês (principal × taxa)
  open: Cents; // juros lançados e ainda não pagos
  paid: Cents; // juros já pagos (histórico)
  items: { id: string; name: string; principalCents: Cents; rate: number; monthlyCents: Cents; openCents: Cents; dueDay: number | null }[];
};

export function loanInterest(debts: Debt[], payments: PaymentLike[]): LoanInterest {
  const loans = debts.filter((d) => d.kind === "juros_sobre_principal");
  const ids = new Set(loans.map((d) => d.id));
  const items = loans
    .filter((d) => d.status !== "quitada")
    .map((d) => ({
      id: d.id,
      name: d.name,
      principalCents: d.principalCents ?? 0,
      rate: d.monthlyRate ?? 0,
      monthlyCents: applyRate(d.principalCents ?? 0, d.monthlyRate ?? 0),
      openCents: openCharges(d),
      dueDay: d.dueDay,
    }));
  return {
    monthly: items.reduce((s, i) => s + i.monthlyCents, 0),
    open: items.reduce((s, i) => s + i.openCents, 0),
    paid: payments.filter((p) => ids.has(p.debtId)).reduce((s, p) => s + p.interestCents, 0),
    items,
  };
}

// ---------- vencimentos do mês e calendário ----------

export type MonthDue = {
  source: "debt" | "fixed_cost";
  id: string;
  name: string;
  dueDate: ISODate;
  amountCents: Cents;
  type: "parcela" | "juros" | "custo";
  /** dívidas: pago no mês; custos fixos: null (o app não registra o pagamento de custo fixo) */
  paid: boolean | null;
};

/** Tudo o que vence no mês: parcelas, juros dos agiotas (o lançado no mês ou a estimativa) e custos fixos. */
export function duesInMonth(month: ISODate, debts: Debt[], payments: PaymentLike[], fixedCosts: FixedCost[]): MonthDue[] {
  const ref = monthStart(month);
  const out: MonthDue[] = [];
  for (const d of debts) {
    if (d.status === "quitada" || !d.dueDay || d.kind === "conta_em_atraso") continue;
    const dueDate = dueDateInMonth(ref, d.dueDay);
    if (isInstallment(d)) {
      const paid = payments.some((p) => p.debtId === d.id && monthStart(p.paidOn) === ref);
      const amount = Math.min(d.installmentCents ?? 0, d.installmentsKnown ? debtBalance(d) : Infinity);
      if (amount > 0) out.push({ source: "debt", id: d.id, name: d.name, dueDate, amountCents: amount, type: "parcela", paid });
    } else {
      const charge = d.charges.find((c) => c.kind === "juros" && c.referenceMonth === ref);
      const amount = charge ? charge.amountCents : applyRate(d.principalCents ?? 0, d.monthlyRate ?? 0);
      const paid = charge ? charge.paidCents >= charge.amountCents : false;
      if (amount > 0) out.push({ source: "debt", id: d.id, name: d.name, dueDate, amountCents: amount, type: "juros", paid });
    }
  }
  for (const c of fixedCosts) {
    if (!c.dueDay || !fixedCostApplies(c, ref)) continue;
    out.push({ source: "fixed_cost", id: c.id, name: c.name, dueDate: dueDateInMonth(ref, c.dueDay), amountCents: c.amountCents, type: "custo", paid: null });
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.name.localeCompare(b.name)));
}

export type CalendarDay = { date: ISODate; inMonth: boolean; items: MonthDue[] };

/** Semanas de domingo a sábado que cobrem o mês, com os vencimentos de cada dia. */
export function calendarWeeks(month: ISODate, dues: MonthDue[]): CalendarDay[][] {
  const first = monthStart(month);
  const last = endOfMonthISO(first);
  const { y, m } = parseISO(first);
  let cursor = addDays(first, -new Date(Date.UTC(y, m - 1, 1)).getUTCDay());
  const weeks: CalendarDay[][] = [];
  while (cursor <= last) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = cursor;
      week.push({ date, inMonth: monthStart(date) === first, items: dues.filter((d) => d.dueDate === date) });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// ---------- resumo do mês ----------

export type MonthSummary = {
  month: ISODate;
  income: Cents; // renda recebida no mês (Uber bruto + entradas)
  fixedCosts: Cents; // custos fixos que contam no mês (previsto)
  variable: Cents; // gastos variáveis lançados no mês
  debtDue: Cents; // parcelas + juros dos agiotas que vencem no mês
  debtDueOpen: Cents; // desses, o que ainda não foi pago
  debtPaid: Cents; // pagamentos de dívidas feitos no mês (inclui atrasos)
  interestPaid: Cents; // parte dos pagamentos que foi juros/multa
  balance: Cents; // renda − custos fixos − gastos variáveis − pagamentos de dívidas
};

export function monthSummary(
  month: ISODate,
  input: {
    debts: Debt[];
    payments: PaymentLike[];
    fixedCosts: FixedCost[];
    expenses: Pick<VariableExpense, "spentOn" | "amountCents">[];
    income: { date: ISODate; amountCents: Cents }[];
  },
): MonthSummary {
  const ref = monthStart(month);
  const inMonth = (date: ISODate) => monthStart(date) === ref;
  const dues = duesInMonth(ref, input.debts, input.payments, input.fixedCosts).filter((d) => d.source === "debt");
  const paidHere = input.payments.filter((p) => inMonth(p.paidOn));
  const income = input.income.filter((i) => inMonth(i.date)).reduce((s, i) => s + i.amountCents, 0);
  const fixedCosts = input.fixedCosts.filter((c) => fixedCostApplies(c, ref)).reduce((s, c) => s + c.amountCents, 0);
  const variable = input.expenses.filter((e) => inMonth(e.spentOn)).reduce((s, e) => s + e.amountCents, 0);
  const debtPaid = paidHere.reduce((s, p) => s + p.amountCents, 0);
  return {
    month: ref,
    income,
    fixedCosts,
    variable,
    debtDue: dues.reduce((s, d) => s + d.amountCents, 0),
    debtDueOpen: dues.filter((d) => !d.paid).reduce((s, d) => s + d.amountCents, 0),
    debtPaid,
    interestPaid: paidHere.reduce((s, p) => s + p.interestCents, 0),
    balance: income - fixedCosts - variable - debtPaid,
  };
}
