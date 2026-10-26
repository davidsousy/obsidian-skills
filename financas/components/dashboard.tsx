import Link from "next/link";
import type { CategoryBar, DebtProgress } from "@/lib/finance/dashboard";
import { addMonths, diffDays, formatDateBR, formatMonthLongBR, monthStart, type ISODate } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";

/** Link de edição de cada conta: dívida → detalhe (pagar/editar); custo fixo → formulário. */
export function itemHref(source: "debt" | "fixed_cost", id: string): string {
  return source === "debt" ? `/dividas/${id}` : `/custos/fixos/${id}`;
}

export function daysLabel(today: ISODate, date: ISODate): string {
  const n = diffDays(today, date);
  if (n < -1) return `venceu há ${-n} dias`;
  if (n === -1) return "venceu ontem";
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  return `em ${n} dias`;
}

export function CostLegend({ essential, cuttable }: { essential?: number; cuttable?: number }) {
  const item = (color: string, label: string, cents?: number) => (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${color}`} />
      {label}
      {cents !== undefined && <strong className="num font-semibold text-slate-700">{formatBRL(cents)}</strong>}
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-normal text-slate-500">
      {item("bg-slate-700", "Essencial", essential)}
      {item("bg-amber-400", "Dá para cortar", cuttable)}
    </span>
  );
}

/** Barras horizontais por categoria (escuro = essencial, âmbar = dá para cortar). */
export function CategoryBars({ bars }: { bars: CategoryBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.cents));
  return (
    <ul className="space-y-1.5">
      {bars.map((b) => (
        <li key={b.category}>
          <Link
            href={`/custos#${b.category}`}
            className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-slate-50"
          >
            <span className="truncate text-slate-700">{b.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-3 rounded-full ${b.essential ? "bg-slate-700" : "bg-amber-400"}`}
                style={{ width: `${Math.max(2, (b.cents / max) * 100)}%` }}
              />
            </span>
            <span className="num w-24 text-right font-semibold">{formatBRL(b.cents)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "X% já pago (sem o carro)" + barra Pago / Parcelado / Atrasos e agiotas. */
export function DebtProgressBar({ progress }: { progress: DebtProgress }) {
  const { paid, installments, overdueAndLoans, pct, excluded } = progress;
  const total = paid + installments + overdueAndLoans;
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const without =
    excluded.length === 0 ? "" : excluded.length === 1 && /carro/i.test(excluded[0]) ? " (sem o carro)" : ` (sem ${excluded.join(", ")})`;
  const parts = [
    { label: "Pago", value: paid, color: "bg-quitado" },
    { label: "Parcelado", value: installments, color: "bg-parcelado" },
    { label: "Atrasos e agiotas", value: overdueAndLoans, color: "bg-atraso" },
  ];
  return (
    <div>
      <p className="mb-3">
        <span className="num text-4xl font-bold">{pct}%</span> <span className="text-slate-600">já pago{without}</span>
      </p>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => (
          <span key={p.label} className={p.color} style={{ width: `${share(p.value)}%` }} title={`${p.label}: ${formatBRL(p.value)}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-slate-600">
            <span className={`size-2.5 rounded-sm ${p.color}`} />
            {p.label}
            <strong className="num font-semibold text-slate-900">{formatBRL(p.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Linha de uma conta com data, nome e valor, clicável para editar. */
export function DueRow({
  href,
  date,
  name,
  detail,
  amount,
  tone = "default",
}: {
  href: string;
  date: ISODate;
  name: string;
  detail?: string;
  amount: number;
  /** breve = vence em até 7 dias */
  tone?: "default" | "breve" | "atraso" | "pago";
}) {
  const chip = {
    default: "bg-slate-100 text-slate-700",
    breve: "bg-amber-100 text-amber-900",
    atraso: "bg-atraso-bg text-atraso",
    pago: "bg-quitado-bg text-quitado",
  }[tone];
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
        <span className={`num w-14 shrink-0 rounded-md py-1 text-center text-xs font-bold ${chip}`}>{formatDateBR(date).slice(0, 5)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          {detail && <span className="block text-xs text-slate-500">{detail}</span>}
        </span>
        <span className={`num shrink-0 font-semibold ${tone === "atraso" ? "text-atraso" : tone === "pago" ? "text-quitado" : ""}`}>
          {formatBRL(amount)}
        </span>
      </Link>
    </li>
  );
}

/** ‹ mês anterior · nome do mês · próximo mês › (parâmetro ?mes=aaaa-mm). */
export function MonthNav({ path, month, today }: { path: string; month: ISODate; today: ISODate }) {
  const link = (m: ISODate) => `${path}?mes=${m.slice(0, 7)}`;
  const arrow = "grid size-9 place-items-center rounded-lg border border-slate-300 bg-white text-lg hover:bg-slate-100";
  const label = formatMonthLongBR(month);
  return (
    <div className="flex items-center gap-2">
      <Link href={link(addMonths(month, -1))} className={arrow} aria-label="Mês anterior">
        ‹
      </Link>
      <span className="min-w-40 text-center font-semibold">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
      <Link href={link(addMonths(month, 1))} className={arrow} aria-label="Próximo mês">
        ›
      </Link>
      {month !== monthStart(today) && (
        <Link href={path} className="ml-1 text-sm font-semibold underline">
          Hoje
        </Link>
      )}
    </div>
  );
}
