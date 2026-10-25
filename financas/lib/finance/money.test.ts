import { describe, expect, it } from "vitest";
import { applyRate, formatBRL, formatPercent, parseBRL, parsePercent } from "./money";

describe("formatBRL", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(4234400)).toBe("R$ 42.344,00");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(-100000)).toBe("-R$ 1.000,00");
  });
});

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 1.234,56", 123456],
    ["3.333", 333300],
    ["1.500.000", 150000000],
    ["4600", 460000],
    ["0,5", 50],
    ["10,05", 1005],
    ["-25", -2500],
  ])("%s → %i centavos", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(["", "abc", "1,234,56", "12.34.56", "1,2345", "12.345,6.7"])("rejeita %s", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe("taxas", () => {
  it("aplica taxa arredondando ao centavo", () => {
    expect(applyRate(300000, 0.4)).toBe(120000); // agiota 1: R$ 1.200
    expect(applyRate(150000, 0.25)).toBe(37500); // agiota 2: R$ 375
    expect(applyRate(333, 0.5)).toBe(167); // 166,5 → 167
  });

  it("lê e formata percentuais", () => {
    expect(parsePercent("40")).toBe(0.4);
    expect(parsePercent("12,5%")).toBe(0.125);
    expect(parsePercent("x")).toBeNull();
    expect(formatPercent(0.4)).toBe("40%");
    expect(formatPercent(0.125)).toBe("12,5%");
  });
});
