import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { coveredDays, dailyRates, incomeMonthlyAverage, uberRates, windowStats, type IncomeEntry, type UberDay } from "./income";

const CAR = 160000; // recarga 1.500 + limpeza 100 (seed)
const TODAY = "2026-10-30";

const day = (workedOn: string, reais: number, hours: number): UberDay => ({
  id: workedOn, workedOn, grossCents: reais * 100, hours,
});
const entry = (receivedOn: string, reais: number): IncomeEntry => ({
  id: receivedOn + reais, receivedOn, amountCents: reais * 100, source: "salario", description: null, earnerUserId: null,
});

/** 30 dias seguidos terminando em TODAY, rodando 20 de cada 30 dias, 8 h e R$ 280 por dia. */
function month(): UberDay[] {
  const out: UberDay[] = [];
  for (let i = 0; i < 30; i++) if (i % 3 !== 0) out.push(day(addDays(TODAY, -i), 280, 8));
  return out;
}

describe("ganho por hora do Uber", () => {
  it("rateio por hora: custo do carro ÷ horas do mês", () => {
    const r = uberRates(month(), TODAY, CAR, "por_hora")!;
    expect(r.days30).toBe(20);
    expect(r.hours30).toBe(160);
    expect(r.grossPerHour).toBe(3500); // R$ 35/h
    expect(r.carCostPerHour).toBe(1000); // 1.600 ÷ 160 h = R$ 10/h
    expect(r.netPerHour).toBe(2500); // R$ 25/h
  });

  it("rateio por dia: custo do carro ÷ dias rodados; mesmo resultado com dias iguais", () => {
    const r = uberRates(month(), TODAY, CAR, "por_dia")!;
    expect(r.carCostPerDay).toBe(8000); // 1.600 ÷ 20 dias = R$ 80/dia
    expect(r.carCostPerHour).toBe(1000);
    expect(r.netPerHour).toBe(2500);
  });

  it("por dia × por hora diferem quando os dias têm horas diferentes", () => {
    const days = [day("2026-10-01", 100, 2), day("2026-10-02", 500, 10)];
    const today = "2026-10-30";
    // histórico começa em 01/10 → 30 dias cobertos
    const h = uberRates(days, today, CAR, "por_hora")!;
    const d = uberRates(days, today, CAR, "por_dia")!;
    expect(h.carCostPerHour).toBe(Math.round(160000 / 12));
    expect(d.carCostPerDay).toBe(80000);
    expect(d.carCostPerHour).toBe(Math.round((80000 * 2) / 12));
    // no gráfico diário, o rateio por dia pesa mais no dia curto
    const daily = dailyRates(days, d);
    expect(daily[0]).toEqual({ date: "2026-10-01", gross: 5000, net: 5000 - 40000 });
  });

  it("menos de 30 dias de histórico: custo proporcional ao período lançado", () => {
    // 5 dias de histórico, 40 h → ~240 h/mês → custo/h ≈ R$ 6,67
    const days = [0, 1, 2, 3, 4].map((i) => day(addDays(TODAY, -i), 280, 8));
    const r = uberRates(days, TODAY, CAR, "por_hora")!;
    expect(r.monthlyHours).toBe(240);
    expect(r.carCostPerHour).toBe(667);
  });

  it("sem lançamentos: null", () => {
    expect(uberRates([], TODAY, CAR, "por_hora")).toBeNull();
    expect(uberRates([day("2026-01-01", 100, 5)], TODAY, CAR, "por_hora")).toBeNull(); // fora da janela
  });
});

describe("médias móveis", () => {
  it("janela de 30 dias completa", () => {
    const s = windowStats(month(), [entry("2026-10-05", 2500)], TODAY, 30);
    expect(s.covered).toBe(30);
    expect(s.partial).toBe(false);
    expect(s.uberCents).toBe(560000);
    expect(s.otherCents).toBe(250000);
    expect(s.totalMonthly).toBe(810000);
  });

  it("janela de 90 dias com só 30 dias de histórico é parcial e não dilui", () => {
    const s = windowStats(month(), [entry("2026-10-05", 2500)], TODAY, 90);
    expect(s.covered).toBe(30);
    expect(s.partial).toBe(true);
    expect(s.totalMonthly).toBe(810000);
  });

  it("90 dias completos: média mensal = total × 30 ÷ 90", () => {
    const entries = [entry("2026-08-05", 3000), entry("2026-09-05", 3000), entry("2026-10-05", 3000), entry("2026-08-02", 300)];
    const s = windowStats([], entries, TODAY, 90);
    expect(s.covered).toBe(90);
    expect(s.totalMonthly).toBe(Math.round((930000 * 30) / 90));
  });

  it("conta dias cobertos", () => {
    expect(coveredDays(null, TODAY, 30)).toBe(0);
    expect(coveredDays("2026-10-30", TODAY, 30)).toBe(1);
    expect(coveredDays("2026-01-01", TODAY, 90)).toBe(90);
  });
});

describe("renda média para o plano", () => {
  it("menos de 30 dias: usa a estimativa das configurações", () => {
    const r = incomeMonthlyAverage([day("2026-10-20", 300, 8)], [], TODAY, 900000);
    expect(r).toEqual({ cents: 900000, source: "estimativa", days: 11 });
  });

  it("30+ dias: média do período coberto", () => {
    const r = incomeMonthlyAverage(month(), [entry("2026-10-05", 2500)], TODAY, 900000);
    expect(r).toEqual({ cents: 810000, source: "parcial", days: 30 });
  });

  it("90 dias: média de 90 dias", () => {
    const r = incomeMonthlyAverage([], [entry("2026-08-02", 9000)], TODAY, 0);
    expect(r).toEqual({ cents: 300000, source: "media90", days: 90 });
  });
});
