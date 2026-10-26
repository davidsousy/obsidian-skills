-- Permissões explícitas para os papéis da API do Supabase. Quem vê quais linhas continua sendo
-- decidido pelo RLS; isto só garante o acesso às tabelas e funções mesmo em projetos Supabase
-- novos que não concedem esse acesso automaticamente.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
-- funções usadas dentro das políticas de RLS e das telas
grant execute on function is_household_member(uuid), current_household_id(), today_sp(), fmt_brl(bigint)
  to authenticated, service_role;
