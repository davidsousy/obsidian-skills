-- Etapa 7: negociações (histórico de contatos e propostas) e conversão da dívida ao aceitar.

do $$ begin create type negotiation_status as enum ('aberta', 'aceita', 'recusada'); exception when duplicate_object then null; end $$;
do $$ begin create type negotiation_entry_kind as enum ('contato', 'proposta_feita', 'proposta_recebida'); exception when duplicate_object then null; end $$;

create table if not exists negotiations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  status negotiation_status not null default 'aberta',
  opened_on date not null default today_sp(),
  closed_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists negotiations_debt on negotiations (debt_id);
-- no máximo uma negociação aberta por dívida
create unique index if not exists negotiations_one_open on negotiations (debt_id) where status = 'aberta';

create table if not exists negotiation_entries (
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
create index if not exists negotiation_entries_negotiation on negotiation_entries (negotiation_id, occurred_on);

-- Foto da dívida antes de cada mudança de formato (mantém o histórico).
create table if not exists debt_revisions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  reason text not null,
  snapshot jsonb not null, -- dívida + juros/multas antes da mudança
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists debt_revisions_debt on debt_revisions (debt_id, created_at);

alter table negotiations enable row level security;
alter table negotiation_entries enable row level security;
alter table debt_revisions enable row level security;

drop policy if exists "membros" on negotiations;
create policy "membros" on negotiations for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
drop policy if exists "membros" on negotiation_entries;
create policy "membros" on negotiation_entries for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
drop policy if exists "membros leem" on debt_revisions;
create policy "membros leem" on debt_revisions for select using (is_household_member(household_id));

-- A negociação e seus lançamentos precisam ser da mesma casa da dívida.
create or replace function negotiation_consistency() returns trigger
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
drop trigger if exists negotiations_consistency on negotiations;
create trigger negotiations_consistency before insert or update on negotiations
  for each row execute function negotiation_consistency();
drop trigger if exists negotiation_entries_consistency on negotiation_entries;
create trigger negotiation_entries_consistency before insert or update on negotiation_entries
  for each row execute function negotiation_consistency();

-- Abre negociação e marca a dívida como "em negociação".
create or replace function open_negotiation(p_debt_id uuid) returns uuid
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
create or replace function close_negotiation(p_negotiation_id uuid) returns void
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
create or replace function accept_proposal(
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
