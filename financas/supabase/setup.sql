-- Script único com todas as migrações, para colar no SQL Editor do Supabase (projeto novo, vazio).
-- Rode uma vez só. Gerado a partir de supabase/migrations/*.sql — não edite à mão.

-- ===== 20261025000001_households.sql =====
-- Etapa 1: casa (household), membros e RLS.
-- Todos os dados do sistema pertencem a uma casa; só membros da casa leem e escrevem.

create type car_cost_allocation as enum ('por_hora', 'por_dia');

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  target_date date,
  reserve_target_cents bigint not null default 100000 check (reserve_target_cents >= 0),
  reserve_balance_cents bigint not null default 0 check (reserve_balance_cents >= 0),
  tight_margin_pct numeric(5,2) not null default 10 check (tight_margin_pct >= 0),
  car_cost_allocation car_cost_allocation not null default 'por_hora',
  -- até haver histórico suficiente (perguntas 12 e 13 da proposta)
  initial_variable_monthly_cents bigint not null default 0 check (initial_variable_monthly_cents >= 0),
  initial_income_monthly_cents bigint not null default 0 check (initial_income_monthly_cents >= 0),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  email_alerts boolean not null default true,
  alert_days_before smallint not null default 3 check (alert_days_before between 0 and 30),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Um usuário pertence a no máximo uma casa (simplifica o app: a casa do usuário é única).
create unique index household_members_one_house_per_user on household_members (user_id);

-- Usada em todas as políticas. security definer evita recursão de RLS em household_members.
create function is_household_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members where household_id = h and user_id = auth.uid()
  );
$$;

-- Casa do usuário logado (ou null).
create function current_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid();
$$;

alter table households enable row level security;
alter table household_members enable row level security;

create policy "membros leem a casa" on households
  for select using (is_household_member(id));
create policy "membros alteram a casa" on households
  for update using (is_household_member(id)) with check (is_household_member(id));
-- Sem insert/delete direto: criação só via create_household().

create policy "membros veem os membros da casa" on household_members
  for select using (is_household_member(household_id));
-- Cada um edita só as próprias preferências (nome, alertas).
create policy "membro edita a si mesmo" on household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Sem insert direto: entrada só via create_household() / join_household().

-- O membro não pode trocar de casa via update.
create function household_members_lock_keys() returns trigger
language plpgsql as $$
begin
  if new.household_id <> old.household_id or new.user_id <> old.user_id then
    raise exception 'Não é permitido alterar a casa ou o usuário de um membro.';
  end if;
  return new;
end;
$$;
create trigger household_members_lock_keys before update on household_members
  for each row execute function household_members_lock_keys();

-- O invite_code só pode ser trocado por regenerate_invite_code().
create function households_lock_invite() returns trigger
language plpgsql as $$
begin
  if new.invite_code <> old.invite_code and current_setting('app.regenerating_invite', true) is distinct from 'on' then
    raise exception 'Use regenerate_invite_code() para trocar o código.';
  end if;
  return new;
end;
$$;
create trigger households_lock_invite before update on households
  for each row execute function households_lock_invite();

create function create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
begin
  if auth.uid() is null then
    raise exception 'Você precisa entrar na sua conta.';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Você já pertence a uma casa.';
  end if;
  insert into households (name, created_by) values (p_name, auth.uid()) returning id into h;
  insert into household_members (household_id, user_id, display_name) values (h, auth.uid(), p_display_name);
  return h;
end;
$$;

create function join_household(p_invite_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  h uuid;
begin
  if auth.uid() is null then
    raise exception 'Você precisa entrar na sua conta.';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Você já pertence a uma casa.';
  end if;
  select id into h from households where invite_code = upper(trim(p_invite_code));
  if h is null then
    raise exception 'Código de convite inválido.';
  end if;
  insert into household_members (household_id, user_id, display_name) values (h, auth.uid(), p_display_name);
  return h;
end;
$$;

create function regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  h uuid := current_household_id();
  code text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if h is null then
    raise exception 'Você não pertence a uma casa.';
  end if;
  perform set_config('app.regenerating_invite', 'on', true);
  update households set invite_code = code where id = h;
  return code;
end;
$$;

revoke execute on function create_household(text, text), join_household(text, text), regenerate_invite_code()
  from public, anon;
grant execute on function create_household(text, text), join_household(text, text), regenerate_invite_code()
  to authenticated;

-- ===== 20261025000002_debts.sql =====
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

-- ===== 20261025000003_costs.sql =====
-- Etapa 3: custos fixos mensais e gastos variáveis.

create type cost_category as enum ('moradia', 'alimentacao', 'carro', 'assinaturas', 'saude', 'pessoal', 'lazer', 'outros');

create table fixed_costs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  due_day smallint check (due_day between 1 and 31),
  category cost_category not null,
  owner_user_id uuid references auth.users (id) on delete set null, -- null = casa
  is_approximate boolean not null default false,
  active boolean not null default true,
  -- primeiro mês em que o custo conta (ex.: aluguel a partir de nov/2026; o de outubro é dívida)
  starts_on date check (starts_on = date_trunc('month', starts_on)::date),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index fixed_costs_household on fixed_costs (household_id);

create table variable_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  spent_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  category cost_category not null,
  description text,
  spent_by uuid references auth.users (id) on delete set null, -- null = casa
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index variable_expenses_household_date on variable_expenses (household_id, spent_on);

alter table fixed_costs enable row level security;
alter table variable_expenses enable row level security;

create policy "membros" on fixed_costs for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "membros" on variable_expenses for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Responsável / quem gastou (coluna passada como argumento) precisa ser membro da casa, ou null = casa.
create function check_member_ref() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ref uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if tg_op = 'UPDATE' and new.household_id <> old.household_id then
    raise exception 'Não é permitido mover o lançamento para outra casa.';
  end if;
  if ref is not null and not exists (
    select 1 from household_members where household_id = new.household_id and user_id = ref
  ) then
    raise exception 'A pessoa escolhida não é membro da casa.';
  end if;
  return new;
end;
$$;
create trigger fixed_costs_member_ref before insert or update on fixed_costs
  for each row execute function check_member_ref('owner_user_id');
create trigger variable_expenses_member_ref before insert or update on variable_expenses
  for each row execute function check_member_ref('spent_by');

-- Custos fixos do seed (outubro/2026). Total R$ 10.931,00.
-- Aluguel, condomínio, água, luz e terapia contam a partir de nov/2026 (os de outubro estão nas dívidas).
create function load_seed_fixed_costs() returns integer
language plpgsql security invoker set search_path = public as $$
declare
  h uuid := current_household_id();
  david uuid;
  paola uuid;
begin
  if h is null then
    raise exception 'Você não pertence a uma casa.';
  end if;
  if exists (select 1 from fixed_costs where household_id = h) then
    raise exception 'A casa já tem custos fixos cadastrados.';
  end if;
  select user_id into david from household_members where household_id = h and display_name ilike 'david%' limit 1;
  select user_id into paola from household_members where household_id = h and display_name ilike 'paola%' limit 1;

  insert into fixed_costs (household_id, name, amount_cents, due_day, category, owner_user_id, is_approximate, starts_on)
  values
    (h, 'Aluguel',            460000, 5,    'moradia',     null,  false, '2026-11-01'),
    (h, 'Condomínio',          45000, 5,    'moradia',     null,  false, '2026-11-01'),
    (h, 'Alimentação',        150000, null, 'alimentacao', null,  true,  null),
    (h, 'Recarga do carro',   150000, null, 'carro',       david, true,  null),
    (h, 'Uber da Paola',      110000, null, 'pessoal',     paola, false, null),
    (h, 'Terapia',             36000, null, 'saude',       null,  false, '2026-11-01'),
    (h, 'Água',                30000, null, 'moradia',     null,  true,  '2026-11-01'),
    (h, 'Cílios da Paola',     22000, null, 'pessoal',     paola, false, null),
    (h, 'Luz',                 18000, null, 'moradia',     null,  true,  '2026-11-01'),
    (h, 'Claude Code David',   12900, null, 'assinaturas', david, false, null),
    (h, 'Claude Code Paola',   12900, null, 'assinaturas', paola, false, null),
    (h, 'Internet da Paola',   11000, null, 'assinaturas', paola, false, null),
    (h, 'Limpeza do carro',    10000, null, 'carro',       david, true,  null),
    (h, 'Gemini',               9900, null, 'assinaturas', null,  false, null),
    (h, 'Futebol',              8000, null, 'lazer',       null,  false, null),
    (h, 'Netflix',              4900, null, 'assinaturas', null,  false, null),
    (h, 'Spotify',              2500, null, 'assinaturas', null,  false, null);

  update fixed_costs set notes = '22 × R$ 50' where household_id = h and name = 'Uber da Paola';
  return 17;
end;
$$;

revoke execute on function load_seed_fixed_costs() from public, anon;
grant execute on function load_seed_fixed_costs() to authenticated;

-- ===== 20261025000004_income.sql =====
-- Etapa 4: renda — Uber do David (diário) e entradas da Paola (salário e outras).

create type income_source as enum ('salario', 'outros');

create table uber_days (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  worked_on date not null,
  gross_cents bigint not null check (gross_cents >= 0), -- valor que o app repassa no dia
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, worked_on)
);

create table income_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  received_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  source income_source not null default 'salario',
  description text,
  earner_user_id uuid references auth.users (id) on delete set null, -- quem recebeu (null = casa)
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index income_entries_household_date on income_entries (household_id, received_on);

alter table uber_days enable row level security;
alter table income_entries enable row level security;

create policy "membros" on uber_days for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "membros" on income_entries for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- impede mover de casa (uber_days) e valida quem recebeu (income_entries)
create function lock_household() returns trigger
language plpgsql as $$
begin
  if new.household_id <> old.household_id then
    raise exception 'Não é permitido mover o lançamento para outra casa.';
  end if;
  return new;
end;
$$;
create trigger uber_days_lock before update on uber_days for each row execute function lock_household();
create trigger income_entries_member_ref before insert or update on income_entries
  for each row execute function check_member_ref('earner_user_id');

-- ===== 20261025000005_negotiations.sql =====
-- Etapa 7: negociações (histórico de contatos e propostas) e conversão da dívida ao aceitar.

create type negotiation_status as enum ('aberta', 'aceita', 'recusada');
create type negotiation_entry_kind as enum ('contato', 'proposta_feita', 'proposta_recebida');

create table negotiations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  status negotiation_status not null default 'aberta',
  opened_on date not null default today_sp(),
  closed_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index negotiations_debt on negotiations (debt_id);
-- no máximo uma negociação aberta por dívida
create unique index negotiations_one_open on negotiations (debt_id) where status = 'aberta';

create table negotiation_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  negotiation_id uuid not null references negotiations (id) on delete cascade,
  occurred_on date not null,
  kind negotiation_entry_kind not null,
  amount_cents bigint check (amount_cents >= 0),
  installments integer check (installments between 1 and 600),
  conditions text,
  status negotiation_status not null default 'aberta',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index negotiation_entries_negotiation on negotiation_entries (negotiation_id, occurred_on);

-- Foto da dívida antes de cada mudança de formato (mantém o histórico).
create table debt_revisions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  reason text not null,
  snapshot jsonb not null, -- dívida + juros/multas antes da mudança
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index debt_revisions_debt on debt_revisions (debt_id, created_at);

alter table negotiations enable row level security;
alter table negotiation_entries enable row level security;
alter table debt_revisions enable row level security;

create policy "membros" on negotiations for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "membros" on negotiation_entries for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy "membros leem" on debt_revisions for select using (is_household_member(household_id));

-- A negociação e seus lançamentos precisam ser da mesma casa da dívida.
create function negotiation_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'negotiations' then
    if not exists (select 1 from debts where id = new.debt_id and household_id = new.household_id) then
      raise exception 'Dívida não encontrada.';
    end if;
  else
    if not exists (select 1 from negotiations where id = new.negotiation_id and household_id = new.household_id) then
      raise exception 'Negociação não encontrada.';
    end if;
  end if;
  return new;
end;
$$;
create trigger negotiations_consistency before insert or update on negotiations
  for each row execute function negotiation_consistency();
create trigger negotiation_entries_consistency before insert or update on negotiation_entries
  for each row execute function negotiation_consistency();

-- Abre negociação e marca a dívida como "em negociação".
create function open_negotiation(p_debt_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d debts;
  n uuid;
begin
  select * into d from debts where id = p_debt_id for update;
  if d.id is null or not is_household_member(d.household_id) then
    raise exception 'Dívida não encontrada.';
  end if;
  if d.status = 'quitada' then
    raise exception 'Esta dívida já está quitada.';
  end if;
  if exists (select 1 from negotiations where debt_id = d.id and status = 'aberta') then
    raise exception 'Já existe uma negociação aberta para esta dívida.';
  end if;
  insert into negotiations (household_id, debt_id, created_by) values (d.household_id, d.id, auth.uid()) returning id into n;
  update debts set status = 'em_negociacao' where id = d.id;
  return n;
end;
$$;

-- Encerra sem acordo: negociação e propostas abertas ficam recusadas; dívida volta ao status normal.
create function close_negotiation(p_negotiation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  n negotiations;
begin
  select * into n from negotiations where id = p_negotiation_id for update;
  if n.id is null or not is_household_member(n.household_id) then
    raise exception 'Negociação não encontrada.';
  end if;
  if n.status <> 'aberta' then
    raise exception 'A negociação já foi encerrada.';
  end if;
  update negotiation_entries set status = 'recusada' where negotiation_id = n.id and status = 'aberta' and kind <> 'contato';
  update negotiations set status = 'recusada', closed_on = today_sp() where id = n.id;
  update debts set status = (case when kind = 'conta_em_atraso' then 'em_atraso' else 'em_dia' end)::debt_status
   where id = n.debt_id and status = 'em_negociacao';
end;
$$;

-- Aceita uma proposta: guarda a foto da dívida, perdoa juros/multas em aberto e converte a dívida
-- em parcelada (valor ÷ parcelas; com taxa mensal = parcelada com juros). O histórico de pagamentos,
-- juros já pagos e negociação continuam ligados à mesma dívida.
create function accept_proposal(
  p_entry_id uuid,
  p_amount_cents bigint,
  p_installments integer,
  p_due_day smallint,
  p_monthly_rate numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  e negotiation_entries;
  n negotiations;
  d debts;
  inst bigint;
begin
  select * into e from negotiation_entries where id = p_entry_id for update;
  if e.id is null or not is_household_member(e.household_id) then
    raise exception 'Proposta não encontrada.';
  end if;
  if e.kind = 'contato' then
    raise exception 'Só propostas podem ser aceitas.';
  end if;
  select * into n from negotiations where id = e.negotiation_id for update;
  if n.status <> 'aberta' then
    raise exception 'A negociação já foi encerrada.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Informe o valor acordado.';
  end if;
  if p_installments is null or p_installments < 1 then
    raise exception 'Informe o número de parcelas.';
  end if;
  select * into d from debts where id = n.debt_id for update;

  insert into debt_revisions (household_id, debt_id, reason, snapshot, created_by)
  values (d.household_id, d.id, 'Proposta aceita na negociação',
          jsonb_build_object(
            'debt', to_jsonb(d),
            'charges', coalesce((select jsonb_agg(to_jsonb(c)) from debt_charges c where c.debt_id = d.id), '[]'::jsonb)
          ),
          auth.uid());

  -- juros/multas não pagos são substituídos pelo acordo
  update debt_charges set amount_cents = paid_cents where debt_id = d.id and paid_cents < amount_cents;

  inst := ceil(p_amount_cents::numeric / p_installments);
  update debts set
    kind = (case when coalesce(p_monthly_rate, 0) > 0 then 'parcelada_com_juros' else 'parcelada_sem_juros' end)::debt_kind,
    status = 'em_dia',
    installment_cents = inst,
    installments_known = true,
    balance_cents = p_amount_cents,
    monthly_rate = nullif(p_monthly_rate, 0),
    principal_cents = null,
    accrual_start_month = null,
    original_due_date = null,
    late_fee_rate = null,
    late_interest_rate = null,
    due_day = coalesce(p_due_day, due_day),
    risk_priority = false,
    notes = concat_ws(E'\n', nullif(notes, ''),
      format('Acordo em %s: %s em %s× de %s.', to_char(today_sp(), 'DD/MM/YYYY'),
             fmt_brl(p_amount_cents), p_installments, fmt_brl(inst)))
  where id = d.id;

  update negotiation_entries set status = case when id = e.id then 'aceita' else 'recusada' end::negotiation_status
   where negotiation_id = n.id and kind <> 'contato' and (id = e.id or status = 'aberta');
  update negotiations set status = 'aceita', closed_on = today_sp() where id = n.id;
end;
$$;

revoke execute on function open_negotiation(uuid), close_negotiation(uuid),
  accept_proposal(uuid, bigint, integer, smallint, numeric) from public, anon;
grant execute on function open_negotiation(uuid), close_negotiation(uuid),
  accept_proposal(uuid, bigint, integer, smallint, numeric) to authenticated;

-- ===== 20261025000006_alerts.sql =====
-- Etapa 8: alertas por e-mail (registro para não repetir envio) e destinatários.

create table alert_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('debt', 'fixed_cost')),
  source_id uuid not null,
  due_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, due_date)
);

alter table alert_log enable row level security;
create policy "membro vê os próprios alertas" on alert_log for select using (user_id = auth.uid());
-- escrita só pelo servidor (service role, que ignora RLS)

-- Destinatários dos alertas: membros com e-mail ativado. Só o servidor (service role) chama.
create function alert_recipients()
returns table (household_id uuid, user_id uuid, email text, display_name text, alert_days_before smallint)
language sql stable security definer set search_path = public, auth as $$
  select m.household_id, m.user_id, u.email::text, m.display_name, m.alert_days_before
  from household_members m
  join auth.users u on u.id = m.user_id
  where m.email_alerts and u.email is not null
$$;

revoke execute on function alert_recipients() from public, anon, authenticated;
grant execute on function alert_recipients() to service_role;

-- ===== 20261026000007_grants.sql =====
-- Permissões explícitas para os papéis da API do Supabase. Quem vê quais linhas continua sendo
-- decidido pelo RLS; isto só garante o acesso às tabelas e funções mesmo em projetos Supabase
-- novos que não concedem esse acesso automaticamente.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
-- funções usadas dentro das políticas de RLS e das telas
grant execute on function is_household_member(uuid), current_household_id(), today_sp(), fmt_brl(bigint)
  to authenticated, service_role;

