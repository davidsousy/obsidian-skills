-- Etapa 2: dívidas, juros mensais e pagamentos.
--
-- Modelo de saldo (o mesmo de lib/finance/debts.ts):
--   parceladas ............ balance_cents (começa em parcela × restantes; cada pagamento abate)
--                           parcelas restantes = ceil(saldo / parcela)
--                           sem nº de parcelas informado (carro): saldo = 1 parcela, pagamento não quita
--   agiota / conta atraso . principal_cents + juros/multas lançados e ainda não pagos
--
-- Pagamento em agiota/atraso: abate primeiro os juros/multas em aberto (do mais antigo ao mais novo),
-- o excedente reduz o principal. Os juros do mês M são lançados uma vez, sobre o principal do momento
-- do lançamento (início do ciclo); abatimento de principal no meio do mês só reduz o mês seguinte.

create type debt_kind as enum ('parcelada_sem_juros', 'parcelada_com_juros', 'juros_sobre_principal', 'conta_em_atraso');
create type debt_status as enum ('em_dia', 'em_atraso', 'em_negociacao', 'quitada');
create type charge_kind as enum ('juros', 'multa');

create table debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  creditor text,
  kind debt_kind not null,
  status debt_status not null default 'em_dia',
  original_cents bigint not null check (original_cents >= 0),
  due_day smallint check (due_day between 1 and 31),
  notes text,

  -- parceladas
  installment_cents bigint check (installment_cents > 0),
  installments_known boolean not null default true,
  balance_cents bigint check (balance_cents >= 0),

  -- juros (parcelada com juros e agiota: taxa mensal; 0.4 = 40%)
  monthly_rate numeric(7,4) check (monthly_rate >= 0),

  -- agiota e conta em atraso
  principal_cents bigint check (principal_cents >= 0),
  accrual_start_month date check (accrual_start_month = date_trunc('month', accrual_start_month)::date),

  -- conta em atraso
  original_due_date date,
  late_fee_rate numeric(7,4) check (late_fee_rate >= 0),       -- multa única
  late_interest_rate numeric(7,4) check (late_interest_rate >= 0), -- juros simples ao mês sobre o original

  risk_priority boolean not null default false,
  priority_override integer,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,

  constraint debt_fields_by_kind check (
    case kind
      when 'parcelada_sem_juros' then installment_cents is not null and balance_cents is not null
      when 'parcelada_com_juros' then installment_cents is not null and balance_cents is not null
      when 'juros_sobre_principal' then principal_cents is not null and monthly_rate is not null
                                        and accrual_start_month is not null and due_day is not null
      when 'conta_em_atraso' then principal_cents is not null
    end
  )
);
create index debts_household on debts (household_id);

create table debt_charges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  kind charge_kind not null,
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  base_cents bigint not null,
  rate numeric(7,4) not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0 and paid_cents <= amount_cents),
  created_at timestamptz not null default now(),
  unique (debt_id, kind, reference_month)
);
create index debt_charges_debt on debt_charges (debt_id);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  interest_cents bigint not null default 0,   -- parte que foi juros/multa
  principal_cents bigint not null default 0,  -- parte que abateu principal/saldo
  installments_covered integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index debt_payments_debt on debt_payments (debt_id, created_at);

-- Quanto de cada pagamento foi para cada juros/multa (permite desfazer o pagamento com exatidão).
create table debt_payment_allocations (
  payment_id uuid not null references debt_payments (id) on delete cascade,
  charge_id uuid not null references debt_charges (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  primary key (payment_id, charge_id)
);

-- RLS: só membros da casa
alter table debts enable row level security;
alter table debt_charges enable row level security;
alter table debt_payments enable row level security;
alter table debt_payment_allocations enable row level security;

create policy "membros" on debts for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
-- Juros, pagamentos e alocações: leitura direta; escrita só pelas funções abaixo (mantém saldos consistentes).
create policy "membros leem" on debt_charges for select using (is_household_member(household_id));
create policy "membros leem" on debt_payments for select using (is_household_member(household_id));
create policy "membros leem" on debt_payment_allocations for select using (is_household_member(household_id));

-- household_id e os campos de saldo não mudam por update direto (só pelas funções).
create function debts_guard() returns trigger
language plpgsql as $$
begin
  if new.household_id <> old.household_id then
    raise exception 'Não é permitido mover a dívida para outra casa.';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger debts_guard before update on debts for each row execute function debts_guard();

-- Data de hoje em São Paulo.
create function today_sp() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- 123456 → 'R$ 1.234,56' (para mensagens de erro).
create function fmt_brl(cents bigint) returns text
language sql immutable as $$
  select 'R$ ' || translate(to_char(cents / 100.0, 'FM999G999G999G990D00'), ',.', '.,')
$$;

-- Saldo atual de cada dívida (mesma regra de lib/finance/debts.ts).
create view debts_overview with (security_invoker = true) as
select
  d.*,
  coalesce(c.open_cents, 0) as open_charges_cents,
  case
    when d.kind in ('parcelada_sem_juros', 'parcelada_com_juros') then d.balance_cents
    else d.principal_cents + coalesce(c.open_cents, 0)
  end as current_balance_cents,
  case
    when d.kind in ('parcelada_sem_juros', 'parcelada_com_juros') and d.installments_known
      then ceil(d.balance_cents::numeric / d.installment_cents)::int
  end as installments_remaining,
  coalesce(p.interest_paid_cents, 0) as interest_paid_cents,
  coalesce(p.total_paid_cents, 0) as total_paid_cents
from debts d
left join lateral (
  select sum(amount_cents - paid_cents) as open_cents from debt_charges where debt_id = d.id
) c on true
left join lateral (
  select sum(interest_cents) as interest_paid_cents, sum(amount_cents) as total_paid_cents
  from debt_payments where debt_id = d.id
) p on true;

-- Lança os juros/multas devidos até o mês de p_today (idempotente). Retorna quantos lançou.
--   agiota: juros do mês = principal × taxa, a partir de accrual_start_month
--   conta em atraso com taxa: multa única no mês do vencimento original
--                             + juros simples ao mês sobre o valor original, a partir do mês seguinte
create function accrue_charges(p_today date default today_sp()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d debts;
  m date;
  cur_month date := date_trunc('month', p_today)::date;
  inserted integer := 0;
  n integer;
begin
  if p_today > today_sp() then
    raise exception 'Não é possível lançar juros de meses futuros.';
  end if;
  for d in
    select * from debts
    where status <> 'quitada' and household_id = current_household_id()
      and (kind = 'juros_sobre_principal'
           or (kind = 'conta_em_atraso' and original_due_date is not null
               and (late_fee_rate is not null or late_interest_rate is not null)))
    for update
  loop
    if d.kind = 'juros_sobre_principal' then
      if d.principal_cents = 0 then continue; end if;
      m := d.accrual_start_month;
      while m <= cur_month loop
        insert into debt_charges (household_id, debt_id, kind, reference_month, base_cents, rate, amount_cents)
        values (d.household_id, d.id, 'juros', m, d.principal_cents, d.monthly_rate,
                round(d.principal_cents * d.monthly_rate))
        on conflict do nothing;
        get diagnostics n = row_count;
        inserted := inserted + n;
        m := (m + interval '1 month')::date;
      end loop;
    else
      m := date_trunc('month', d.original_due_date)::date;
      if d.late_fee_rate is not null and d.late_fee_rate > 0 and m <= cur_month then
        insert into debt_charges (household_id, debt_id, kind, reference_month, base_cents, rate, amount_cents)
        values (d.household_id, d.id, 'multa', m, d.original_cents, d.late_fee_rate,
                round(d.original_cents * d.late_fee_rate))
        on conflict do nothing;
        get diagnostics n = row_count;
        inserted := inserted + n;
      end if;
      if d.late_interest_rate is not null and d.late_interest_rate > 0 then
        m := (m + interval '1 month')::date;
        while m <= cur_month loop
          insert into debt_charges (household_id, debt_id, kind, reference_month, base_cents, rate, amount_cents)
          values (d.household_id, d.id, 'juros', m, d.original_cents, d.late_interest_rate,
                  round(d.original_cents * d.late_interest_rate))
          on conflict do nothing;
          get diagnostics n = row_count;
          inserted := inserted + n;
          m := (m + interval '1 month')::date;
        end loop;
      end if;
    end if;
  end loop;
  return inserted;
end;
$$;

-- Registra um pagamento e atualiza saldo, parcelas e status numa transação.
create function register_payment(p_debt_id uuid, p_paid_on date, p_amount_cents bigint, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d debts;
  ch debt_charges;
  remaining bigint := p_amount_cents;
  to_interest bigint := 0;
  to_principal bigint := 0;
  covered integer := 0;
  take bigint;
  balance bigint;
  pay_id uuid;
  allocs jsonb := '[]';
  a jsonb;
begin
  select * into d from debts where id = p_debt_id for update;
  if d.id is null or not is_household_member(d.household_id) then
    raise exception 'Dívida não encontrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero.';
  end if;
  if d.status = 'quitada' then
    raise exception 'Esta dívida já está quitada.';
  end if;

  if d.kind in ('parcelada_sem_juros', 'parcelada_com_juros') then
    if not d.installments_known then
      -- nº de parcelas não informado: registra o pagamento, saldo continua sendo 1 parcela
      to_principal := p_amount_cents;
      covered := floor(p_amount_cents::numeric / d.installment_cents);
    else
      if p_amount_cents > d.balance_cents then
        raise exception 'O valor (%) é maior que o saldo da dívida (%).', fmt_brl(p_amount_cents), fmt_brl(d.balance_cents);
      end if;
      covered := ceil(d.balance_cents::numeric / d.installment_cents)
               - ceil((d.balance_cents - p_amount_cents)::numeric / d.installment_cents);
      to_principal := p_amount_cents;
      update debts set balance_cents = balance_cents - p_amount_cents,
                       status = case when balance_cents - p_amount_cents = 0 then 'quitada'::debt_status else status end
       where id = d.id;
    end if;
  else
    balance := d.principal_cents + coalesce((select sum(amount_cents - paid_cents) from debt_charges where debt_id = d.id), 0);
    if p_amount_cents > balance then
      raise exception 'O valor (%) é maior que o saldo da dívida (%).', fmt_brl(p_amount_cents), fmt_brl(balance);
    end if;
    for ch in
      select * from debt_charges where debt_id = d.id and paid_cents < amount_cents
      order by reference_month, kind desc  -- multa antes de juros no mesmo mês
      for update
    loop
      exit when remaining = 0;
      take := least(remaining, ch.amount_cents - ch.paid_cents);
      update debt_charges set paid_cents = paid_cents + take where id = ch.id;
      allocs := allocs || jsonb_build_object('charge_id', ch.id, 'amount', take);
      remaining := remaining - take;
      to_interest := to_interest + take;
    end loop;
    to_principal := remaining;
    update debts set principal_cents = principal_cents - to_principal,
                     status = case when balance - p_amount_cents = 0 then 'quitada'::debt_status else status end
     where id = d.id;
  end if;

  insert into debt_payments (household_id, debt_id, paid_on, amount_cents, interest_cents, principal_cents,
                             installments_covered, notes, created_by)
  values (d.household_id, d.id, p_paid_on, p_amount_cents, to_interest, to_principal, covered,
          nullif(trim(p_notes), ''), auth.uid())
  returning id into pay_id;

  for a in select * from jsonb_array_elements(allocs) loop
    insert into debt_payment_allocations (payment_id, charge_id, household_id, amount_cents)
    values (pay_id, (a->>'charge_id')::uuid, d.household_id, (a->>'amount')::bigint);
  end loop;

  return pay_id;
end;
$$;

-- Desfaz o pagamento mais recente de uma dívida (lançamento errado).
create function undo_last_payment(p_debt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d debts;
  p debt_payments;
  al debt_payment_allocations;
begin
  select * into d from debts where id = p_debt_id for update;
  if d.id is null or not is_household_member(d.household_id) then
    raise exception 'Dívida não encontrada.';
  end if;
  select * into p from debt_payments where debt_id = d.id order by created_at desc limit 1;
  if p.id is null then
    raise exception 'Não há pagamento para desfazer.';
  end if;

  for al in select * from debt_payment_allocations where payment_id = p.id loop
    update debt_charges set paid_cents = paid_cents - al.amount_cents where id = al.charge_id;
  end loop;

  if d.kind in ('parcelada_sem_juros', 'parcelada_com_juros') then
    if d.installments_known then
      update debts set balance_cents = balance_cents + p.principal_cents where id = d.id;
    end if;
  else
    update debts set principal_cents = principal_cents + p.principal_cents where id = d.id;
  end if;
  update debts set status = (case when kind = 'conta_em_atraso' then 'em_atraso' else 'em_dia' end)::debt_status
   where id = d.id and status = 'quitada';

  delete from debt_payments where id = p.id;
end;
$$;

-- Carrega as dívidas do seed (outubro/2026) na casa do usuário, se ela ainda não tiver dívidas.
create function load_seed_debts() returns integer
language plpgsql security invoker set search_path = public as $$
declare
  h uuid := current_household_id();
begin
  if h is null then
    raise exception 'Você não pertence a uma casa.';
  end if;
  if exists (select 1 from debts where household_id = h) then
    raise exception 'A casa já tem dívidas cadastradas.';
  end if;

  insert into debts (household_id, name, creditor, kind, status, original_cents, principal_cents,
                     original_due_date, due_day, risk_priority, notes)
  values
    (h, 'Aluguel do apto antigo (2 meses)', 'Proprietário do apto antigo', 'conta_em_atraso', 'em_negociacao', 600000, 600000, null, null, false, null),
    (h, 'Aluguel de outubro', 'Imobiliária', 'conta_em_atraso', 'em_atraso', 460000, 460000, '2026-10-05', 5, true, null),
    (h, 'Condomínio (2 × 450)', 'Condomínio', 'conta_em_atraso', 'em_atraso', 90000, 90000, null, 5, true, null),
    (h, 'Internet Vivo', 'Vivo', 'conta_em_atraso', 'em_negociacao', 79000, 79000, null, null, false, '2 × 185 + 420'),
    (h, 'Terapia', null, 'conta_em_atraso', 'em_atraso', 48000, 48000, null, null, false, null),
    (h, 'Água', null, 'conta_em_atraso', 'em_atraso', 28000, 28000, null, null, true, null),
    (h, 'Luz', null, 'conta_em_atraso', 'em_atraso', 22000, 22000, null, null, true, null);

  insert into debts (household_id, name, creditor, kind, status, original_cents, principal_cents, monthly_rate,
                     accrual_start_month, due_day)
  values
    (h, 'Agiota 1', null, 'juros_sobre_principal', 'em_dia', 300000, 300000, 0.40, '2026-10-01', 30),
    (h, 'Agiota 2', null, 'juros_sobre_principal', 'em_dia', 150000, 150000, 0.25, '2026-10-01', 30);

  insert into debts (household_id, name, creditor, kind, status, original_cents, installment_cents, balance_cents,
                     installments_known, monthly_rate, due_day, notes)
  values
    (h, 'Cartão do sogro (entrada do carro)', 'Sogro', 'parcelada_sem_juros', 'em_dia', 999900, 333300, 999900, true, null, 30, null),
    (h, 'Empréstimo do amigo', 'Amigo', 'parcelada_sem_juros', 'em_dia', 500000, 125000, 500000, true, null, 30, null),
    (h, 'Distrato Gabriel / Interage', 'Gabriel / Interage', 'parcelada_sem_juros', 'em_dia', 450000, 150000, 450000, true, null, 15, null),
    (h, 'Parcela do carro', null, 'parcelada_com_juros', 'em_dia', 350000, 350000, 350000, false, null, 5,
     'Saldo, parcelas restantes e juros a informar. Até lá conta só a parcela do mês.');

  perform accrue_charges();
  return 13;
end;
$$;

revoke execute on function register_payment(uuid, date, bigint, text), undo_last_payment(uuid),
  accrue_charges(date), load_seed_debts() from public, anon;
grant execute on function register_payment(uuid, date, bigint, text), undo_last_payment(uuid),
  accrue_charges(date), load_seed_debts() to authenticated;
