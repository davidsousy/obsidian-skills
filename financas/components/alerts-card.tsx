import Link from "next/link";
import type { DueItem, InterestAlert, OverdueItem } from "@/lib/finance/alerts";
import { diffDays, formatDateBR } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";

function when(today: string, date: string): string {
  const d = diffDays(today, date);
  return d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`;
}

export function AlertsCard({
  today,
  dues,
  overdue,
  interest,
}: {
  today: string;
  dues: DueItem[];
  overdue: OverdueItem[];
  interest: InterestAlert[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-700">Próximos vencimentos (7 dias)</h2>
        {dues.length === 0 ? (
          <p className="text-sm text-slate-500">Nada vence nos próximos 7 dias.</p>
        ) : (
          <ul className="num space-y-2 text-sm">
            {dues.map((d) => (
              <li key={`${d.source}-${d.id}-${d.dueDate}`} className="flex justify-between gap-3">
                <span>
                  {d.source === "debt" ? (
                    <Link href={`/dividas/${d.id}`} className="font-medium hover:underline">
                      {d.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.name}</span>
                  )}
                  <span className="block text-xs text-slate-500">
                    {formatDateBR(d.dueDate)} · {when(today, d.dueDate)}
                  </span>
                </span>
                <strong className="whitespace-nowrap">{formatBRL(d.amountCents)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-red-200 bg-atraso-bg p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-atraso">Em atraso ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-slate-600">Nada em atraso. 🎉</p>
        ) : (
          <ul className="num space-y-2 text-sm">
            {overdue.map((o) => (
              <li key={o.id} className="flex justify-between gap-3">
                <span>
                  <Link href={`/dividas/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <span className="block text-xs text-slate-600">{o.reason}</span>
                </span>
                <strong className="whitespace-nowrap text-atraso">{formatBRL(o.amountCents)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-orange-200 bg-juros-bg p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-juros">Juros maiores que o pago</h2>
        {interest.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhuma dívida com juros acima do que já foi pago.</p>
        ) : (
          <ul className="num space-y-2 text-sm">
            {interest.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <Link href={`/dividas/${i.id}`} className="font-medium hover:underline">
                  {i.name}
                </Link>
                <span className="whitespace-nowrap text-right text-xs">
                  juros <strong className="text-juros">{formatBRL(i.chargedCents)}</strong>
                  <br />
                  pago {formatBRL(i.paidCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
