import { STATUS_LABEL, type DebtGroup, type DebtStatus } from "@/lib/finance/debts";

const statusStyle: Record<DebtStatus, string> = {
  em_atraso: "bg-atraso-bg text-atraso ring-red-200",
  em_negociacao: "bg-violet-50 text-violet-700 ring-violet-200",
  em_dia: "bg-slate-100 text-slate-700 ring-slate-200",
  quitada: "bg-quitado-bg text-quitado ring-green-200",
};

export function StatusBadge({ status }: { status: DebtStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${statusStyle[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function RiskBadge() {
  return (
    <span
      title="Conta essencial: vai logo depois dos agiotas na ordem de quitação"
      className="inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
    >
      Prioridade de risco
    </span>
  );
}

export const groupStyle: Record<DebtGroup, { bar: string; text: string; bg: string }> = {
  atraso: { bar: "bg-atraso", text: "text-atraso", bg: "bg-atraso-bg" },
  agiotas: { bar: "bg-juros", text: "text-juros", bg: "bg-juros-bg" },
  parceladas: { bar: "bg-parcelado", text: "text-parcelado", bg: "bg-parcelado-bg" },
  quitadas: { bar: "bg-quitado", text: "text-quitado", bg: "bg-quitado-bg" },
};
