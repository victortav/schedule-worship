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

-- Backfill: usuários que fizeram login ANTES de o schema existir não têm profile
-- (o trigger handle_new_user só roda em novos auth.users). Cria os que faltam,
-- já como system_admin se o e-mail estiver na allowlist.
insert into public.profiles (id, full_name, avatar_url, role)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.email),
       u.raw_user_meta_data ->> 'avatar_url',
       case when exists (
         select 1 from public.system_admin_allowlist a where a.email = lower(u.email)
       ) then 'system_admin' else 'membro' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Garante a promoção de quem já tem conta (o trigger on_allowlist_admin_added
-- cobre os inserts acima; este update é idempotente e cobre reprocessamentos).
update public.profiles p
   set role = 'system_admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) in (select email from public.system_admin_allowlist)
   and p.role <> 'system_admin';
