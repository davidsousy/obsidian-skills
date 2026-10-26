import type { Metadata } from "next";
import { DueRow } from "@/components/dashboard";
import { DebtSection } from "@/components/debt-list";
import { Card, LinkButton, Stat } from "@/components/ui";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { overdueItems } from "@/lib/finance/alerts";
import { dueDateInMonth, todayISO } from "@/lib/finance/dates";
import { debtGroup } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export const metadata: Metadata = { title: "Em atraso" };

export default async function AtrasosPage() {
  const { supabase } = await requireHousehold();
  const today = todayISO();
  const [debts, payments] = await Promise.all([loadDebts(supabase), loadPayments(supabase)]);
  const items = debts.filter((d) => debtGroup(d) === "atraso").sort((a, b) => b.currentBalanceCents - a.currentBalanceCents);
  const sum = (list: typeof items) => list.reduce((s, d) => s + d.currentBalanceCents, 0);
  const risk = items.filter((d) => d.riskPriority);
  const negotiating = items.filter((d) => d.status === "em_negociacao");
  const refs = payments.map((p) => ({ debtId: p.debtId, paidOn: p.paidOn, amountCents: p.amountCents, interestCents: p.interestCents }));
  // parcelas e juros do mês que venceram sem pagamento (as dívidas continuam nos seus grupos)
  const late = overdueItems(debts, refs, today).filter((i) => !items.some((d) => d.id === i.id));

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Em atraso</h1>
          <p className="text-slate-500">Contas vencidas. Clique em uma para registrar pagamento ou editar.</p>
        </div>
        <LinkButton href="/dividas/nova?tipo=atraso">+ Nova dívida</LinkButton>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total em atraso" value={formatBRL(sum(items))} tone="atraso" hint={`${items.length} contas`} />
        <Stat label="Prioridade de risco" value={formatBRL(sum(risk))} hint={risk.map((d) => d.name).join(", ") || "nenhuma"} />
        <Stat label="Em negociação" value={formatBRL(sum(negotiating))} hint={`${negotiating.length} contas`} />
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-quitado">Nenhuma conta em atraso. 🎉</p>
        </Card>
      ) : (
        <DebtSection group="atraso" items={items} total={sum(items)} title="Dívidas em atraso" />
      )}

      {late.length > 0 && (
        <Card title="Parcelas e juros vencidos neste mês">
          <ul className="-mx-2 divide-y divide-slate-100">
            {late.map((i) => {
              const debt = debts.find((d) => d.id === i.id)!;
              return (
                <DueRow
                  key={i.id}
                  href={`/dividas/${i.id}`}
                  date={dueDateInMonth(today, debt.dueDay!)}
                  name={i.name}
                  detail={i.reason}
                  amount={i.amountCents}
                  tone="atraso"
                />
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
