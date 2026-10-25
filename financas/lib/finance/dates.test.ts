import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  dueDateInMonth,
  formatDateBR,
  formatMonthBR,
  monthsBetween,
  parseDateBR,
  todayISO,
} from "./dates";

describe("datas", () => {
  it("usa o fuso de São Paulo para 'hoje'", () => {
    // 02:30 UTC de 26/10 ainda é 25/10 em São Paulo (UTC−3)
    expect(todayISO(new Date("2026-10-26T02:30:00Z"))).toBe("2026-10-25");
    expect(todayISO(new Date("2026-10-26T03:30:00Z"))).toBe("2026-10-26");
  });

  it("formata e lê dd/mm/aaaa", () => {
    expect(formatDateBR("2026-10-05")).toBe("05/10/2026");
    expect(parseDateBR("5/10/2026")).toBe("2026-10-05");
    expect(parseDateBR("31/02/2026")).toBeNull();
    expect(parseDateBR("2026-10-05")).toBeNull();
  });

  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-30", 4)).toBe("2027-02-28");
    expect(addMonths("2026-10-05", 14)).toBe("2027-12-05");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });

  it("conta dias e meses", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(diffDays("2026-10-25", "2026-11-01")).toBe(7);
    expect(monthsBetween("2026-10-25", "2027-03-01")).toBe(5);
  });

  it("vencimento no dia 30 vira o último dia em fevereiro", () => {
    expect(dueDateInMonth("2027-02-10", 30)).toBe("2027-02-28");
    expect(dueDateInMonth("2026-10-10", 30)).toBe("2026-10-30");
  });

  it("nome do mês", () => {
    expect(formatMonthBR("2026-10-01")).toBe("out/2026");
  });
});
