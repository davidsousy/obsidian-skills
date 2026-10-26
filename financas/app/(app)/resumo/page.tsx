import Link from "next/link";
import { DueRow, MonthNav } from "@/components/dashboard";
import { Card, LinkButton, Stat } from "@/components/ui";
import { loadFixedCosts, loadVariableExpenses } from "@/lib/costs-data";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { duesInMonth, monthSummary } from "@/lib/finance/dashboard";
import { formatDateBR, monthFromParam, monthStart, todayISO } from "@/lib/finance/dates";
import { loadIncome } from "@/lib/income-data";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export default async function ResumoPage({ searchParams }: PageProps<"/resumo">) {
  const { mes } = (await searchParams) as { mes?: string };
  const { supabase, members } = await requireHousehold();
  const today = todayISO();
  const month = monthFromParam(mes, today);
  const [debts, payments, fixedCosts, expenses, income] = await Promise.all([
    loadDebts(supabase),
    loadPayments(supabase),
    loadFixedCosts(supabase),
    loadVariableExpenses(supabase, month),
    loadIncome(supabase, month),
  ]);
  const summary = monthSummary(month, {
    debts,
    payments,
    fixedCosts,
    expenses,
    income: [
      ...income.uber.map((u) => ({ date: u.workedOn, amountCents: u.grossCents })),
      ...income.entries.map((e) => ({ date: e.receivedOn, amountCents: e.amountCents })),
    ],
  });
  const debtDues = duesInMonth(month, debts, payments, fixedCosts).filter((d) => d.source === "debt");
  const paidHere = payments.filter((p) => monthStart(p.paidOn) === month);
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const debtName = new Map(debts.map((d) => [d.id, d.name]));
  const paidPct = summary.debtDue > 0 ? Math.round(((summary.debtDue - summary.debtDueOpen) / summary.debtDue) * 100) : 0;

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Resumo do mês</h1>
          <p className="text-slate-500">O que entrou, o que saiu e o que ainda vence no mês.</p>
        </div>
        <MonthNav path="/resumo" month={month} today={today} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Renda recebida" value={formatBRL(summary.income)} tone="quitado" hint="Uber bruto + entradas" />
        <Stat label="Custos fixos" value={formatBRL(summary.fixedCosts)} hint="Previsto para o mês" />
        <Stat label="Gastos variáveis" value={formatBRL(summary.variable)} hint="Lançados no mês" />
        <Stat
          label="Dívidas pagas"
          value={formatBRL(summary.debtPaid)}
          tone="juros"
          hint={summary.interestPaid ? `${formatBRL(summary.interestPaid)} foram juros/multas` : "Pagamentos lançados no mês"}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{summary.balance >= 0 ? "Sobra do mês" : "Falta no mês"}</p>
            <p className={`num text-4xl font-bold ${summary.balance >= 0 ? "text-quitado" : "text-atraso"}`}>
              {formatBRL(Math.abs(summary.balance))}
            </p>
            <p className="num text-sm text-slate-500">
              {formatBRL(summary.income)} − {formatBRL(summary.fixedCosts)} − {formatBRL(summary.variable)} − {formatBRL(summary.debtPaid)}
            </p>
          </div>
          <LinkButton href="/composicao" variant="secondary">
            Composição da dívida total
          </LinkButton>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Parcelas e juros do mês">
          {debtDues.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma parcela ou juros com vencimento neste mês.</p>
          ) : (
            <>
              <p className="num text-sm text-slate-600">
                {formatBRL(summary.debtDue - summary.debtDueOpen)} pagos de {formatBRL(summary.debtDue)} · faltam{" "}
                <strong className="text-slate-900">{formatBRL(summary.debtDueOpen)}</strong>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-quitado" style={{ width: `${paidPct}%` }} />
              </div>
              <ul className="-mx-2 mt-3 divide-y divide-slate-100">
                {debtDues.map((d) => (
                  <DueRow
                    key={d.id}
                    href={`/dividas/${d.id}`}
                    date={d.dueDate}
                    name={d.name}
                    detail={d.paid ? "pago" : d.dueDate < today ? "vencido sem pagamento" : d.type === "juros" ? "juros do mês" : "parcela"}
                    amount={d.amountCents}
                    tone={d.paid ? "pago" : d.dueDate < today ? "atraso" : "default"}
                  />
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Pagamentos lançados no mês">
          {paidHere.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum pagamento lançado neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="num w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Data</th>
                    <th className="py-2">Dívida</th>
                    <th className="py-2 text-right">Valor</th>
                    <th className="py-2 text-right">Juros</th>
                    <th className="py-2 pl-3">Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paidHere.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2">{formatDateBR(p.paidOn).slice(0, 5)}</td>
                      <td className="py-2">
                        <Link href={`/dividas/${p.debtId}`} className="hover:underline">
                          {debtName.get(p.debtId) ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-semibold">{formatBRL(p.amountCents)}</td>
                      <td className="py-2 text-right text-juros">{formatBRL(p.interestCents)}</td>
                      <td className="py-2 pl-3">{(p.createdBy && names.get(p.createdBy)) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="text-xs text-slate-500">
        Custos fixos entram pelo valor previsto (o app não registra o pagamento deles). Renda e gastos variáveis vêm das telas{" "}
        <Link href="/renda" className="underline">
          Renda
        </Link>{" "}
        e{" "}
        <Link href="/custos?aba=variaveis" className="underline">
          Gastos variáveis
        </Link>
        .
      </p>
    </div>
  );
}
