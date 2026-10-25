import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { interestPaidThisMonth, loadDebts, loadPayments } from "@/lib/debts-data";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { debtTotals } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export default async function PainelPage() {
  const { supabase, household, members } = await requireHousehold();
  const [debts, payments] = await Promise.all([loadDebts(supabase), loadPayments(supabase)]);
  const totals = debtTotals(debts);
  const openInterest = debts
    .filter((d) => d.status !== "quitada")
    .reduce((s, d) => s + d.charges.reduce((x, c) => x + c.amountCents - c.paidCents, 0), 0);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Painel</h1>
        <p className="text-slate-500">Hoje é {formatDateBR(todayISO())}</p>
      </header>

      {members.length === 1 && (
        <Card title="Convide o(a) parceiro(a)">
          <p className="text-slate-700">
            Só você está na casa por enquanto. Código de convite:{" "}
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-lg">{household.invite_code}</code>
          </p>
        </Card>
      )}

      {debts.length === 0 ? (
        <Card title="Comece pelas dívidas">
          <p className="text-slate-600">
            Nenhuma dívida cadastrada.{" "}
            <Link href="/dividas" className="font-semibold underline">
              Ir para Dívidas
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total de dívidas" value={formatBRL(totals.total)} />
          <Stat label="Total em atraso" value={formatBRL(totals.overdue)} tone="atraso" />
          <Stat label="Juros pagos no mês" value={formatBRL(interestPaidThisMonth(payments))} tone="juros" />
          <Stat label="Juros do mês em aberto" value={formatBRL(openInterest)} tone="juros" hint="Agiotas e contas com multa" />
        </div>
      )}

      <Card title="Próximas etapas">
        <p className="text-slate-600">
          Renda do mês × necessária, próximos vencimentos, progresso até a data-alvo e o card “Quanto preciso ganhar”
          aparecem aqui conforme os módulos de custos, renda e plano forem liberados.
        </p>
      </Card>
    </div>
  );
}
