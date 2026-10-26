import { formatDateBR, formatMonthBR } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import type { PlanContext, PlanResult } from "@/lib/plan-data";

const STYLE = {
  viavel: { label: "Viável", box: "border-green-300 bg-quitado-bg", badge: "bg-quitado text-white", text: "text-quitado" },
  apertado: { label: "Apertado", box: "border-yellow-300 bg-parcelado-bg", badge: "bg-parcelado text-white", text: "text-yellow-700" },
  inviavel: { label: "Inviável", box: "border-red-300 bg-atraso-bg", badge: "bg-atraso text-white", text: "text-atraso" },
} as const;

const h = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function incomeSourceLabel(ctx: PlanContext): string {
  const r = ctx.realIncome;
  if (r.source === "media90") return "média real dos últimos 90 dias";
  if (r.source === "parcial") return `média real dos ${r.days} dias com lançamentos`;
  return `estimativa das Configurações (só ${r.days} dias de lançamentos; a média real entra com 30)`;
}

/** Card "Quanto preciso ganhar": renda necessária × real, veredito, horas de Uber e data viável. */
export function PlanVerdict({ ctx, plan }: { ctx: PlanContext; plan: PlanResult }) {
  const s = STYLE[plan.viability.status];
  const diff = plan.viability.diff;
  return (
    <section className={`rounded-xl border-2 p-5 ${s.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-600">
            Quanto preciso ganhar para quitar tudo até {formatDateBR(plan.target)}
          </p>
          <ul className="mt-2 space-y-1">
            {plan.schedule.phases.map((p) => (
              <li key={p.from} className="flex flex-wrap items-baseline gap-x-3">
                <span className="num text-3xl font-bold">{formatBRL(p.income)}</span>
                <span className="text-sm text-slate-600">
                  /mês {p.from === p.to ? `em ${formatMonthBR(p.from)}` : `de ${formatMonthBR(p.from)} a ${formatMonthBR(p.to)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Os primeiros meses pesam mais por causa das parcelas e dos juros. Valor igual em todos os meses:{" "}
            {formatBRL(plan.required.monthly)}.
          </p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-lg font-bold ${s.badge}`}>{s.label}</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-slate-600">Renda média real</p>
          <p className="num text-2xl font-bold">{formatBRL(ctx.realIncome.cents)}</p>
          <p className="text-xs text-slate-500">{incomeSourceLabel(ctx)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">{diff >= 0 ? "Folga no mês mais pesado" : "Falta no mês mais pesado"}</p>
          <p className={`num text-2xl font-bold ${s.text}`}>{formatBRL(Math.abs(diff))}</p>
          {diff >= 0 ? (
            <p className="text-xs text-slate-500">{h(plan.viability.margin * 100)}% acima do necessário</p>
          ) : (
            <p className="text-xs text-slate-500">
              Falta em {plan.shortMonths.length} de {plan.schedule.months.length} meses
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-slate-600">Uber a mais</p>
          {diff >= 0 ? (
            <p className="text-2xl font-bold text-quitado">Não precisa</p>
          ) : plan.hours ? (
            <>
              <p className="num text-2xl font-bold">{h(plan.hours.perMonth)} h/mês</p>
              <p className="text-xs text-slate-500">nos meses mais pesados</p>
              <p className="text-xs text-slate-500">
                {plan.hours.perDay !== null && `≈ ${h(plan.hours.perDay)} h a mais por dia rodado · `}
                líquido de {formatBRL(ctx.rates!.netPerHour)}/h
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Lance dias do Uber para calcular o ganho líquido por hora.</p>
          )}
        </div>
      </div>

      {plan.viability.status === "inviavel" && (
        <p className="mt-4 rounded-lg bg-white/70 p-3 text-sm">
          {plan.nearest.reason === "ok" ? (
            <>
              Com a renda atual, a data mais próxima possível é <strong>{formatDateBR(plan.nearest.date!)}</strong>.
            </>
          ) : plan.nearest.reason === "minimos" ? (
            <>
              Com a renda atual não dá para pagar nem os mínimos (custos fixos, parcelas e juros) de{" "}
              <strong>{formatMonthBR(plan.nearest.shortfallMonth!)}</strong>, então não existe data viável sem aumentar a renda
              ou renegociar.
            </>
          ) : (
            <>Com a renda atual as dívidas não são quitadas em 10 anos.</>
          )}
        </p>
      )}
    </section>
  );
}
