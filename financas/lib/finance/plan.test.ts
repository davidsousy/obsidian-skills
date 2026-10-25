import { describe, expect, it } from "vitest";
import type { FixedCost } from "./costs";
import { monthsBetween } from "./dates";
import { accrue, type Debt } from "./debts";
import {
  extraUberHours,
  monthsUntil,
  nearestViableDate,
  planStart,
  priorityOrder,
  requiredIncome,
  requiredSchedule,
  simulate,
  viability,
  type PlanDebt,
  type PlanInput,
} from "./plan";
import { seedDebts } from "./seed";
import { seedFixedCosts } from "./seed-costs";

const TODAY = "2026-10-25"; // plano começa em nov/2026

const agiota = (id: string, principal: number, rate: number, extra: Partial<PlanDebt> = {}): PlanDebt => ({
  id, name: id, kind: "juros_sobre_principal", status: "em_dia", originalCents: principal, principalCents: principal,
  monthlyRate: rate, accrualStartMonth: "2026-11-01", dueDay: 30, riskPriority: false, charges: [], ...extra,
});
const parcelada = (id: string, installment: number, n: number, extra: Partial<PlanDebt> = {}): PlanDebt => ({
  id, name: id, kind: "parcelada_sem_juros", status: "em_dia", originalCents: installment * n,
  installmentCents: installment, balanceCents: installment * n, installmentsKnown: true, dueDay: 10,
  riskPriority: false, charges: [], ...extra,
});
const conta = (id: string, cents: number, extra: Partial<PlanDebt> = {}): PlanDebt => ({
  id, name: id, kind: "conta_em_atraso", status: "em_atraso", originalCents: cents, principalCents: cents,
  dueDay: null, riskPriority: false, charges: [], ...extra,
});

function input(debts: PlanDebt[], extra: Partial<PlanInput> = {}): PlanInput {
  return { today: TODAY, debts, fixedCosts: [], variableMonthly: 0, reserveTarget: 0, reserveBalance: 0, ...extra };
}

describe("simulação", () => {
  it("começa no mês seguinte e conta os meses até a data-alvo", () => {
    expect(planStart(TODAY)).toBe("2026-11-01");
    expect(monthsUntil(TODAY, "2027-12-31")).toBe(14);
  });

  it("agiota: juros caem conforme o principal é abatido (conta à mão)", () => {
    // R$ 1.000 a 10%, renda R$ 600/mês
    // nov: juros 100, abate 500 → principal 500 · dez: juros 50, abate 500 → quitado, sobra 50
    const sim = simulate(input([agiota("a", 100000, 0.1)]), { maxMonths: 3, incomeFor: () => 60000 });
    expect(sim.months[0]).toMatchObject({ interest: 10000, extra: 50000, leftover: 0 });
    expect(sim.months[1]).toMatchObject({ interest: 5000, extra: 50000, leftover: 5000, paidOff: ["a"] });
    expect(sim.allPaidMonth).toBe("2026-12-01");
    expect(sim.totalInterest).toBe(15000);
  });

  it("reserva de emergência é montada antes do excedente ir para as dívidas", () => {
    const sim = simulate(input([conta("c", 100000)], { reserveTarget: 100000, reserveBalance: 30000 }), {
      maxMonths: 2,
      incomeFor: () => 50000,
    });
    expect(sim.months[0]).toMatchObject({ reserve: 50000, extra: 0 });
    expect(sim.months[1]).toMatchObject({ reserve: 20000, extra: 30000 });
  });

  it("paga os mínimos antes da reserva e registra falta quando a renda não cobre", () => {
    const fixed: FixedCost[] = [
      { id: "f", name: "Aluguel", amountCents: 100000, dueDay: 5, category: "moradia", ownerUserId: null, isApproximate: false, active: true, startsOn: null },
    ];
    const sim = simulate(input([parcelada("p", 50000, 3)], { fixedCosts: fixed, reserveTarget: 100000 }), {
      maxMonths: 1,
      incomeFor: () => 120000,
    });
    expect(sim.months[0]).toMatchObject({ minimumRequired: 150000, installments: 20000, shortfall: 30000, reserve: 0 });
    expect(sim.firstShortfallMonth).toBe("2026-11-01");
  });

  it("parcela sem nº informado (carro) é paga todo mês e não impede o 'tudo quitado'", () => {
    const carro = parcelada("carro", 350000, 1, { kind: "parcelada_com_juros", installmentsKnown: false });
    const sim = simulate(input([carro, conta("c", 10000)]), { maxMonths: 3, incomeFor: () => 400000 });
    expect(sim.months.map((m) => m.installments)).toEqual([350000, 350000, 350000]);
    expect(sim.allPaidMonth).toBe("2026-11-01");
    expect(sim.payoffMonth.carro).toBeNull();
  });
});

describe("ordem avalanche", () => {
  it("agiotas por taxa → prioridade de risco → com juros → sem juros (menor saldo primeiro)", () => {
    const debts = [
      conta("Terapia", 48000),
      conta("Água", 28000, { riskPriority: true }),
      agiota("Agiota 2", 150000, 0.25),
      conta("Conta com juros", 100000, { lateInterestRate: 0.01, originalDueDate: "2026-09-01" }),
      conta("Aluguel de outubro", 460000, { riskPriority: true }),
      parcelada("Sogro", 333300, 3),
      agiota("Agiota 1", 300000, 0.4),
      conta("Condomínio", 90000, { riskPriority: true }),
    ];
    expect(priorityOrder(debts).map((d) => d.name)).toEqual([
      "Agiota 1", "Agiota 2", "Aluguel de outubro", "Condomínio", "Água", "Conta com juros", "Terapia", "Sogro",
    ]);
  });

  it("ordem manual substitui a automática", () => {
    const debts = [agiota("A1", 1000, 0.4), conta("Terapia", 100, { priorityOverride: 1 }), conta("Luz", 100, { priorityOverride: 2 })];
    expect(priorityOrder(debts).map((d) => d.name)).toEqual(["Terapia", "Luz", "A1"]);
  });

  it("excedente vai para a dívida de maior taxa", () => {
    const sim = simulate(input([agiota("a25", 100000, 0.25), agiota("a40", 100000, 0.4)]), {
      maxMonths: 1,
      incomeFor: () => 120000,
    });
    // mínimos: 400 + 250 de juros; excedente 550 vai todo para o de 40%
    const extra = sim.months[0].payments.filter((p) => !p.minimum);
    expect(extra).toEqual([{ debtId: "a40", name: "a40", amount: 55000, interest: 0, minimum: false }]);
  });
});

describe("renda necessária", () => {
  it("parcelada sem juros: 3 × R$ 1.000 em 3 meses = R$ 1.000/mês; em 2 meses = R$ 1.500/mês", () => {
    const i = input([parcelada("p", 100000, 3)]);
    expect(requiredIncome(i, "2027-01-31")!.monthly).toBe(100000);
    expect(requiredIncome(i, "2026-12-31")!.monthly).toBe(150000);
  });

  it("agiota em 2 meses: ≈ R$ 576,19 (100 + x = 1,1 × (1000 − x))", () => {
    const i = input([agiota("a", 100000, 0.1)]);
    const r = requiredIncome(i, "2026-12-31")!;
    expect(r.monthly).toBeGreaterThanOrEqual(57619);
    expect(r.monthly).toBeLessThanOrEqual(57800);
    const fails = simulate(i, { maxMonths: 2, incomeFor: () => r.monthly - 200 });
    expect(fails.allPaidMonth).toBeNull();
  });

  it("decomposição soma a renda necessária", () => {
    const r = requiredIncome(input([agiota("a", 300000, 0.4), parcelada("p", 50000, 4)], { reserveTarget: 100000 }), "2027-06-30")!;
    const b = r.breakdown;
    expect(Math.abs(b.fixed + b.variable + b.installments + b.interest + b.extra + b.reserve + b.slack - r.monthly)).toBeLessThanOrEqual(10);
  });

  it("data-alvo antes do fim do 1º mês do plano: sem cálculo", () => {
    expect(requiredIncome(input([conta("c", 100)]), "2026-10-31")).toBeNull();
  });
});

describe("seed de outubro/2026", () => {
  const seedInput = (): PlanInput => ({
    today: TODAY,
    debts: seedDebts().map((d: Debt) => accrue(d, TODAY)),
    fixedCosts: seedFixedCosts(),
    variableMonthly: 0,
    reserveTarget: 100000,
    reserveBalance: 0,
  });

  it("novembro exige R$ 23.664 só de mínimos (fixos 10.931 + parcelas 9.583 + juros out+nov 3.150)", () => {
    const sim = simulate(seedInput(), { maxMonths: 1, incomeFor: () => 0 });
    expect(sim.months[0].minimumRequired).toBe(1093100 + (333300 + 125000 + 150000 + 350000) + 315000);
  });

  it("renda necessária para 30/06/2027 = R$ 23.664/mês (o mínimo de novembro) e tudo quitado até mar/2027", () => {
    const r = requiredIncome(seedInput(), "2027-06-30")!;
    expect(r.months).toBe(8);
    expect(r.monthly).toBe(2366400);
    expect(r.simulation.firstShortfallMonth).toBeNull();
    expect(r.simulation.allPaidMonth).toBe("2027-03-01");
  });

  it("com R$ 20.000/mês não cobre os mínimos de novembro; com R$ 25.000 quita em mar/2027", () => {
    expect(nearestViableDate(seedInput(), 2000000)).toMatchObject({ date: null, reason: "minimos", shortfallMonth: "2026-11-01" });
    expect(nearestViableDate(seedInput(), 2500000)).toMatchObject({ date: "2027-03-31", reason: "ok" });
  });
});

describe("viabilidade e horas de Uber", () => {
  it("viável / apertado / inviável com margem de 10%", () => {
    expect(viability(1100000, 1000000, 10).status).toBe("viavel");
    expect(viability(1099900, 1000000, 10).status).toBe("apertado");
    expect(viability(1000000, 1000000, 10).status).toBe("apertado");
    expect(viability(999900, 1000000, 10)).toMatchObject({ status: "inviavel", diff: -100 });
  });

  it("horas a mais = diferença ÷ ganho líquido por hora", () => {
    // faltam R$ 1.000/mês, líquido R$ 25/h, 20 dias rodados por mês → 40 h/mês, 2 h/dia
    expect(extraUberHours(-100000, 2500, 20)).toEqual({ perMonth: 40, perDay: 2 });
    expect(extraUberHours(5000, 2500, 20)).toBeNull();
    expect(extraUberHours(-100000, null, 20)).toBeNull();
  });
});

describe("renda necessária por fases", () => {
  const seedInput = (): PlanInput => ({
    today: TODAY,
    debts: seedDebts().map((d: Debt) => accrue(d, TODAY)),
    fixedCosts: seedFixedCosts(),
    variableMonthly: 0,
    reserveTarget: 100000,
    reserveBalance: 0,
  });

  it("cada mês recebe o maior entre o mínimo do mês e a renda-base", () => {
    const s = requiredSchedule(seedInput(), "2027-06-30")!;
    for (const m of s.simulation.months) expect(m.income).toBe(Math.max(m.minimumRequired, s.base));
    expect(s.simulation.firstShortfallMonth).toBeNull();
    expect(s.simulation.allPaidMonth! <= "2027-06-01").toBe(true);
    expect(s.peak).toBe(2366400); // novembro continua sendo o mês mais pesado
  });

  it("a renda-base é a menor possível (R$ 1 a menos não quita no prazo)", () => {
    const i = seedInput();
    const s = requiredSchedule(i, "2027-06-30")!;
    const fails = simulate(i, { maxMonths: 8, incomeFor: () => s.base - 100, floorToMinimum: true });
    expect(fails.allPaidMonth === null || fails.allPaidMonth > "2027-06-01").toBe(true);
  });

  it("data-alvo mais longe → renda-base menor; fases agrupam meses iguais", () => {
    const i = seedInput();
    const jun = requiredSchedule(i, "2027-06-30")!;
    const dez = requiredSchedule(i, "2027-12-31")!;
    expect(dez.base).toBeLessThan(jun.base);
    expect(jun.phases.at(-1)!.to).toBe("2027-06-01");
    expect(jun.phases.reduce((n, p) => n + monthsBetween(p.from, p.to) + 1, 0)).toBe(8);
  });

  it("caso simples: parcelada 3 × R$ 1.000 → todos os meses R$ 1.000 (mínimo), base menor", () => {
    const s = requiredSchedule(input([parcelada("p", 100000, 3)]), "2027-03-31")!;
    expect(s.months.slice(0, 3).map((m) => m.income)).toEqual([100000, 100000, 100000]);
    expect(s.peak).toBe(100000);
  });
});
