import { describe, expect, it } from "vitest";
import { accrue, type Debt } from "./debts";
import { nearestViableDate, requiredSchedule, type PlanInput } from "./plan";
import { applyScenario, EMPTY_SCENARIO, hoursIncome, isEmptyScenario, negotiate } from "./scenario";
import { seedDebts } from "./seed";
import { seedFixedCosts } from "./seed-costs";

const TODAY = "2026-10-25";
const seedInput = (): PlanInput => ({
  today: TODAY,
  debts: seedDebts().map((d: Debt) => accrue(d, TODAY)),
  fixedCosts: seedFixedCosts(),
  variableMonthly: 0,
  reserveTarget: 100000,
  reserveBalance: 0,
});
const id = (input: PlanInput, name: string) => input.debts.find((d) => d.name === name)!.id;

describe("simulador", () => {
  it("cenário vazio não muda nada", () => {
    const i = seedInput();
    const r = applyScenario(i, 2500000, 2960, EMPTY_SCENARIO);
    expect(isEmptyScenario(EMPTY_SCENARIO)).toBe(true);
    expect(r.income).toBe(2500000);
    expect(r.input.debts).toHaveLength(i.debts.length);
  });

  it("não altera a entrada original (dados reais)", () => {
    const i = seedInput();
    const snapshot = JSON.stringify(i);
    applyScenario(i, 0, 2960, {
      ...EMPTY_SCENARIO,
      cutFixedCostIds: ["fixo-17"],
      payNowDebtIds: [id(i, "Luz")],
      negotiation: { debtId: id(i, "Aluguel do apto antigo (2 meses)"), amount: 300000, installments: 3 },
    });
    expect(JSON.stringify(i)).toBe(snapshot);
  });

  it("renda extra e horas a mais (ganho líquido por hora)", () => {
    expect(hoursIncome(20, 2960)).toBe(59200);
    expect(hoursIncome(20, null)).toBe(0);
    const r = applyScenario(seedInput(), 2000000, 2960, { ...EMPTY_SCENARIO, extraIncome: 100000, extraHours: 40 });
    expect(r.addedIncome).toBe(100000 + 118400);
    expect(r.income).toBe(2218400);
  });

  it("cortar custo fixo reduz a renda necessária no mesmo valor nos meses pesados", () => {
    const i = seedInput();
    const base = requiredSchedule(i, "2027-06-30")!;
    const netflix = i.fixedCosts.find((c) => c.name === "Netflix")!.id;
    const cut = requiredSchedule(applyScenario(i, 0, null, { ...EMPTY_SCENARIO, cutFixedCostIds: [netflix] }).input, "2027-06-30")!;
    expect(cut.peak).toBe(base.peak - 4900);
  });

  it("quitar o Agiota 1 agora tira R$ 4.200 da dívida e os juros dele do mínimo de novembro", () => {
    const i = seedInput();
    const r = applyScenario(i, 0, null, { ...EMPTY_SCENARIO, payNowDebtIds: [id(i, "Agiota 1")] });
    const s = requiredSchedule(r.input, "2027-06-30")!;
    expect(s.peak).toBe(2366400 - 240000); // sem os juros de out + nov do Agiota 1 (1.200 × 2)
  });

  it("negociação com desconto vira parcelada sem juros", () => {
    const i = seedInput();
    const antigo = i.debts.find((d) => d.name === "Aluguel do apto antigo (2 meses)")!;
    const n = negotiate(antigo, 300000, 3);
    expect(n).toMatchObject({ kind: "parcelada_sem_juros", installmentCents: 100000, balanceCents: 300000, charges: [] });
    const r = applyScenario(i, 0, null, { ...EMPTY_SCENARIO, negotiation: { debtId: antigo.id, amount: 300000, installments: 3 } });
    expect(r.discount).toBe(300000);
  });

  it("mais renda → quita antes e paga menos juros", () => {
    const i = seedInput();
    const base = nearestViableDate(i, 2500000);
    const more = nearestViableDate(applyScenario(i, 2500000, null, { ...EMPTY_SCENARIO, extraIncome: 300000 }).input, 2800000);
    expect(more.date! <= base.date!).toBe(true);
    expect(more.simulation.totalInterest).toBeLessThan(base.simulation.totalInterest);
  });
});
