-- Etapa 3: custos fixos mensais e gastos variáveis.

do $$ begin create type cost_category as enum ('moradia', 'alimentacao', 'carro', 'assinaturas', 'saude', 'pessoal', 'lazer', 'outros'); exception when duplicate_object then null; end $$;

create table if not exists fixed_costs (
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
create index if not exists fixed_costs_household on fixed_costs (household_id);

create table if not exists variable_expenses (
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
create index if not exists variable_expenses_household_date on variable_expenses (household_id, spent_on);

alter table fixed_costs enable row level security;
alter table variable_expenses enable row level security;

drop policy if exists "membros" on fixed_costs;
create policy "membros" on fixed_costs for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
drop policy if exists "membros" on variable_expenses;
create policy "membros" on variable_expenses for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Responsável / quem gastou (coluna passada como argumento) precisa ser membro da casa, ou null = casa.
create or replace function check_member_ref() returns trigger
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
drop trigger if exists fixed_costs_member_ref on fixed_costs;
create trigger fixed_costs_member_ref before insert or update on fixed_costs
  for each row execute function check_member_ref('owner_user_id');
drop trigger if exists variable_expenses_member_ref on variable_expenses;
create trigger variable_expenses_member_ref before insert or update on variable_expenses
  for each row execute function check_member_ref('spent_by');

-- Custos fixos do seed (outubro/2026). Total R$ 10.931,00.
-- Aluguel, condomínio, água, luz e terapia contam a partir de nov/2026 (os de outubro estão nas dívidas).
create or replace function load_seed_fixed_costs() returns integer
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
