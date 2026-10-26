import type { Metadata } from "next";
import { Button, Card, Field, FlashMessages, Input, Select } from "@/components/ui";
import { isInternalEmail } from "@/lib/auto-auth";
import { formatAmount } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { updateHousehold, updateMyPreferences } from "./actions";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const { household, me, user } = await requireHousehold();
  const internal = isInternalEmail(user.email);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold">Configurações</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      <Card title="Casa">
        <form action={updateHousehold} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome da casa">
            <Input name="name" defaultValue={household.name} required />
          </Field>
          <Field label="Rateio do custo do carro no Uber" hint="Recarga e limpeza divididas pelas horas ou pelos dias rodados">
            <Select name="car_cost_allocation" defaultValue={household.car_cost_allocation}>
              <option value="por_hora">Por hora rodada</option>
              <option value="por_dia">Por dia rodado</option>
            </Select>
          </Field>
          <Field label="Meta da reserva de emergência (R$)">
            <Input name="reserve_target" inputMode="decimal" defaultValue={formatAmount(household.reserve_target_cents)} required />
          </Field>
          <Field label="Reserva atual (R$)" hint="Quanto da reserva já está guardado">
            <Input name="reserve_balance" inputMode="decimal" defaultValue={formatAmount(household.reserve_balance_cents)} required />
          </Field>
          <Field label="Margem para “apertado” (%)" hint="Folga abaixo disso = apertado; abaixo de zero = inviável">
            <Input
              name="tight_margin_pct"
              inputMode="decimal"
              defaultValue={household.tight_margin_pct.toLocaleString("pt-BR")}
              required
            />
          </Field>
          <div />
          <Field label="Gastos variáveis estimados por mês (R$)" hint="Usado até existir 1 mês de lançamentos">
            <Input
              name="initial_variable"
              inputMode="decimal"
              defaultValue={formatAmount(household.initial_variable_monthly_cents)}
              required
            />
          </Field>
          <Field label="Renda mensal estimada (R$)" hint="Usada até existirem 30 dias de lançamentos de renda">
            <Input
              name="initial_income"
              inputMode="decimal"
              defaultValue={formatAmount(household.initial_income_monthly_cents)}
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit">Salvar configurações da casa</Button>
          </div>
        </form>
      </Card>

      <Card title={`Preferências de ${me.display_name}`}>
        <form action={updateMyPreferences} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Meu nome">
            <Input name="display_name" defaultValue={me.display_name} required />
          </Field>
          <Field label="Avisar quantos dias antes do vencimento">
            <Input name="alert_days_before" type="number" min={0} max={30} defaultValue={me.alert_days_before} required />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input name="email_alerts" type="checkbox" defaultChecked={me.email_alerts} className="size-4" />
            Receber alertas por e-mail{internal ? "" : ` (${user.email})`}
          </label>
          {internal && (
            <p className="text-xs text-slate-500 md:col-span-3">
              Os e-mails vão para os endereços da variável <code>ALERT_EMAILS</code> na Vercel (separados por vírgula).
            </p>
          )}
          <div className="md:col-span-3">
            <Button type="submit">Salvar preferências</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
