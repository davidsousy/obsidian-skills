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
export function PlanVerdict({ ctx, plan, compact = false }: { ctx: PlanContext; plan: PlanResult; compact?: boolean }) {
  const s = STYLE[plan.viability.status];
  const diff = plan.viability.diff;
  return (
    <section className={`rounded-xl border-2 p-5 ${s.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-600">Quanto preciso ganhar por mês</p>
          <p className="num text-4xl font-bold">{formatBRL(plan.required.monthly)}</p>
          <p className="text-sm text-slate-600">
            para quitar tudo até {formatDateBR(plan.target)} ({plan.required.months} {plan.required.months === 1 ? "mês" : "meses"})
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
          <p className="text-sm text-slate-600">{diff >= 0 ? "Folga por mês" : "Falta por mês"}</p>
          <p className={`num text-2xl font-bold ${s.text}`}>{formatBRL(Math.abs(diff))}</p>
          {diff >= 0 && plan.required.monthly > 0 && (
            <p className="text-xs text-slate-500">{h(plan.viability.margin * 100)}% acima do necessário</p>
          )}
        </div>
        <div>
          <p className="text-sm text-slate-600">Uber a mais</p>
          {diff >= 0 ? (
            <p className="text-2xl font-bold text-quitado">Não precisa</p>
          ) : plan.hours ? (
            <>
              <p className="num text-2xl font-bold">{h(plan.hours.perMonth)} h/mês</p>
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

      {!compact && plan.viability.status === "inviavel" && (
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
