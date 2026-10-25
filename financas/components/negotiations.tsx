import { Button, Card, Field, Input, Select } from "@/components/ui";
import { closeNegotiation, acceptProposal, addNegotiationEntry, openNegotiation } from "@/app/(app)/dividas/negociacao-actions";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { KIND_LABEL, type DebtKind } from "@/lib/finance/debts";
import { formatAmount, formatBRL, formatPercent } from "@/lib/finance/money";
import type { DebtRevision, EntryKind, Negotiation, NegotiationStatus } from "@/lib/negotiations-data";

const KIND_TEXT: Record<EntryKind, string> = {
  contato: "Contato",
  proposta_feita: "Proposta feita",
  proposta_recebida: "Proposta recebida",
};

const STATUS_STYLE: Record<NegotiationStatus, string> = {
  aberta: "bg-violet-50 text-violet-700 ring-violet-200",
  aceita: "bg-quitado-bg text-quitado ring-green-200",
  recusada: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatusPill({ status }: { status: NegotiationStatus }) {
  const label = { aberta: "Aberta", aceita: "Aceita", recusada: "Recusada" }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>{label}</span>;
}

export function NegotiationsSection({
  debtId,
  debtStatus,
  dueDay,
  negotiations,
  revisions,
  names,
}: {
  debtId: string;
  debtStatus: string;
  dueDay: number | null;
  negotiations: Negotiation[];
  revisions: DebtRevision[];
  names: Map<string, string>;
}) {
  const open = negotiations.find((n) => n.status === "aberta");
  return (
    <div id="negociacoes" className="space-y-4">
      <Card
        title={
          <span className="flex flex-wrap items-center justify-between gap-2">
            Negociações
            {!open && debtStatus !== "quitada" && (
              <form action={openNegotiation.bind(null, debtId)}>
                <Button variant="secondary" type="submit">
                  Abrir negociação
                </Button>
              </form>
            )}
          </span>
        }
      >
        {negotiations.length === 0 ? (
          <p className="text-slate-500">Nenhuma negociação registrada.</p>
        ) : (
          <div className="space-y-6">
            {negotiations.map((n) => (
              <div key={n.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
                  <span>
                    Aberta em {formatDateBR(n.openedOn)}
                    {n.closedOn && ` · encerrada em ${formatDateBR(n.closedOn)}`}
                  </span>
                  <StatusPill status={n.status} />
                </div>
                <ol className="divide-y divide-slate-100">
                  {n.entries.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Nenhum registro ainda.</li>}
                  {n.entries.map((e) => (
                    <li key={e.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="num text-slate-500">{formatDateBR(e.occurredOn)}</span>
                        <span className="font-semibold">{KIND_TEXT[e.kind]}</span>
                        {e.amountCents !== null && (
                          <span className="num font-semibold">
                            {formatBRL(e.amountCents)}
                            {e.installments && e.installments > 1
                              ? ` em ${e.installments}× de ${formatBRL(Math.ceil(e.amountCents / e.installments))}`
                              : e.kind !== "contato"
                                ? " à vista"
                                : ""}
                          </span>
                        )}
                        {e.kind !== "contato" && <StatusPill status={e.status} />}
                        <span className="text-xs text-slate-400">{e.createdBy ? names.get(e.createdBy) : ""}</span>
                      </div>
                      {e.conditions && <p className="mt-1 text-slate-600">{e.conditions}</p>}
                      {n.status === "aberta" && e.kind !== "contato" && e.status === "aberta" && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-semibold text-quitado">Aceitar esta proposta…</summary>
                          <form
                            action={acceptProposal.bind(null, debtId, e.id)}
                            className="mt-2 grid items-end gap-3 rounded-lg bg-quitado-bg p-3 sm:grid-cols-5"
                          >
                            <Field label="Valor acordado (R$)">
                              <Input name="amount" inputMode="decimal" defaultValue={formatAmount(e.amountCents ?? 0)} required />
                            </Field>
                            <Field label="Parcelas">
                              <Input name="installments" type="number" min={1} defaultValue={e.installments ?? 1} required />
                            </Field>
                            <Field label="Vence dia">
                              <Input name="due_day" type="number" min={1} max={31} defaultValue={dueDay ?? ""} />
                            </Field>
                            <Field label="Juros a.m. (%)" hint="Vazio = sem juros">
                              <Input name="monthly_rate" inputMode="decimal" />
                            </Field>
                            <Button type="submit">Aceitar</Button>
                          </form>
                          <p className="mt-1 text-xs text-slate-500">
                            A dívida vira parcelada no novo valor; juros/multas em aberto são substituídos pelo acordo. O histórico é mantido.
                          </p>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
                {n.status === "aberta" && (
                  <div className="border-t border-slate-200 p-4">
                    <form
                      action={addNegotiationEntry.bind(null, debtId, n.id)}
                      className="grid items-end gap-3 md:grid-cols-[9.5rem_11rem_8rem_6rem_1fr_auto]"
                    >
                      <Field label="Data">
                        <Input name="occurred_on" type="date" defaultValue={todayISO()} required />
                      </Field>
                      <Field label="Tipo">
                        <Select name="kind" defaultValue="proposta_recebida">
                          <option value="contato">Contato</option>
                          <option value="proposta_feita">Proposta feita</option>
                          <option value="proposta_recebida">Proposta recebida</option>
                        </Select>
                      </Field>
                      <Field label="Valor (R$)">
                        <Input name="amount" inputMode="decimal" placeholder="0,00" />
                      </Field>
                      <Field label="Parcelas">
                        <Input name="installments" type="number" min={1} placeholder="1" />
                      </Field>
                      <Field label="Condições / anotações">
                        <Input name="conditions" placeholder="ex.: sem juros, 1ª parcela dia 10" />
                      </Field>
                      <Button type="submit">Registrar</Button>
                    </form>
                    <form action={closeNegotiation.bind(null, debtId, n.id)} className="mt-3">
                      <button className="text-sm text-slate-500 underline">Encerrar sem acordo</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {revisions.length > 0 && (
        <Card title="Histórico de formatos">
          <ul className="space-y-2 text-sm">
            {revisions.map((r) => {
              const before = r.snapshot.debt;
              const balance =
                before.kind === "parcelada_sem_juros" || before.kind === "parcelada_com_juros"
                  ? Number(before.balance_cents)
                  : Number(before.principal_cents);
              return (
                <li key={r.id} className="rounded-lg bg-slate-50 p-3">
                  <span className="num text-slate-500">{formatDateBR(r.createdAt.slice(0, 10))}</span> · {r.reason}. Antes:{" "}
                  <strong>{KIND_LABEL[before.kind as DebtKind]}</strong>, saldo {formatBRL(balance)}
                  {before.monthly_rate ? `, ${formatPercent(Number(before.monthly_rate))} a.m.` : ""}.
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
