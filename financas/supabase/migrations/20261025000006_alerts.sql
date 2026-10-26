-- Etapa 8: alertas por e-mail (registro para não repetir envio) e destinatários.

create table if not exists alert_log (
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
drop policy if exists "membro vê os próprios alertas" on alert_log;
create policy "membro vê os próprios alertas" on alert_log for select using (user_id = auth.uid());
-- escrita só pelo servidor (service role, que ignora RLS)

-- Destinatários dos alertas: membros com e-mail ativado. Só o servidor (service role) chama.
create or replace function alert_recipients()
returns table (household_id uuid, user_id uuid, email text, display_name text, alert_days_before smallint)
language sql stable security definer set search_path = public, auth as $$
  select m.household_id, m.user_id, u.email::text, m.display_name, m.alert_days_before
  from household_members m
  join auth.users u on u.id = m.user_id
  where m.email_alerts and u.email is not null
$$;

revoke execute on function alert_recipients() from public, anon, authenticated;
grant execute on function alert_recipients() to service_role;
