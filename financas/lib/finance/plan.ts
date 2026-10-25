// Plano de quitação — simulação mês a mês com a estratégia avalanche.
//
// O plano começa no mês seguinte ao de hoje (o mês corrente segue pelos lançamentos reais) e
// parte dos saldos atuais (inclusive juros já lançados e não pagos). Em cada mês:
//   1. lança os juros do mês (agiotas: principal × taxa; contas em atraso com juros)
//   2. paga os mínimos: custos fixos, gastos variáveis, parcelas do mês e juros em aberto dos agiotas
//   3. completa a reserva de emergência até a meta
//   4. todo o excedente vai para as dívidas na ordem de prioridade:
//        agiotas (maior taxa primeiro) → prioridade de risco (aluguel → condomínio → luz → água)
//        → dívidas com juros/multa (maior taxa) → sem juros (menor saldo primeiro)
//      Uma ordem manual (priority_override) substitui a automática.
// Parcela sem nº de parcelas informado (carro) é paga todo mês e nunca é quitada antecipadamente.

import { addMonths, endOfMonthISO, monthsBetween, monthStart, type ISODate } from "./dates";
import { fixedTotalForMonth, type FixedCost } from "./costs";
import { accrue, applyPayment, debtBalance, isInstallment, type Debt } from "./debts";
import type { Cents } from "./money";

export type PlanDebt = Debt & { priorityOverride?: number | null };

export type PlanInput = {
  today: ISODate;
  debts: PlanDebt[];
  fixedCosts: FixedCost[];
  variableMonthly: Cents;
  reserveTarget: Cents;
  reserveBalance: Cents;
};

export type MonthResult = {
  month: ISODate; // 1º dia do mês
  income: Cents;
  fixed: Cents;
  variable: Cents;
  installments: Cents; // parcelas obrigatórias do mês
  interest: Cents; // juros/multas pagos
  extra: Cents; // abatimento além do mínimo
  reserve: Cents; // aporte na reserva
  leftover: Cents; // sobra (positivo) ou falta (negativo) no mês
  shortfall: Cents; // mínimos (parcelas/juros) que ficaram sem pagar no mês
  minimumRequired: Cents; // renda mínima do mês: fixos + variáveis + parcelas + juros em aberto
  payments: { debtId: string; name: string; amount: Cents; interest: Cents; minimum: boolean }[];
  paidOff: string[]; // nomes das dívidas quitadas no mês
  remainingDebt: Cents;
};

export type SimulationResult = {
  months: MonthResult[];
  payoffMonth: Record<string, ISODate | null>; // por id da dívida; null = não quitou no horizonte
  allPaidMonth: ISODate | null; // mês em que a última dívida quitável foi quitada
  firstShortfallMonth: ISODate | null; // primeiro mês em que a renda não cobriu os mínimos
  totalInterest: Cents;
  order: string[]; // ids na ordem de prioridade usada
};

/** Dívidas que o plano consegue quitar (exclui parcela sem nº de parcelas informado). */
export function isPayable(d: Debt): boolean {
  return d.status !== "quitada" && !(isInstallment(d) && !d.installmentsKnown);
}

const RISK_ORDER = [/aluguel/i, /condom/i, /\bluz\b|energia/i, /[áa]gua/i];

function riskRank(name: string): number {
  const i = RISK_ORDER.findIndex((re) => re.test(name));
  return i === -1 ? RISK_ORDER.length : i;
}

function rateOf(d: Debt): number {
  if (d.kind === "conta_em_atraso") return Math.max(d.lateInterestRate ?? 0, d.lateFeeRate ? 1e-6 : 0);
  return d.monthlyRate ?? 0;
}

/** Grupo da avalanche: 0 agiotas, 1 prioridade de risco, 2 com juros/multa, 3 sem juros. */
export function avalancheGroup(d: Debt): number {
  if (d.kind === "juros_sobre_principal") return 0;
  if (d.riskPriority) return 1;
  if (rateOf(d) > 0) return 2;
  return 3;
}

/** Ordem automática (avalanche) ou manual, se houver priority_override. */
export function priorityOrder(debts: PlanDebt[]): PlanDebt[] {
  const auto = [...debts].sort((a, b) => {
    const ga = avalancheGroup(a);
    const gb = avalancheGroup(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0 || ga === 2) return rateOf(b) - rateOf(a) || debtBalance(a) - debtBalance(b);
    if (ga === 1) return riskRank(a.name) - riskRank(b.name) || debtBalance(a) - debtBalance(b);
    return debtBalance(a) - debtBalance(b);
  });
  if (!debts.some((d) => d.priorityOverride != null)) return auto;
  // manual primeiro (pela ordem informada); as sem ordem seguem a automática
  return [...auto].sort((a, b) => {
    const oa = a.priorityOverride ?? Number.MAX_SAFE_INTEGER;
    const ob = b.priorityOverride ?? Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });
}

/** Primeiro mês do plano = mês seguinte ao de hoje. */
export function planStart(today: ISODate): ISODate {
  return addMonths(monthStart(today), 1);
}

/** Meses do plano até a data-alvo (inclusive o mês da data-alvo). */
export function monthsUntil(today: ISODate, target: ISODate): number {
  return monthsBetween(today, target);
}

export type SimulateOptions = {
  maxMonths?: number;
  /** Renda de cada mês (índice 0 = primeiro mês do plano). */
  incomeFor: (index: number, month: ISODate) => Cents;
  /** Ajustes por mês (simulador): custo fixo extra (negativo = corte). */
  fixedDeltaFor?: (index: number, month: ISODate) => Cents;
  /** Para de simular quando tudo estiver quitado. */
  stopWhenDone?: boolean;
  /** Renda do mês nunca abaixo do mínimo do mês (renda necessária por fases). */
  floorToMinimum?: boolean;
};

export function simulate(input: PlanInput, opts: SimulateOptions): SimulationResult {
  const maxMonths = opts.maxMonths ?? 120;
  let debts: PlanDebt[] = input.debts.filter((d) => d.status !== "quitada").map((d) => ({ ...d, charges: [...d.charges] }));
  const order = priorityOrder(debts.filter(isPayable)).map((d) => d.id);
  const payoffMonth: Record<string, ISODate | null> = Object.fromEntries(debts.map((d) => [d.id, null]));
  let reserve = input.reserveBalance;
  let totalInterest = 0;
  const months: MonthResult[] = [];
  let allPaidMonth: ISODate | null = debts.some(isPayable) ? null : planStart(input.today);
  let firstShortfallMonth: ISODate | null = null;

  const replace = (d: PlanDebt) => {
    debts = debts.map((x) => (x.id === d.id ? d : x));
  };

  for (let i = 0; i < maxMonths; i++) {
    const month = addMonths(planStart(input.today), i);
    debts = debts.map((d) => (d.status === "quitada" ? d : accrue(d, month)));

    const fixed = fixedTotalForMonth(input.fixedCosts, month) + (opts.fixedDeltaFor?.(i, month) ?? 0);
    const variable = input.variableMonthly;

    // mínimos: juros em aberto dos agiotas (maior taxa primeiro), depois parcelas do mês
    const minimums: { d: PlanDebt; amount: Cents }[] = [];
    for (const d of priorityOrder(debts.filter((x) => x.status !== "quitada"))) {
      if (d.kind === "juros_sobre_principal") {
        const open = d.charges.reduce((s, c) => s + c.amountCents - c.paidCents, 0);
        if (open > 0) minimums.push({ d, amount: open });
      }
    }
    for (const d of debts) {
      if (d.status !== "quitada" && isInstallment(d)) {
        minimums.push({ d, amount: Math.min(d.installmentCents ?? 0, debtBalance(d)) });
      }
    }
    const minimumRequired = fixed + variable + minimums.reduce((s, m) => s + m.amount, 0);

    const base = opts.incomeFor(i, month);
    const income = opts.floorToMinimum ? Math.max(base, minimumRequired) : base;
    let cash = income - fixed - variable;
    const r: MonthResult = {
      month, income, fixed, variable, installments: 0, interest: 0, extra: 0, reserve: 0, leftover: 0,
      shortfall: 0, minimumRequired, payments: [], paidOff: [], remainingDebt: 0,
    };

    const pay = (d: PlanDebt, amount: Cents, minimum: boolean) => {
      if (amount <= 0) return;
      if (isInstallment(d) && !d.installmentsKnown) {
        // carro sem nº de parcelas: paga a parcela, saldo não muda
        r.installments += amount;
        r.payments.push({ debtId: d.id, name: d.name, amount, interest: 0, minimum });
        cash -= amount;
        return;
      }
      const res = applyPayment(d, amount);
      replace(res.debt as PlanDebt);
      cash -= amount;
      r.interest += res.interestCents;
      totalInterest += res.interestCents;
      if (minimum && isInstallment(d)) r.installments += res.principalCents;
      else r.extra += res.principalCents;
      r.payments.push({ debtId: d.id, name: d.name, amount, interest: res.interestCents, minimum });
      if (res.debt.status === "quitada") {
        payoffMonth[d.id] = month;
        r.paidOff.push(d.name);
      }
    };

    // 2. paga os mínimos
    for (const { d, amount } of minimums) {
      const current = debts.find((x) => x.id === d.id)!;
      const paid = Math.max(0, Math.min(amount, cash));
      pay(current, paid, true);
      r.shortfall += amount - paid;
    }
    if (cash < 0) r.shortfall += -cash; // nem os custos fixos/variáveis couberam
    if (r.shortfall > 0 && firstShortfallMonth === null) firstShortfallMonth = month;

    // 3. reserva de emergência
    if (cash > 0 && reserve < input.reserveTarget) {
      const add = Math.min(cash, input.reserveTarget - reserve);
      reserve += add;
      r.reserve = add;
      cash -= add;
    }

    // 4. excedente na ordem de prioridade
    for (const id of order) {
      if (cash <= 0) break;
      const d = debts.find((x) => x.id === id)!;
      if (d.status === "quitada") continue;
      pay(d, Math.min(cash, debtBalance(d)), false);
    }

    r.leftover = cash;
    r.remainingDebt = debts.filter(isPayable).reduce((s, d) => s + debtBalance(d), 0);
    months.push(r);

    if (allPaidMonth === null && debts.filter(isPayable).length === 0) {
      allPaidMonth = month;
      if (opts.stopWhenDone) break;
    }
  }

  return { months, payoffMonth, allPaidMonth, firstShortfallMonth, totalInterest, order };
}

export type RequiredIncome = {
  monthly: Cents; // renda mensal necessária (constante)
  months: number;
  breakdown: {
    fixed: Cents;
    variable: Cents;
    installments: Cents;
    interest: Cents;
    extra: Cents;
    reserve: Cents;
    slack: Cents; // sobra média (arredondamento e último mês)
  };
  simulation: SimulationResult;
};

/**
 * Menor renda mensal constante que paga todos os mínimos em todos os meses e quita todas as
 * dívidas quitáveis até o fim do mês da data-alvo (busca binária na simulação).
 * Retorna null se a data-alvo é antes do fim do primeiro mês do plano.
 */
export function requiredIncome(input: PlanInput, target: ISODate): RequiredIncome | null {
  const months = monthsUntil(input.today, target);
  if (months < 1) return null;
  const lastMonth = addMonths(planStart(input.today), months - 1);
  const ok = (income: Cents) => {
    const sim = simulate(input, { maxMonths: months, incomeFor: () => income });
    return sim.firstShortfallMonth === null && sim.allPaidMonth !== null && sim.allPaidMonth <= lastMonth;
  };
  // busca em reais inteiros: menor valor que funciona
  let lo = -1; // não funciona (renda negativa)
  let hi = 1_000_000; // R$ 1 milhão/mês
  while (!ok(hi * 100)) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid * 100)) hi = mid;
    else lo = mid;
  }
  const monthly = hi * 100;
  const simulation = simulate(input, { maxMonths: months, incomeFor: () => monthly });
  return { monthly, months, breakdown: breakdownOf(simulation), simulation };
}

/** Média por mês de cada componente da renda numa simulação. */
export function breakdownOf(sim: SimulationResult): RequiredIncome["breakdown"] {
  const n = Math.max(1, sim.months.length);
  const avg = (f: (m: MonthResult) => number) => Math.round(sim.months.reduce((s, m) => s + f(m), 0) / n);
  return {
    fixed: avg((m) => m.fixed),
    variable: avg((m) => m.variable),
    installments: avg((m) => m.installments),
    interest: avg((m) => m.interest),
    extra: avg((m) => m.extra),
    reserve: avg((m) => m.reserve),
    slack: avg((m) => m.leftover),
  };
}

export type Phase = { from: ISODate; to: ISODate; income: Cents };

export type RequiredSchedule = {
  base: Cents; // renda-base: vale nos meses em que o mínimo do mês é menor
  peak: Cents; // mês mais pesado
  months: { month: ISODate; income: Cents }[];
  phases: Phase[]; // meses consecutivos com a mesma renda
  simulation: SimulationResult;
};

/**
 * Renda necessária por fases: em cada mês, o maior entre o mínimo do mês e uma renda-base.
 * A renda-base é a menor que quita tudo até o fim do mês da data-alvo.
 */
export function requiredSchedule(input: PlanInput, target: ISODate): RequiredSchedule | null {
  const months = monthsUntil(input.today, target);
  if (months < 1) return null;
  const lastMonth = addMonths(planStart(input.today), months - 1);
  const run = (base: Cents) => simulate(input, { maxMonths: months, incomeFor: () => base, floorToMinimum: true });
  const ok = (base: Cents) => {
    const sim = run(base);
    return sim.firstShortfallMonth === null && sim.allPaidMonth !== null && sim.allPaidMonth <= lastMonth;
  };
  let lo = -1;
  let hi = 1_000_000;
  while (!ok(hi * 100)) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid * 100)) hi = mid;
    else lo = mid;
  }
  const base = hi * 100;
  const simulation = run(base);
  const list = simulation.months.map((m) => ({ month: m.month, income: m.income }));
  const phases: Phase[] = [];
  for (const m of list) {
    const last = phases.at(-1);
    if (last && last.income === m.income) last.to = m.month;
    else phases.push({ from: m.month, to: m.month, income: m.income });
  }
  return { base, peak: Math.max(...list.map((m) => m.income)), months: list, phases, simulation };
}

export type Viability = "viavel" | "apertado" | "inviavel";

/** viável: folga ≥ margem; apertado: 0 ≤ folga < margem; inviável: renda real < necessária. */
export function viability(realIncome: Cents, required: Cents, tightMarginPct: number): { status: Viability; diff: Cents; margin: number } {
  const diff = realIncome - required;
  const margin = required > 0 ? diff / required : Infinity;
  const status: Viability = diff < 0 ? "inviavel" : margin * 100 < tightMarginPct ? "apertado" : "viavel";
  return { status, diff, margin };
}

/** Horas de Uber a mais para cobrir a diferença (null se não precisa ou sem ganho líquido). */
export function extraUberHours(
  diff: Cents,
  netPerHour: Cents | null,
  workDaysPerMonth: number | null,
): { perMonth: number; perDay: number | null } | null {
  if (diff >= 0 || !netPerHour || netPerHour <= 0) return null;
  const perMonth = -diff / netPerHour;
  return { perMonth, perDay: workDaysPerMonth ? perMonth / workDaysPerMonth : null };
}

/**
 * Data mais próxima viável com a renda atual: o mês em que tudo fica quitado pagando todos os
 * mínimos. `null` com motivo quando a renda não cobre os mínimos ou não quita em `maxMonths`.
 */
export function nearestViableDate(
  input: PlanInput,
  income: Cents,
  maxMonths = 120,
): { date: ISODate | null; reason: "ok" | "minimos" | "horizonte"; shortfallMonth: ISODate | null; simulation: SimulationResult } {
  const simulation = simulate(input, { maxMonths, incomeFor: () => income, stopWhenDone: true });
  if (simulation.firstShortfallMonth) {
    return { date: null, reason: "minimos", shortfallMonth: simulation.firstShortfallMonth, simulation };
  }
  if (!simulation.allPaidMonth) return { date: null, reason: "horizonte", shortfallMonth: null, simulation };
  return { date: endOfMonthISO(simulation.allPaidMonth), reason: "ok", shortfallMonth: null, simulation };
}
