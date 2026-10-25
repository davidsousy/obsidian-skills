// Datas de calendário (sem hora) como strings ISO "aaaa-mm-dd", sempre no fuso de São Paulo.
// Evita os bugs clássicos de Date + fuso: toda conta é feita sobre ano/mês/dia.

export const TIME_ZONE = "America/Sao_Paulo";

export type ISODate = string; // "2026-10-25"

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data de hoje em São Paulo. */
export function todayISO(now: Date = new Date()): ISODate {
  return isoFormatter.format(now);
}

export function parseISO(date: ISODate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "2026-10-05" → "05/10/2026" */
export function formatDateBR(date: ISODate): string {
  const { y, m, d } = parseISO(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "05/10/2026" → "2026-10-05" (null se inválida). */
export function parseDateBR(input: string): ISODate | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return toISO(y, m, d);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 → 28/02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = parseISO(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Diferença em dias (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Primeiro dia do mês da data ("mês de referência"). */
export function monthStart(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, 1);
}

/** Quantos meses de calendário de `from` até `to` (out/2026 → mar/2027 = 5). */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/** Data de vencimento no mês de `ref` para um dia fixo (dia 30 em fevereiro → 28/29). */
export function dueDateInMonth(ref: ISODate, dueDay: number): ISODate {
  const { y, m } = parseISO(ref);
  return toISO(y, m, Math.min(dueDay, daysInMonth(y, m)));
}

const monthNames = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-10-01" → "out/2026" */
export function formatMonthBR(date: ISODate): string {
  const { y, m } = parseISO(date);
  return `${monthNames[m - 1]}/${y}`;
}

/** Último dia do mês da data. */
export function endOfMonthISO(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, daysInMonth(y, m));
}
