"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { DebtKind, DebtStatus } from "@/lib/finance/debts";

export type DebtFormValues = {
  name: string;
  creditor: string;
  kind: DebtKind;
  status: DebtStatus;
  dueDay: string;
  notes: string;
  riskPriority: boolean;
  original: string;
  installment: string;
  installmentsRemaining: string;
  installmentsUnknown: boolean;
  monthlyRate: string;
  principal: string;
  accrualStart: string;
  openAmount: string;
  originalDueDate: string;
  lateFeeRate: string;
  lateInterestRate: string;
};

export const EMPTY_DEBT: DebtFormValues = {
  name: "", creditor: "", kind: "parcelada_sem_juros", status: "em_dia", dueDay: "", notes: "", riskPriority: false,
  original: "", installment: "", installmentsRemaining: "", installmentsUnknown: false, monthlyRate: "", principal: "",
  accrualStart: "", openAmount: "", originalDueDate: "", lateFeeRate: "", lateInterestRate: "",
};

const KIND_OPTIONS: { value: DebtKind; label: string; help: string }[] = [
  { value: "parcelada_sem_juros", label: "Parcelada sem juros", help: "Saldo = parcela × parcelas restantes." },
  { value: "parcelada_com_juros", label: "Parcelada com juros", help: "Parcela, parcelas restantes e taxa mensal." },
  {
    value: "juros_sobre_principal",
    label: "Juros sobre principal (agiota)",
    help: "Juros do mês = principal × taxa. O pagamento abate primeiro os juros; o excedente reduz o principal.",
  },
  {
    value: "conta_em_atraso",
    label: "Conta em atraso",
    help: "Valor em aberto. Se informar multa/juros, o saldo é atualizado todo mês.",
  },
];

export function DebtForm({
  action,
  initial,
  submitLabel,
  isEdit = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: DebtFormValues;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const [kind, setKind] = useState<DebtKind>(initial.kind);
  const [unknown, setUnknown] = useState(initial.installmentsUnknown);
  const isInstallment = kind === "parcelada_sem_juros" || kind === "parcelada_com_juros";
  const help = KIND_OPTIONS.find((k) => k.value === kind)!.help;

  return (
    <form action={action} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Tipo" hint={help}>
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={initial.status}>
            <option value="em_dia">Em dia</option>
            <option value="em_atraso">Em atraso</option>
            <option value="em_negociacao">Em negociação</option>
            {isEdit && <option value="quitada">Quitada</option>}
          </Select>
        </Field>
        <Field label="Nome">
          <Input name="name" defaultValue={initial.name} required />
        </Field>
        <Field label="Credor">
          <Input name="creditor" defaultValue={initial.creditor} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-3">
        {isInstallment && (
          <>
            <Field label="Valor da parcela (R$)">
              <Input name="installment" inputMode="decimal" defaultValue={initial.installment} required />
            </Field>
            <Field label="Parcelas restantes" hint={isEdit ? "Recalcula o saldo: parcela × restantes" : undefined}>
              <Input
                name="installments_remaining"
                type="number"
                min={0}
                defaultValue={initial.installmentsRemaining}
                disabled={unknown}
                required={!unknown}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                name="installments_unknown"
                checked={unknown}
                onChange={(e) => setUnknown(e.target.checked)}
                className="size-4"
              />
              Ainda não sei quantas faltam
            </label>
            {kind === "parcelada_com_juros" && (
              <Field label="Taxa de juros mensal (%)" hint="Deixe em branco se ainda não souber">
                <Input name="monthly_rate" inputMode="decimal" defaultValue={initial.monthlyRate} />
              </Field>
            )}
          </>
        )}
        {kind === "juros_sobre_principal" && (
          <>
            <Field label="Principal atual (R$)">
              <Input name="principal" inputMode="decimal" defaultValue={initial.principal} required />
            </Field>
            <Field label="Taxa mensal (%)">
              <Input name="monthly_rate" inputMode="decimal" defaultValue={initial.monthlyRate} required />
            </Field>
            <Field label="Juros começam a contar em" hint="Mês do primeiro juros devido">
              <Input name="accrual_start" type="date" defaultValue={initial.accrualStart} />
            </Field>
          </>
        )}
        {kind === "conta_em_atraso" && (
          <>
            <Field label="Valor em aberto (R$)">
              <Input name="open_amount" inputMode="decimal" defaultValue={initial.openAmount} required />
            </Field>
            <Field label="Vencimento original">
              <Input name="original_due_date" type="date" defaultValue={initial.originalDueDate} />
            </Field>
            <div />
            <Field label="Multa (%)" hint="Opcional, cobrada uma vez">
              <Input name="late_fee_rate" inputMode="decimal" defaultValue={initial.lateFeeRate} />
            </Field>
            <Field label="Juros ao mês (%)" hint="Opcional, simples sobre o valor original">
              <Input name="late_interest_rate" inputMode="decimal" defaultValue={initial.lateInterestRate} />
            </Field>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Dia de vencimento" hint={kind === "juros_sobre_principal" ? "Obrigatório para agiota" : "Opcional"}>
          <Input name="due_day" type="number" min={1} max={31} defaultValue={initial.dueDay} required={kind === "juros_sobre_principal"} />
        </Field>
        <Field label="Valor original (R$)" hint="Se vazio, usa o saldo informado">
          <Input name="original" inputMode="decimal" defaultValue={initial.original} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="risk_priority" defaultChecked={initial.riskPriority} className="size-4" />
          Prioridade de risco (aluguel, condomínio, luz, água)
        </label>
      </div>

      <Field label="Observações">
        <textarea
          name="notes"
          defaultValue={initial.notes}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
