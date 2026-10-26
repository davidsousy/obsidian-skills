import Link from "next/link";
import { groupStyle, RiskBadge, StatusBadge } from "@/components/debt-badges";
import type { DebtRow } from "@/lib/debts-data";
import { formatDateBR } from "@/lib/finance/dates";
import { GROUP_LABEL, type DebtGroup } from "@/lib/finance/debts";
import { formatBRL, formatPercent } from "@/lib/finance/money";

/** Tela de cada grupo de dívida (para voltar do detalhe). */
export const GROUP_PAGE: Record<DebtGroup, { href: string; label: string }> = {
  atraso: { href: "/atrasos", label: "Em atraso" },
  agiotas: { href: "/agiotas", label: "Agiotas" },
  parceladas: { href: "/parceladas", label: "Parceladas" },
  quitadas: { href: "/composicao", label: "Composição da dívida" },
};

export function debtDetail(d: DebtRow): string {
  switch (d.kind) {
    case "juros_sobre_principal":
      return `Principal ${formatBRL(d.principalCents ?? 0)} · ${formatPercent(d.monthlyRate ?? 0)} a.m.`;
    case "conta_em_atraso":
      return d.originalDueDate ? `Venceu em ${formatDateBR(d.originalDueDate)}` : "";
    default: {
      const parcela = formatBRL(d.installmentCents ?? 0);
      if (!d.installmentsKnown) return `${parcela}/mês · parcelas a informar`;
      const juros = d.kind === "parcelada_com_juros" && d.monthlyRate ? ` · ${formatPercent(d.monthlyRate)} a.m.` : "";
      return `${d.installmentsRemaining}× de ${parcela}${juros}`;
    }
  }
}

/** Bloco de um grupo de dívidas (cabeçalho com total e linhas clicáveis para pagar/editar). */
export function DebtSection({ group, items, total, title }: { group: DebtGroup; items: DebtRow[]; total?: number; title?: string }) {
  const style = groupStyle[group];
  return (
    <section id={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between border-b border-slate-200 px-5 py-3 ${style.bg}`}>
        <h2 className={`flex items-center gap-2 font-semibold ${style.text}`}>
          <span className={`size-2.5 rounded-full ${style.bar}`} />
          {title ?? GROUP_LABEL[group]} <span className="font-normal text-slate-500">({items.length})</span>
        </h2>
        {total !== undefined && <span className={`num text-lg font-bold ${style.text}`}>{formatBRL(total)}</span>}
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/dividas/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {d.name}
                  {d.creditor && <span className="ml-2 text-sm font-normal text-slate-500">{d.creditor}</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {[
                    debtDetail(d),
                    d.dueDay && `vence dia ${d.dueDay}`,
                    d.kind === "juros_sobre_principal" && d.interestPaidCents > 0 && `${formatBRL(d.interestPaidCents)} pagos só de juros`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {d.riskPriority && d.status !== "quitada" && <RiskBadge />}
                <StatusBadge status={d.status} />
              </div>
              <p className={`num w-36 text-right text-xl font-bold ${d.status === "quitada" ? "text-quitado" : ""}`}>
                {formatBRL(d.currentBalanceCents)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
