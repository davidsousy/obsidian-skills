import { Fragment } from "react";
import { PlanVerdict } from "@/components/plan-verdict";
import { Button, Card, Field, FlashMessages, Input } from "@/components/ui";
import { addMonths, endOfMonthISO, formatDateBR, formatMonthBR } from "@/lib/finance/dates";
import { debtBalance } from "@/lib/finance/debts";
import { formatBRL, formatPercent } from "@/lib/finance/money";
import { avalancheGroup, isPayable, planStart, priorityOrder } from "@/lib/finance/plan";
import { computePlan, loadPlanContext } from "@/lib/plan-data";
import { requireHousehold } from "@/lib/session";
import { moveDebt, resetOrder, setTargetDate } from "./actions";

const GROUP_NAME = ["Agiota", "Prioridade de risco", "Com juros/multa", "Sem juros"];

export default async function PlanoPage({ searchParams }: PageProps<"/plano">) {
  const { supabase, household } = await requireHousehold();
  const ctx = await loadPlanContext(supabase, household);
  const target = household.target_date;
  const plan = target ? computePlan(ctx, target, household.tight_margin_pct) : null;
  const payable = priorityOrder(ctx.debts.filter(isPayable));
  const manual = ctx.debts.some((d) => d.priorityOverride != null);
  const unknownInstallments = ctx.debts.filter((d) => d.status !== "quitada" && !isPayable(d));
  const minTarget = endOfMonthISO(planStart(ctx.today));
  const b = plan?.required.breakdown;

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-3xl font-bold">Plano</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      <Card title="Data-alvo: quando quero estar sem dívidas">
        <form action={setTargetDate} className="flex flex-wrap items-end gap-3">
          <Field label="Data">
            <Input name="target_date" type="date" min={minTarget} defaultValue={target ?? addMonths(minTarget, 8)} required />
          </Field>
          <Button type="submit">{target ? "Atualizar" : "Definir data-alvo"}</Button>
          <p className="text-sm text-slate-500">
            O plano começa em {formatMonthBR(planStart(ctx.today))}; o mês atual segue pelos lançamentos reais.
          </p>
        </form>
      </Card>

      {(ctx.realIncome.source === "estimativa" || ctx.variable.source === "estimativa" || unknownInstallments.length > 0) && (
        <div className="space-y-2 rounded-xl border border-yellow-300 bg-parcelado-bg p-4 text-sm text-yellow-900">
          <p className="font-semibold">Atenção às premissas</p>
          {ctx.realIncome.source === "estimativa" && (
            <p>• Renda real: usando a estimativa de {formatBRL(ctx.realIncome.cents)} das Configurações até haver 30 dias de lançamentos.</p>
          )}
          {ctx.variable.source === "estimativa" && (
            <p>• Gastos variáveis: usando a estimativa de {formatBRL(ctx.variable.cents)}/mês das Configurações até haver 1 mês completo.</p>
          )}
          {unknownInstallments.map((d) => (
            <p key={d.id}>
              • {d.name}: parcelas restantes não informadas. Entra como {formatBRL(d.installmentCents ?? 0)}/mês obrigatórios e não é
              quitada no plano.
            </p>
          ))}
        </div>
      )}

      {target && !plan && (
        <Card>
          <p className="text-atraso">A data-alvo precisa ser no fim de {formatMonthBR(planStart(ctx.today))} ou depois.</p>
        </Card>
      )}

      {plan && b && (
        <>
          <PlanVerdict ctx={ctx} plan={plan} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="De onde vem a renda necessária (média por mês)">
              <dl className="num space-y-2 text-sm">
                {[
                  ["Custos fixos", b.fixed],
                  ["Gastos variáveis (média)", b.variable],
                  ["Parcelas obrigatórias", b.installments],
                  ["Juros projetados", b.interest],
                  ["Extra para zerar as dívidas até a data", b.extra],
                  ["Reserva de emergência", b.reserve],
                  ["Sobra (meses em que sobra dinheiro)", b.slack],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between border-b border-slate-100 pb-2">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="font-semibold">{formatBRL(value as number)}</dd>
                  </div>
                ))}
                <div className="flex justify-between pt-1 text-base">
                  <dt className="font-semibold">Renda necessária</dt>
                  <dd className="font-bold">{formatBRL(plan.required.monthly)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                A renda necessária é um valor fixo por mês que paga todos os mínimos em todos os meses e quita tudo até a data. O mês
                mais pesado define o valor; veja a coluna “Mínimo do mês” no calendário.
              </p>
            </Card>
            <Card title="Resumo">
              <dl className="num space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-600">Tudo quitado em (com a renda necessária)</dt>
                  <dd className="font-semibold">
                    {plan.required.simulation.allPaidMonth ? formatMonthBR(plan.required.simulation.allPaidMonth) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-600">Total de juros pagos até o fim</dt>
                  <dd className="font-semibold text-juros">{formatBRL(plan.required.simulation.totalInterest)}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-600">Data mais próxima com a renda atual</dt>
                  <dd className="font-semibold">
                    {plan.nearest.date
                      ? formatDateBR(plan.nearest.date)
                      : plan.nearest.reason === "minimos"
                        ? "renda não cobre os mínimos"
                        : "mais de 10 anos"}
                  </dd>
                </div>
                {plan.nearest.date && (
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <dt className="text-slate-600">Juros pagos com a renda atual</dt>
                    <dd className="font-semibold text-juros">{formatBRL(plan.nearest.simulation.totalInterest)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-600">Reserva de emergência</dt>
                  <dd className="font-semibold">
                    {formatBRL(household.reserve_balance_cents)} de {formatBRL(household.reserve_target_cents)}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </>
      )}

      <section id="ordem" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-700">
            Ordem de quitação {manual ? <span className="text-sm font-normal text-slate-500">(manual)</span> : <span className="text-sm font-normal text-slate-500">(avalanche automática)</span>}
          </h2>
          {manual && (
            <form action={resetOrder}>
              <button className="text-sm text-slate-600 underline">Voltar para a ordem automática</button>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[820px] text-sm [&_td]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2">#</th>
                <th className="py-2">Dívida</th>
                <th className="py-2">Grupo</th>
                <th className="py-2 text-right">Saldo atual</th>
                <th className="py-2 text-right">Quitação (renda necessária)</th>
                <th className="py-2 text-right">Quitação (renda atual)</th>
                <th className="px-5 py-2 text-right">Mover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payable.map((d, i) => {
                const reqMonth = plan?.required.simulation.payoffMonth[d.id];
                const curMonth = plan?.nearest.simulation.payoffMonth[d.id];
                const rate = d.kind === "conta_em_atraso" ? d.lateInterestRate : d.monthlyRate;
                return (
                  <tr key={d.id}>
                    <td className="px-5 py-2 font-semibold">{i + 1}</td>
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2 text-slate-600">
                      {GROUP_NAME[avalancheGroup(d)]}
                      {rate ? ` · ${formatPercent(rate)} a.m.` : ""}
                    </td>
                    <td className="py-2 text-right">{formatBRL(debtBalance(d))}</td>
                    <td className="py-2 text-right">{reqMonth ? formatMonthBR(reqMonth) : "—"}</td>
                    <td className="py-2 text-right">{curMonth ? formatMonthBR(curMonth) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      <form action={moveDebt.bind(null, d.id, -1)} className="inline">
                        <button disabled={i === 0} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30" title="Subir">
                          ↑
                        </button>
                      </form>
                      <form action={moveDebt.bind(null, d.id, 1)} className="inline">
                        <button
                          disabled={i === payable.length - 1}
                          className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
                          title="Descer"
                        >
                          ↓
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {plan && (
        <Card title="Calendário mês a mês (com a renda necessária)">
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[900px] text-sm [&_td]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Mês</th>
                  <th className="py-2 text-right">Mínimo do mês</th>
                  <th className="py-2 text-right">Fixos + variáveis</th>
                  <th className="py-2 text-right">Parcelas</th>
                  <th className="py-2 text-right">Juros</th>
                  <th className="py-2 text-right">Extra</th>
                  <th className="py-2 text-right">Reserva</th>
                  <th className="py-2 text-right">Sobra</th>
                  <th className="py-2 text-right">Dívida restante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.required.simulation.months.map((m) => (
                  <Fragment key={m.month}>
                    <tr className={m.minimumRequired === plan.required.monthly ? "bg-parcelado-bg" : ""}>
                      <td className="py-2 font-medium">{formatMonthBR(m.month)}</td>
                      <td className="py-2 text-right font-semibold">{formatBRL(m.minimumRequired)}</td>
                      <td className="py-2 text-right">{formatBRL(m.fixed + m.variable)}</td>
                      <td className="py-2 text-right">{formatBRL(m.installments)}</td>
                      <td className="py-2 text-right text-juros">{formatBRL(m.interest)}</td>
                      <td className="py-2 text-right">{formatBRL(m.extra)}</td>
                      <td className="py-2 text-right">{formatBRL(m.reserve)}</td>
                      <td className="py-2 text-right text-slate-500">{formatBRL(m.leftover)}</td>
                      <td className="py-2 text-right font-semibold">{formatBRL(m.remainingDebt)}</td>
                    </tr>
                    {m.paidOff.length > 0 && (
                      <tr className="border-t-0">
                        <td colSpan={9} className="!whitespace-normal pb-2 text-xs text-quitado">
                          ✓ Quitadas em {formatMonthBR(m.month)}: {m.paidOff.join(", ")}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Linha amarela = mês que define a renda necessária (o mais pesado).</p>
        </Card>
      )}
    </div>
  );
}
