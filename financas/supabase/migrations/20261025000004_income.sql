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
