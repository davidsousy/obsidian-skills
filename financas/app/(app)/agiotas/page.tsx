import { DebtSection } from "@/components/debt-list";
import { Card, LinkButton, Stat } from "@/components/ui";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { loanInterest } from "@/lib/finance/dashboard";
import { debtGroup } from "@/lib/finance/debts";
import { formatBRL, formatPercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export default async function AgiotasPage() {
  const { supabase } = await requireHousehold();
  const [debts, payments] = await Promise.all([loadDebts(supabase), loadPayments(supabase)]);
  const items = debts.filter((d) => debtGroup(d) === "agiotas");
  const total = items.reduce((s, d) => s + d.currentBalanceCents, 0);
  const loans = loanInterest(debts, payments);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Agiotas</h1>
          <p className="text-slate-500">Juros sobre o principal todo mês. Clique em um para registrar pagamento ou editar.</p>
        </div>
        <LinkButton href="/dividas/nova">+ Nova dívida</LinkButton>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total com juros em aberto" value={formatBRL(total)} tone="juros" hint={`${items.length} agiotas`} />
        <Stat label="Juros por mês" value={formatBRL(loans.monthly)} tone="juros" hint={`${formatBRL(loans.monthly * 12)} por ano`} />
        <Stat label="Juros em aberto" value={formatBRL(loans.open)} hint="Lançados e ainda não pagos" />
        <Stat label="Já pagos só de juros" value={formatBRL(loans.paid)} hint="Não reduzem o principal" />
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-quitado">Nenhum agiota em aberto. 🎉</p>
        </Card>
      ) : (
        <>
          <DebtSection group="agiotas" items={items} total={total} />
          <Card title="Quanto cada um custa por mês">
            <ul className="divide-y divide-slate-100 text-sm">
              {loans.items.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <strong>{i.name}</strong>: {formatPercent(i.rate)} de {formatBRL(i.principalCents)}
                    {i.dueDay && <span className="text-slate-500"> · vence dia {i.dueDay}</span>}
                  </span>
                  <span className="num font-semibold text-juros">{formatBRL(i.monthlyCents)}/mês</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-500">
              O pagamento abate primeiro os juros em aberto; só o que passar disso reduz o principal (e os juros dos
              próximos meses).
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
