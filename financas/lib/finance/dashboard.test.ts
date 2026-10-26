import { describe, expect, it } from "vitest";
import {
  calendarWeeks,
  costsByCategory,
  debtProgress,
  duesInMonth,
  goalProgress,
  loanInterest,
  monthSummary,
} from "./dashboard";
import { accrue, applyPayment, type Debt } from "./debts";
import { seedDebts } from "./seed";
import { seedFixedCosts } from "./seed-costs";

const TODAY = "2026-10-25";
const debts = (): Debt[] => seedDebts().map((d) => accrue(d, TODAY));
type Pay = { debtId: string; paidOn: string; amountCents: number; interestCents: number; principalCents: number };

/** Aplica um pagamento como o banco faz e devolve as dívidas atualizadas + o registro do pagamento. */
function pay(list: Debt[], name: string, reais: number, paidOn = TODAY): { debts: Debt[]; payment: Pay } {
  const d = list.find((x) => x.name === name)!;
  const r = applyPayment(d, reais * 100);
  return {
    debts: list.map((x) => (x.id === d.id ? r.debt : x)),
    payment: { debtId: d.id, paidOn, amountCents: reais * 100, interestCents: r.interestCents, principalCents: r.principalCents },
  };
}

describe("custos por categoria", () => {
  it("seed: R$ 8.990 essenciais e R$ 1.941 que dá para cortar (total R$ 10.931)", () => {
    const { bars, essential, cuttable } = costsByCategory(seedFixedCosts());
    expect(bars.map((b) => [b.label, b.cents, b.essential])).toEqual([
      ["Moradia", 553000, true],
      ["Carro", 160000, true],
      ["Alimentação", 150000, true],
      ["Pessoal", 132000, false],
      ["Assinaturas", 54100, false],
      ["Saúde", 36000, true],
      ["Lazer", 8000, false],
    ]);
    expect([essential, cuttable, essential + cuttable]).toEqual([899000, 194100, 1093100]);
  });

  it("custo inativo não entra", () => {
    const costs = seedFixedCosts().map((c) => (c.name === "Futebol" ? { ...c, active: false } : c));
    expect(costsByCategory(costs).bars.map((b) => b.label)).not.toContain("Lazer");
  });
});

describe("progresso das dívidas (sem o carro)", () => {
  it("seed: 0% pago; parceladas R$ 19.499 sem o carro; atrasos e agiotas R$ 19.345", () => {
    expect(debtProgress(debts(), [])).toEqual({
      paid: 0,
      installments: 1949900,
      overdueAndLoans: 1934500,
      pct: 0,
      excluded: ["Parcela do carro"],
    });
  });

  it("parcela paga entra como pago; pagamento do carro não conta", () => {
    const a = pay(debts(), "Empréstimo do amigo", 1250);
    const b = pay(a.debts, "Parcela do carro", 3500);
    const p = debtProgress(b.debts, [a.payment, b.payment]);
    expect([p.paid, p.installments]).toEqual([125000, 1824900]);
    expect(p.pct).toBe(3); // 1.250 ÷ 38.844
  });
});

describe("meta: zerar atrasos e agiotas", () => {
  it("seed: faltam R$ 19.345 (R$ 13.270 em atraso + R$ 6.075 dos agiotas com juros de outubro)", () => {
    expect(goalProgress(debts(), [])).toEqual({ remaining: 1934500, paid: 0, pct: 0, done: false });
  });

  it("quitar o Agiota 2 (juros R$ 375 + principal R$ 1.500) avança a meta só pelo principal", () => {
    const r = pay(debts(), "Agiota 2", 1875);
    expect(goalProgress(r.debts, [r.payment])).toEqual({ remaining: 1747000, paid: 150000, pct: 7, done: false });
  });

  it("parcelas em dia não entram na meta", () => {
    const r = pay(debts(), "Empréstimo do amigo", 1250);
    expect(goalProgress(r.debts, [r.payment]).paid).toBe(0);
  });
});

describe("juros dos agiotas", () => {
  it("seed: R$ 1.575 por mês (R$ 1.200 + R$ 375), todos em aberto", () => {
    const j = loanInterest(debts(), []);
    expect([j.monthly, j.open, j.paid]).toEqual([157500, 157500, 0]);
    expect(j.items.map((i) => [i.name, i.monthlyCents, i.dueDay])).toEqual([
      ["Agiota 1", 120000, 30],
      ["Agiota 2", 37500, 30],
    ]);
  });

  it("pagamento abate os juros em aberto e soma em juros pagos", () => {
    const r = pay(debts(), "Agiota 1", 1200);
    const j = loanInterest(r.debts, [r.payment]);
    expect([j.open, j.paid]).toEqual([37500, 120000]);
  });
});

describe("vencimentos do mês e calendário", () => {
  it("outubro: carro dia 5, distrato dia 15 e dia 30 (agiotas, sogro, amigo); aluguel só a partir de novembro", () => {
    const due = duesInMonth("2026-10-01", debts(), [], seedFixedCosts());
    expect(due.map((d) => [d.dueDate, d.name, d.amountCents, d.type])).toEqual([
      ["2026-10-05", "Parcela do carro", 350000, "parcela"],
      ["2026-10-15", "Distrato Gabriel / Interage", 150000, "parcela"],
      ["2026-10-30", "Agiota 1", 120000, "juros"],
      ["2026-10-30", "Agiota 2", 37500, "juros"],
      ["2026-10-30", "Cartão do sogro (entrada do carro)", 333300, "parcela"],
      ["2026-10-30", "Empréstimo do amigo", 125000, "parcela"],
    ]);
    const nov = duesInMonth("2026-11-01", debts(), [], seedFixedCosts());
    expect(nov.filter((d) => d.dueDate === "2026-11-05").map((d) => [d.name, d.paid])).toEqual([
      ["Aluguel", null],
      ["Condomínio", null],
      ["Parcela do carro", false],
    ]);
  });

  it("marca o que já foi pago no mês", () => {
    const a = pay(debts(), "Empréstimo do amigo", 1250, "2026-10-24");
    const b = pay(a.debts, "Agiota 2", 375, "2026-10-24");
    const due = duesInMonth("2026-10-01", b.debts, [a.payment, b.payment], []);
    expect(due.filter((d) => d.paid).map((d) => d.name)).toEqual(["Agiota 2", "Empréstimo do amigo"]);
  });

  it("calendário de outubro/2026: 5 semanas de 27/09 a 31/10, com 4 vencimentos no dia 30", () => {
    const weeks = calendarWeeks("2026-10-01", duesInMonth("2026-10-01", debts(), [], []));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toMatchObject({ date: "2026-09-27", inMonth: false });
    expect(weeks[4][6]).toMatchObject({ date: "2026-10-31", inMonth: true });
    expect(weeks.flat().find((d) => d.date === "2026-10-30")!.items).toHaveLength(4);
  });

  it("novembro/2026 começa num domingo; fevereiro/2027 termina num domingo", () => {
    expect(calendarWeeks("2026-11-01", []).map((w) => w[0].date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    const feb = calendarWeeks("2027-02-01", []);
    expect([feb[0][0].date, feb.at(-1)![0].date, feb.at(-1)![6].date]).toEqual(["2027-01-31", "2027-02-28", "2027-03-06"]);
  });
});

describe("resumo do mês", () => {
  it("outubro: renda − custos fixos do mês − variáveis − dívidas pagas", () => {
    const a = pay(debts(), "Empréstimo do amigo", 1250, "2026-10-24");
    const s = monthSummary("2026-10-15", {
      debts: a.debts,
      payments: [a.payment],
      fixedCosts: seedFixedCosts(),
      expenses: [{ spentOn: "2026-10-03", amountCents: 20000 }, { spentOn: "2026-09-29", amountCents: 99900 }],
      income: [{ date: "2026-10-10", amountCents: 500000 }, { date: "2026-09-30", amountCents: 100000 }],
    });
    expect(s).toEqual({
      month: "2026-10-01",
      income: 500000,
      fixedCosts: 504100, // R$ 10.931 − aluguel, condomínio, terapia, água e luz (contam a partir de novembro)
      variable: 20000,
      debtDue: 1115800,
      debtDueOpen: 990800,
      debtPaid: 125000,
      interestPaid: 0,
      balance: 500000 - 504100 - 20000 - 125000,
    });
  });
});
