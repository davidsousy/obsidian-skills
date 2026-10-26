import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBars, CostLegend, daysLabel, DebtProgressBar, DueRow, itemHref } from "@/components/dashboard";
import { RiskBadge, StatusBadge } from "@/components/debt-badges";
import { Card, LinkButton, Stat } from "@/components/ui";
import { loadFixedCosts } from "@/lib/costs-data";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { interestOverPaid, overdueItems, upcomingDues } from "@/lib/finance/alerts";
import { fixedMonthlyTotal } from "@/lib/finance/costs";
import { costsByCategory, debtProgress, loanInterest } from "@/lib/finance/dashboard";
import { diffDays, dueDateInMonth, formatDateBR, todayISO } from "@/lib/finance/dates";
import { debtGroup, debtTotals } from "@/lib/finance/debts";
import { formatBRL, formatPercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const { supabase } = await requireHousehold();
  const today = todayISO();
  const [debts, payments, fixedCosts] = await Promise.all([loadDebts(supabase), loadPayments(supabase), loadFixedCosts(supabase)]);
  const refs = payments.map((p) => ({ debtId: p.debtId, paidOn: p.paidOn, amountCents: p.amountCents, interestCents: p.interestCents }));

  const totals = debtTotals(debts);
  const openDebts = debts.filter((d) => d.status !== "quitada");
  const overdue = debts.filter((d) => debtGroup(d) === "atraso").sort((a, b) => b.currentBalanceCents - a.currentBalanceCents);
  const loans = loanInterest(debts, payments);
  const activeCosts = fixedCosts.filter((c) => c.active);
  const categories = costsByCategory(fixedCosts);
  const progress = debtProgress(debts, payments);
  const interestAlerts = interestOverPaid(debts, refs);

  // vencimentos: parcelas/juros do mês que já venceram sem pagamento + os próximos 30 dias
  const late = overdueItems(debts, refs, today)
    .filter((i) => !overdue.some((d) => d.id === i.id))
    .map((i) => ({ ...i, dueDate: dueDateInMonth(today, debts.find((d) => d.id === i.id)!.dueDay!) }));
  const upcoming = upcomingDues(debts, refs, fixedCosts, today, 30);
  const soon = upcomingDues(debts, refs, fixedCosts, today, 45);
  const next = soon.filter((d) => d.dueDate === soon[0]?.dueDate);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Painel</h1>
          <p className="text-slate-500">Dívidas, custos e vencimentos. Clique em qualquer conta para editar.</p>
        </div>
        <LinkButton href="/resumo" variant="secondary">
          Resumo do mês
        </LinkButton>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total de dívidas" value={formatBRL(totals.total)} hint={`${openDebts.length} dívidas em aberto`} href="/composicao" />
        <Stat label="Em atraso" value={formatBRL(totals.overdue)} tone="atraso" hint={`${overdue.length} contas`} href="/atrasos" />
        <Stat
          label="Agiotas"
          value={formatBRL(totals.byGroup.agiotas)}
          tone="juros"
          hint={`juros de ${formatBRL(loans.monthly)} por mês`}
          href="/agiotas"
        />
        <Stat label="Custos fixos" value={formatBRL(fixedMonthlyTotal(fixedCosts))} hint={`${activeCosts.length} contas por mês`} href="/custos" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={
            <span className="flex flex-wrap items-center justify-between gap-2">
              Custos por categoria <CostLegend essential={categories.essential} cuttable={categories.cuttable} />
            </span>
          }
        >
          {categories.bars.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum custo fixo cadastrado.</p>
          ) : (
            <CategoryBars bars={categories.bars} />
          )}
        </Card>

        <Card title="Próximo vencimento">
          {next.length === 0 ? (
            <p className="text-sm text-slate-500">Nada vence nos próximos 45 dias.</p>
          ) : (
            <>
              <p className="num text-3xl font-bold">{formatBRL(next.reduce((s, d) => s + d.amountCents, 0))}</p>
              <p className="text-sm text-slate-600">
                {formatDateBR(next[0].dueDate)} · {daysLabel(today, next[0].dueDate)}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {next.map((d) => (
                  <li key={`${d.source}-${d.id}`}>
                    <Link href={itemHref(d.source, d.id)} className="flex justify-between gap-3 hover:underline">
                      <span className="truncate">{d.name}</span>
                      <span className="num shrink-0 font-medium">{formatBRL(d.amountCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/calendario" className="mt-4 inline-block text-sm font-semibold text-slate-900 underline">
            Ver calendário
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Vencimentos">
          {late.length + upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Nada vence nos próximos 30 dias.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {late.map((i) => (
                <DueRow key={`late-${i.id}`} href={`/dividas/${i.id}`} date={i.dueDate} name={i.name} detail={`${i.reason} · ${daysLabel(today, i.dueDate)}`} amount={i.amountCents} tone="atraso" />
              ))}
              {upcoming.map((d) => (
                <DueRow
                  key={`${d.source}-${d.id}-${d.dueDate}`}
                  href={itemHref(d.source, d.id)}
                  date={d.dueDate}
                  name={d.name}
                  detail={daysLabel(today, d.dueDate)}
                  amount={d.amountCents}
                  tone={diffDays(today, d.dueDate) <= 7 ? "breve" : "default"}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Dívidas em atraso">
          {overdue.length === 0 ? (
            <p className="text-sm text-quitado">Nenhuma conta em atraso. 🎉</p>
          ) : (
            <>
              <ul className="-mx-2 divide-y divide-slate-100">
                {overdue.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dividas/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                      <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                      {/* no celular o nome tem prioridade; as etiquetas aparecem na tela Em atraso */}
                      <span className="hidden sm:contents">
                        {d.riskPriority && <RiskBadge />}
                        {d.status === "em_negociacao" && <StatusBadge status={d.status} />}
                      </span>
                      <span className="num shrink-0 font-semibold text-atraso">{formatBRL(d.currentBalanceCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold">
                Total em atraso <span className="num text-atraso">{formatBRL(totals.overdue)}</span>
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Progresso das dívidas" className="lg:col-span-2">
          <DebtProgressBar progress={progress} />
        </Card>

        <Card title="Juros dos agiotas">
          {loans.items.length === 0 ? (
            <p className="text-sm text-quitado">Nenhum agiota em aberto. 🎉</p>
          ) : (
            <>
              <p className="num text-3xl font-bold text-juros">
                {formatBRL(loans.monthly)}
                <span className="text-base font-normal text-slate-500"> /mês</span>
              </p>
              <p className="text-sm text-slate-500">{formatBRL(loans.monthly * 12)} por ano se nada mudar</p>
              <ul className="mt-3 space-y-1 text-sm">
                {loans.items.map((i) => (
                  <li key={i.id}>
                    <Link href={`/dividas/${i.id}`} className="flex justify-between gap-3 hover:underline">
                      <span className="truncate">
                        {i.name} <span className="text-slate-500">· {formatPercent(i.rate)} de {formatBRL(i.principalCents)}</span>
                      </span>
                      <span className="num shrink-0 font-medium">{formatBRL(i.monthlyCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
                Em aberto: <strong className="num">{formatBRL(loans.open)}</strong> · já pagos só de juros:{" "}
                <strong className="num">{formatBRL(loans.paid)}</strong>
              </p>
              {interestAlerts.length > 0 && (
                <p className="mt-2 rounded-lg bg-juros-bg px-3 py-2 text-xs text-orange-800">
                  Juros lançados maiores que tudo o que foi pago em: {interestAlerts.map((a) => a.name).join(", ")}.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
