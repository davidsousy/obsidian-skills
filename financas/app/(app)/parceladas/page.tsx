import { DebtSection } from "@/components/debt-list";
import { Card, LinkButton, Stat } from "@/components/ui";
import { loadDebts } from "@/lib/debts-data";
import { isOpenEnded } from "@/lib/finance/dashboard";
import { debtGroup } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export default async function ParceladasPage() {
  const { supabase } = await requireHousehold();
  const debts = await loadDebts(supabase);
  const items = debts.filter((d) => debtGroup(d) === "parceladas");
  const total = items.reduce((s, d) => s + d.currentBalanceCents, 0);
  const monthly = items.reduce((s, d) => s + Math.min(d.installmentCents ?? 0, d.currentBalanceCents), 0);
  const openEnded = items.filter(isOpenEnded);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dívidas parceladas</h1>
          <p className="text-slate-500">Parcelas em dia. Clique em uma para registrar pagamento ou editar.</p>
        </div>
        <LinkButton href="/dividas/nova">+ Nova dívida</LinkButton>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total das parceladas" value={formatBRL(total)} tone="parcelado" hint={`${items.length} dívidas`} />
        <Stat label="Parcelas por mês" value={formatBRL(monthly)} hint="Soma das parcelas de um mês" />
        <Stat
          label={openEnded.length ? `Sem ${openEnded.length === 1 && /carro/i.test(openEnded[0].name) ? "o carro" : "as sem prazo"}` : "Total"}
          value={formatBRL(total - openEnded.reduce((s, d) => s + d.currentBalanceCents, 0))}
          hint={openEnded.length ? `${openEnded.map((d) => d.name).join(", ")}: nº de parcelas não informado` : undefined}
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-slate-600">Nenhuma dívida parcelada em aberto.</p>
        </Card>
      ) : (
        <DebtSection group="parceladas" items={items} total={total} title="Parceladas" />
      )}
    </div>
  );
}
