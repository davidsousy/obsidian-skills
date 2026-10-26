-- Etapa 1: casa (household), membros e RLS.
-- Todos os dados do sistema pertencem a uma casa; só membros da casa leem e escrevem.

do $$ begin create type car_cost_allocation as enum ('por_hora', 'por_dia'); exception when duplicate_object then null; end $$;

create table if not exists households (
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

create table if not exists household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  email_alerts boolean not null default true,
  alert_days_before smallint not null default 3 check (alert_days_before between 0 and 30),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Um usuário pertence a no máximo uma casa (simplifica o app: a casa do usuário é única).
create unique index if not exists household_members_one_house_per_user on household_members (user_id);

-- Usada em todas as políticas. security definer evita recursão de RLS em household_members.
create or replace function is_household_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members where household_id = h and user_id = auth.uid()
  );
$$;

-- Casa do usuário logado (ou null).
create or replace function current_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid();
$$;

alter table households enable row level security;
alter table household_members enable row level security;

drop policy if exists "membros leem a casa" on households;
create policy "membros leem a casa" on households
  for select using (is_household_member(id));
drop policy if exists "membros alteram a casa" on households;
create policy "membros alteram a casa" on households
  for update using (is_household_member(id)) with check (is_household_member(id));
-- Sem insert/delete direto: criação só via create_household().

drop policy if exists "membros veem os membros da casa" on household_members;
create policy "membros veem os membros da casa" on household_members
  for select using (is_household_member(household_id));
-- Cada um edita só as próprias preferências (nome, alertas).
drop policy if exists "membro edita a si mesmo" on household_members;
create policy "membro edita a si mesmo" on household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Sem insert direto: entrada só via create_household() / join_household().

-- O membro não pode trocar de casa via update.
create or replace function household_members_lock_keys() returns trigger
language plpgsql as $$
begin
  if new.household_id <> old.household_id or new.user_id <> old.user_id then
    raise exception 'Não é permitido alterar a casa ou o usuário de um membro.';
  end if;
  return new;
end;
$$;
drop trigger if exists household_members_lock_keys on household_members;
create trigger household_members_lock_keys before update on household_members
  for each row execute function household_members_lock_keys();

-- O invite_code só pode ser trocado por regenerate_invite_code().
create or replace function households_lock_invite() returns trigger
language plpgsql as $$
begin
  if new.invite_code <> old.invite_code and current_setting('app.regenerating_invite', true) is distinct from 'on' then
    raise exception 'Use regenerate_invite_code() para trocar o código.';
  end if;
  return new;
end;
$$;
drop trigger if exists households_lock_invite on households;
create trigger households_lock_invite before update on households
  for each row execute function households_lock_invite();

create or replace function create_household(p_name text, p_display_name text) returns uuid
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

create or replace function join_household(p_invite_code text, p_display_name text) returns uuid
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

create or replace function regenerate_invite_code() returns text
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
