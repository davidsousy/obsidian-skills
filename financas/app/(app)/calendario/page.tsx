import Link from "next/link";
import { DueRow, itemHref, MonthNav } from "@/components/dashboard";
import { Stat } from "@/components/ui";
import { loadFixedCosts } from "@/lib/costs-data";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { calendarWeeks, duesInMonth, type MonthDue } from "@/lib/finance/dashboard";
import { formatDateBR, monthFromParam, todayISO } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** pago (verde) · vencido sem pagamento (vermelho) · a vencer · custo fixo (cinza, o app não registra o pagamento). */
function tone(d: MonthDue, today: string): "pago" | "atraso" | "default" | "custo" {
  if (d.paid === null) return "custo";
  if (d.paid) return "pago";
  return d.dueDate < today ? "atraso" : "default";
}

const TONE_CLASS = {
  pago: "bg-quitado-bg text-quitado line-through decoration-1",
  atraso: "bg-atraso-bg text-atraso",
  default: "bg-parcelado-bg text-yellow-900",
  custo: "bg-slate-100 text-slate-700",
};

export default async function CalendarioPage({ searchParams }: PageProps<"/calendario">) {
  const { mes } = (await searchParams) as { mes?: string };
  const { supabase } = await requireHousehold();
  const today = todayISO();
  const month = monthFromParam(mes, today);
  const [debts, payments, fixedCosts] = await Promise.all([loadDebts(supabase), loadPayments(supabase), loadFixedCosts(supabase)]);
  const dues = duesInMonth(month, debts, payments, fixedCosts);
  const weeks = calendarWeeks(month, dues);
  const sum = (list: MonthDue[]) => list.reduce((s, d) => s + d.amountCents, 0);
  const debtDues = dues.filter((d) => d.source === "debt");
  const days = weeks.flat().filter((d) => d.inMonth && d.items.length > 0);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Calendário de vencimentos</h1>
          <p className="text-slate-500">Parcelas, juros dos agiotas e custos fixos com dia de vencimento. Clique para editar.</p>
        </div>
        <MonthNav path="/calendario" month={month} today={today} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vence no mês" value={formatBRL(sum(dues))} hint={`${dues.length} contas com dia marcado`} />
        <Stat label="Parcelas e juros" value={formatBRL(sum(debtDues))} tone="parcelado" />
        <Stat label="Custos fixos" value={formatBRL(sum(dues.filter((d) => d.source === "fixed_cost")))} hint="Só os que têm dia de vencimento" />
        <Stat label="Dívidas ainda a pagar" value={formatBRL(sum(debtDues.filter((d) => !d.paid)))} tone="atraso" />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(
          [
            ["default", "a vencer"],
            ["atraso", "vencida sem pagamento"],
            ["pago", "paga"],
            ["custo", "custo fixo"],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className={`rounded px-2 py-0.5 ${TONE_CLASS[key]}`}>
            {label}
          </span>
        ))}
      </div>

      {/* grade (telas médias e grandes) */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {week.map((day) => (
              <div key={day.date} className={`min-h-28 border-r border-slate-100 p-1.5 last:border-r-0 ${day.inMonth ? "" : "bg-slate-50/60"}`}>
                <p
                  className={`num mb-1 text-xs font-semibold ${
                    day.date === today ? "inline-block rounded-full bg-slate-900 px-1.5 text-white" : day.inMonth ? "text-slate-600" : "text-slate-300"
                  }`}
                >
                  {Number(day.date.slice(8))}
                </p>
                {day.inMonth && (
                  <ul className="space-y-1">
                    {day.items.map((d) => (
                      <li key={`${d.source}-${d.id}`}>
                        <Link
                          href={itemHref(d.source, d.id)}
                          title={`${d.name} · ${formatBRL(d.amountCents)}`}
                          className={`block rounded px-1.5 py-0.5 text-[11px] leading-tight hover:opacity-80 ${TONE_CLASS[tone(d, today)]}`}
                        >
                          <span className="block truncate font-medium">{d.name}</span>
                          <span className="num">{formatBRL(d.amountCents)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* lista (celular) */}
      <div className="space-y-4 md:hidden">
        {days.length === 0 && <p className="text-slate-500">Nada vence neste mês.</p>}
        {days.map((day) => (
          <section key={day.date} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-600">{formatDateBR(day.date)}</h2>
            <ul className="divide-y divide-slate-100">
              {day.items.map((d) => {
                const t = tone(d, today);
                return (
                  <DueRow
                    key={`${d.source}-${d.id}`}
                    href={itemHref(d.source, d.id)}
                    date={d.dueDate}
                    name={d.name}
                    detail={t === "pago" ? "paga" : t === "atraso" ? "vencida sem pagamento" : t === "custo" ? "custo fixo" : d.type === "juros" ? "juros do mês" : "parcela"}
                    amount={d.amountCents}
                    tone={t === "custo" ? "default" : t}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
