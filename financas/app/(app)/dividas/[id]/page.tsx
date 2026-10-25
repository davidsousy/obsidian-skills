import Link from "next/link";
import { notFound } from "next/navigation";
import { groupStyle, RiskBadge, StatusBadge } from "@/components/debt-badges";
import { Button, Card, Field, FlashMessages, Input, LinkButton } from "@/components/ui";
import { NegotiationsSection } from "@/components/negotiations";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { loadNegotiations } from "@/lib/negotiations-data";
import { formatDateBR, formatMonthBR, todayISO } from "@/lib/finance/dates";
import { debtGroup, interestByMonth, KIND_LABEL, presentValue } from "@/lib/finance/debts";
import { formatAmount, formatBRL, formatPercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { deleteDebt, registerPayment, undoLastPayment } from "../actions";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="num font-medium">{children}</dd>
    </div>
  );
}

export default async function DividaPage({ params, searchParams }: PageProps<"/dividas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, members } = await requireHousehold();
  const [[debt], payments, neg] = await Promise.all([
    loadDebts(supabase, id),
    loadPayments(supabase, id),
    loadNegotiations(supabase, id),
  ]);
  if (!debt) notFound();

  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const group = debtGroup(debt);
  const isInstallment = debt.kind === "parcelada_sem_juros" || debt.kind === "parcelada_com_juros";
  const months = interestByMonth(debt);
  const openCharges = debt.charges.reduce((s, c) => s + c.amountCents - c.paidCents, 0);
  const suggested =
    debt.kind === "juros_sobre_principal" ? openCharges : isInstallment ? Math.min(debt.installmentCents ?? 0, debt.currentBalanceCents) : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/dividas" className="text-sm text-slate-500 hover:underline">
        ← Dívidas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{debt.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
            {KIND_LABEL[debt.kind]}
            {debt.creditor && <> · {debt.creditor}</>}
            <StatusBadge status={debt.status} />
            {debt.riskPriority && debt.status !== "quitada" && <RiskBadge />}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Saldo atual</p>
          <p className={`num text-4xl font-bold ${groupStyle[group].text}`}>{formatBRL(debt.currentBalanceCents)}</p>
        </div>
      </header>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      <Card>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Info label="Valor original">{formatBRL(debt.originalCents)}</Info>
          <Info label="Total pago">{formatBRL(debt.totalPaidCents)}</Info>
          {debt.dueDay && <Info label="Vencimento">Dia {debt.dueDay}</Info>}
          {isInstallment && (
            <>
              <Info label="Parcela">{formatBRL(debt.installmentCents ?? 0)}</Info>
              <Info label="Parcelas restantes">{debt.installmentsKnown ? debt.installmentsRemaining : "A informar"}</Info>
              {debt.kind === "parcelada_com_juros" && (
                <Info label="Juros">{debt.monthlyRate != null ? `${formatPercent(debt.monthlyRate)} a.m.` : "A informar"}</Info>
              )}
              {debt.kind === "parcelada_com_juros" && debt.monthlyRate && debt.installmentsRemaining ? (
                <Info label="Para quitar hoje (Price)">
                  {formatBRL(presentValue(debt.installmentCents ?? 0, debt.installmentsRemaining, debt.monthlyRate))}
                </Info>
              ) : null}
            </>
          )}
          {debt.kind === "juros_sobre_principal" && (
            <>
              <Info label="Principal">{formatBRL(debt.principalCents ?? 0)}</Info>
              <Info label="Taxa mensal">{formatPercent(debt.monthlyRate ?? 0)}</Info>
              <Info label="Juros do próximo mês">{formatBRL(Math.round((debt.principalCents ?? 0) * (debt.monthlyRate ?? 0)))}</Info>
              <Info label="Pago só de juros">
                <span className="text-juros">{formatBRL(debt.interestPaidCents)}</span>
              </Info>
            </>
          )}
          {debt.kind === "conta_em_atraso" && (
            <>
              <Info label="Valor em aberto">{formatBRL(debt.principalCents ?? 0)}</Info>
              {debt.originalDueDate && <Info label="Vencimento original">{formatDateBR(debt.originalDueDate)}</Info>}
              {debt.lateFeeRate != null && <Info label="Multa">{formatPercent(debt.lateFeeRate)}</Info>}
              {debt.lateInterestRate != null && <Info label="Juros ao mês">{formatPercent(debt.lateInterestRate)}</Info>}
              {openCharges > 0 && <Info label="Multa/juros em aberto">{formatBRL(openCharges)}</Info>}
            </>
          )}
        </dl>
        {debt.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{debt.notes}</p>}
        {isInstallment && !debt.installmentsKnown && (
          <p className="mt-4 rounded-lg bg-parcelado-bg p-3 text-sm text-yellow-800">
            Parcelas restantes não informadas: o total conta só a parcela do mês. Edite a dívida para informar.
          </p>
        )}
      </Card>

      {debt.status !== "quitada" && (
        <Card title="Registrar pagamento">
          <form action={registerPayment.bind(null, debt.id)} className="grid items-end gap-4 md:grid-cols-[1fr_1fr_2fr_auto]">
            <Field label="Data">
              <Input name="paid_on" type="date" defaultValue={todayISO()} required />
            </Field>
            <Field label="Valor (R$)">
              <Input
                name="amount"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={suggested ? formatAmount(suggested) : ""}
                required
              />
            </Field>
            <Field label="Observação">
              <Input name="notes" placeholder="opcional" />
            </Field>
            <Button type="submit">Registrar</Button>
          </form>
          {debt.kind === "juros_sobre_principal" && (
            <p className="mt-3 text-sm text-slate-500">
              O pagamento abate primeiro os juros em aberto ({formatBRL(openCharges)}); o que passar disso reduz o principal.
            </p>
          )}
        </Card>
      )}

      <Card title="Histórico de pagamentos">
        {payments.length === 0 ? (
          <p className="text-slate-500">Nenhum pagamento registrado.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="num w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Data</th>
                    <th className="py-2 text-right">Valor</th>
                    {!isInstallment && <th className="py-2 text-right">Juros/multa</th>}
                    <th className="py-2 text-right">{isInstallment ? "Parcelas" : "Principal"}</th>
                    <th className="py-2 pl-4">Lançado por</th>
                    <th className="py-2">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2">{formatDateBR(p.paidOn)}</td>
                      <td className="py-2 text-right font-semibold">{formatBRL(p.amountCents)}</td>
                      {!isInstallment && <td className="py-2 text-right text-juros">{formatBRL(p.interestCents)}</td>}
                      <td className="py-2 text-right">{isInstallment ? p.installmentsCovered : formatBRL(p.principalCents)}</td>
                      <td className="py-2 pl-4">{(p.createdBy && names.get(p.createdBy)) ?? "—"}</td>
                      <td className="py-2 text-slate-500">{p.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={undoLastPayment.bind(null, debt.id)} className="mt-3">
              <button className="text-sm text-slate-500 underline">Desfazer o último pagamento lançado</button>
            </form>
          </>
        )}
      </Card>

      {months.length > 0 && (
        <Card title="Juros e multas por mês">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Mês</th>
                <th className="py-2 text-right">Lançado</th>
                <th className="py-2 text-right">Pago</th>
                <th className="py-2 text-right">Em aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="py-2">{formatMonthBR(m.month)}</td>
                  <td className="py-2 text-right">{formatBRL(m.chargedCents)}</td>
                  <td className="py-2 text-right text-juros">{formatBRL(m.paidCents)}</td>
                  <td className="py-2 text-right">{formatBRL(m.chargedCents - m.paidCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NegotiationsSection
        debtId={debt.id}
        debtStatus={debt.status}
        dueDay={debt.dueDay}
        negotiations={neg.negotiations}
        revisions={neg.revisions}
        names={names}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <LinkButton href={`/dividas/${debt.id}/editar`} variant="secondary">
          Editar dívida
        </LinkButton>
        <form action={deleteDebt.bind(null, debt.id)} className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            <input type="checkbox" name="confirm" /> Confirmo excluir esta dívida e seu histórico
          </label>
          <button className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50">Excluir</button>
        </form>
      </div>
    </div>
  );
}
