-- =====================================================================
-- AGENDA DE ENSAIOS — bootstrap de PRODUÇÃO (IDEMPOTENTE)
-- Rode UMA vez no Supabase (SQL Editor), DEPOIS de aplicar o schema.sql.
--
-- Configure aqui quem vira `system_admin` automaticamente:
--   • ao logar pela 1ª vez (Google), ou
--   • se o usuário já existir, ao inserir o email abaixo.
-- A partir daí o próprio `system_admin` cria igrejas e promove outros admins
-- pelo app (#/admin), sem precisar voltar ao SQL Editor.
-- =====================================================================

insert into public.system_admin_allowlist (email) values
  ('worshiper777@gmail.com'),
  ('victor.ufcg@gmail.com')
on conflict (email) do nothing;

-- Garante a promoção de quem já tem conta (o trigger on_allowlist_admin_added
-- cobre os inserts acima; este update é idempotente e cobre reprocessamentos).
update public.profiles p
   set role = 'system_admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) in (select email from public.system_admin_allowlist)
   and p.role <> 'system_admin';
