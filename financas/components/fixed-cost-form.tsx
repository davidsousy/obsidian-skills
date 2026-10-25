import { Button, Field, Input, Select } from "@/components/ui";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/finance/costs";
import { formatAmount } from "@/lib/finance/money";
import type { FixedCostRow } from "@/lib/costs-data";
import type { Member } from "@/lib/session";

export function FixedCostForm({
  action,
  members,
  cost,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: Member[];
  cost?: FixedCostRow;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-4">
      <Field label="Nome">
        <Input name="name" defaultValue={cost?.name} required />
      </Field>
      <Field label="Valor mensal (R$)">
        <Input name="amount" inputMode="decimal" defaultValue={cost ? formatAmount(cost.amountCents) : ""} required />
      </Field>
      <Field label="Categoria">
        <Select name="category" defaultValue={cost?.category ?? "moradia"}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsável">
        <Select name="owner" defaultValue={cost?.ownerUserId ?? "casa"}>
          <option value="casa">Casa</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Dia de vencimento" hint="Opcional">
        <Input name="due_day" type="number" min={1} max={31} defaultValue={cost?.dueDay ?? ""} />
      </Field>
      <Field label="Conta a partir de" hint="Opcional. Mês em que começa a valer">
        <Input name="starts_on" type="month" defaultValue={cost?.startsOn?.slice(0, 7) ?? ""} />
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_approximate" defaultChecked={cost?.isApproximate} className="size-4" />
          Valor aproximado
        </label>
        {cost && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inactive" defaultChecked={!cost.active} className="size-4" />
            Inativo (não conta mais)
          </label>
        )}
      </div>
      <Field label="Observação">
        <Input name="notes" defaultValue={cost?.notes ?? ""} />
      </Field>
      <div className="md:col-span-4">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
