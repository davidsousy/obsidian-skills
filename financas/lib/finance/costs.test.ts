import { describe, expect, it } from "vitest";
import {
  averageMonths,
  carMonthlyCost,
  compareWithAverage,
  fixedByCategory,
  fixedMonthlyTotal,
  fixedTotalForMonth,
  variableMonthlyEstimate,
  type VariableExpense,
} from "./costs";
import { seedFixedCosts } from "./seed-costs";

describe("custos fixos do seed", () => {
  it("total mensal = R$ 10.931", () => {
    expect(fixedMonthlyTotal(seedFixedCosts())).toBe(1093100);
  });

  it("em outubro não contam aluguel, condomínio, água, luz e terapia (já estão nas dívidas)", () => {
    const costs = seedFixedCosts();
    expect(fixedTotalForMonth(costs, "2026-10-25")).toBe(1093100 - (460000 + 45000 + 30000 + 18000 + 36000));
    expect(fixedTotalForMonth(costs, "2026-11-01")).toBe(1093100);
    expect(fixedTotalForMonth(costs, "2027-06-15")).toBe(1093100);
  });

  it("custo inativo não conta", () => {
    const costs = seedFixedCosts().map((c) => (c.name === "Netflix" ? { ...c, active: false } : c));
    expect(fixedMonthlyTotal(costs)).toBe(1093100 - 4900);
  });

  it("totais por categoria", () => {
    const cats = fixedByCategory(seedFixedCosts());
    expect(cats.get("moradia")).toBe(460000 + 45000 + 30000 + 18000);
    expect(cats.get("assinaturas")).toBe(12900 * 2 + 11000 + 9900 + 4900 + 2500);
    expect([...cats.values()].reduce((a, b) => a + b, 0)).toBe(1093100);
  });

  it("custo do carro (recarga + limpeza) = R$ 1.600/mês", () => {
    expect(carMonthlyCost(seedFixedCosts(), "2026-11-01")).toBe(160000);
  });
});

const exp = (spentOn: string, reais: number, category: VariableExpense["category"] = "alimentacao"): VariableExpense => ({
  id: spentOn + reais, spentOn, amountCents: reais * 100, category, description: null, spentBy: null,
});

describe("gastos variáveis", () => {
  it("sem histórico: usa a estimativa das configurações", () => {
    expect(variableMonthlyEstimate([], "2026-10-25", 80000)).toEqual({ cents: 80000, source: "estimativa", months: 0 });
    // só o mês corrente (incompleto) ainda não vale como média
    expect(variableMonthlyEstimate([exp("2026-10-03", 100)], "2026-10-25", 80000).source).toBe("estimativa");
  });

  it("com 1 mês completo: média = aquele mês", () => {
    const e = [exp("2026-10-03", 100), exp("2026-10-20", 50, "lazer"), exp("2026-11-02", 999)];
    expect(variableMonthlyEstimate(e, "2026-11-10", 80000)).toEqual({ cents: 15000, source: "media", months: 1 });
  });

  it("média dos últimos 3 meses completos, sem diluir antes do primeiro lançamento", () => {
    const e = [exp("2026-08-05", 300), exp("2026-09-05", 600), exp("2026-10-05", 900), exp("2026-11-05", 50)];
    expect(averageMonths(e, "2026-11-20")).toEqual(["2026-10-01", "2026-09-01", "2026-08-01"]);
    expect(variableMonthlyEstimate(e, "2026-11-20", 0).cents).toBe(60000);
    // em dez: média de set, out, nov
    expect(variableMonthlyEstimate(e, "2026-12-01", 0).cents).toBe(Math.round((60000 + 90000 + 5000) / 3));
  });

  it("mês sem lançamento depois do início conta como zero", () => {
    const e = [exp("2026-08-05", 300), exp("2026-10-05", 600)];
    expect(variableMonthlyEstimate(e, "2026-11-01", 0).cents).toBe(30000); // (300 + 0 + 600) / 3
  });

  it("compara o mês por categoria com a média", () => {
    const e = [
      exp("2026-09-02", 400), exp("2026-09-10", 100, "lazer"),
      exp("2026-10-02", 600), exp("2026-10-11", 300, "lazer"),
      exp("2026-11-03", 700), exp("2026-11-04", 80, "saude"),
    ];
    const r = compareWithAverage(e, "2026-11-15");
    expect(r.monthTotal).toBe(78000);
    expect(r.averageTotal).toBe(70000);
    expect(r.monthsInAverage).toBe(2);
    expect(r.rows).toEqual([
      { category: "alimentacao", monthCents: 70000, averageCents: 50000 },
      { category: "saude", monthCents: 8000, averageCents: 0 },
      { category: "lazer", monthCents: 0, averageCents: 20000 },
    ]);
  });
});
