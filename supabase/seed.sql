-- =====================================================================
-- AGENDA DE ENSAIOS — seed de DEV (IDEMPOTENTE) — multi-igreja
-- ⚠️ Somente para o ambiente local. NÃO rode em produção.
-- Cria 2 igrejas, 8 usuários de teste (senha 123456) + eventos e repertório.
-- O trigger on_auth_user_created cria os profiles automaticamente.
-- =====================================================================

create extension if not exists pgcrypto; -- crypt()/gen_salt() para as senhas

-- ---------------------------------------------------------------------
-- 0) Igrejas (tenant)
-- ---------------------------------------------------------------------
insert into public.churches (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Anglicana Libertador'),
  ('c0000000-0000-0000-0000-000000000002', 'Catedral Comunhão')
on conflict (id) do update set name = excluded.name;

-- ---------------------------------------------------------------------
-- 1) Usuários de teste (UUIDs fixos p/ referências determinísticas)
-- ---------------------------------------------------------------------
do $$
declare
  ids constant uuid[] := array[
    'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000008'
  ];
  names constant text[] := array[
    'Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Costa',
    'Elisa Rocha', 'Felipe Nunes', 'Gabriela Melo', 'Henrique Alves'
  ];
  emails constant text[] := array[
    'ana@teste.com', 'bruno@teste.com', 'carla@teste.com', 'diego@teste.com',
    'elisa@teste.com', 'felipe@teste.com', 'gabriela@teste.com', 'henrique@teste.com'
  ];
begin
  for i in 1 .. 8 loop
    if not exists (select 1 from auth.users where id = ids[i]) then
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                              created_at, updated_at)
      values (ids[i], '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', emails[i],
              crypt('123456', gen_salt('bf', 10)),
              now(),
              '{"provider":"email","providers":["email"]}'::jsonb,
              jsonb_build_object('full_name', names[i]),
              now(), now());
    end if;
    -- GoTrue (v2.19x) exige 1 identity por provider p/ login com senha
    insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
    values (ids[i], 'email', ids[i]::text,
            jsonb_build_object('sub', ids[i]::text, 'email', emails[i],
                               'email_verified', true, 'phone_verified', false),
            now(), now())
    on conflict (provider_id, provider) do nothing;
  end loop;
  -- instance_id: o GoTrue SEMPRE busca com instance_id = uuid_nil
  update auth.users
  set instance_id = '00000000-0000-0000-0000-000000000000'
  where id = any (ids)
    and instance_id is distinct from '00000000-0000-0000-0000-000000000000';
  -- GoTrue v2.197: colunas de token precisam ser '' (não NULL)
  update auth.users
  set confirmation_token     = coalesce(confirmation_token, ''),
      recovery_token         = coalesce(recovery_token, ''),
      email_change           = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, '')
  where id = any (ids);
end $$;

-- Garante os profiles dos usuários de teste (o trigger só cria no 1º insert em
-- auth.users; ao recriar o schema public os profiles precisam ser recriados)
insert into public.profiles (id, full_name) values
  ('a0000000-0000-0000-0000-000000000001','Ana Souza'),
  ('a0000000-0000-0000-0000-000000000002','Bruno Lima'),
  ('a0000000-0000-0000-0000-000000000003','Carla Dias'),
  ('a0000000-0000-0000-0000-000000000004','Diego Costa'),
  ('a0000000-0000-0000-0000-000000000005','Elisa Rocha'),
  ('a0000000-0000-0000-0000-000000000006','Felipe Nunes'),
  ('a0000000-0000-0000-0000-000000000007','Gabriela Melo'),
  ('a0000000-0000-0000-0000-000000000008','Henrique Alves')
on conflict (id) do nothing;

-- Ana é a admin de SISTEMA (global)
update public.profiles set role = 'system_admin'
where id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------
-- 2) Membros por igreja (N:N) — papel por igreja
--    Anglicana Libertador = todos os 8 (ana é admin da igreja)
--    Catedral Comunhão    = carla (admin), diego e felipe (membros)
--    -> carla/diego/felipe participam de 2 igrejas (teste do seletor)
-- ---------------------------------------------------------------------
insert into public.church_members (church_id, profile_id, role) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'admin'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'membro'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'membro'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'membro'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'membro')
on conflict (church_id, profile_id) do update set role = excluded.role;

-- ---------------------------------------------------------------------
-- 3) Instrumentos de cada membro (1=Voz, 2=Teclado, 3=Violão, 4=Guitarra,
--    5=Baixo, 6=Bateria Acústica, 8=Violino, 12=Saxofone, 17=Cajon, 20=Piano)
-- ---------------------------------------------------------------------
insert into public.member_instruments (profile_id, instrument_id, is_primary) values
  ('a0000000-0000-0000-0000-000000000001', 2,  true),   -- Ana: Teclado
  ('a0000000-0000-0000-0000-000000000001', 1,  false),  -- Ana: Voz
  ('a0000000-0000-0000-0000-000000000002', 3,  true),   -- Bruno: Violão
  ('a0000000-0000-0000-0000-000000000002', 1,  false),  -- Bruno: Voz
  ('a0000000-0000-0000-0000-000000000003', 1,  true),   -- Carla: Voz
  ('a0000000-0000-0000-0000-000000000003', 20, false),  -- Carla: Piano
  ('a0000000-0000-0000-0000-000000000004', 5,  true),   -- Diego: Baixo
  ('a0000000-0000-0000-0000-000000000005', 6,  true),   -- Elisa: Bateria Acústica
  ('a0000000-0000-0000-0000-000000000005', 17, false),  -- Elisa: Cajon
  ('a0000000-0000-0000-0000-000000000006', 4,  true),   -- Felipe: Guitarra
  ('a0000000-0000-0000-0000-000000000006', 1,  false),  -- Felipe: Voz
  ('a0000000-0000-0000-0000-000000000007', 8,  true),   -- Gabriela: Violino
  ('a0000000-0000-0000-0000-000000000007', 1,  false),  -- Gabriela: Voz
  ('a0000000-0000-0000-0000-000000000008', 12, true)    -- Henrique: Saxofone
on conflict (profile_id, instrument_id) do update set is_primary = excluded.is_primary;

-- ---------------------------------------------------------------------
-- 4) Eventos (por igreja)
--    Anglicana: e..0001 🔴 / e..0002 🟡 / e..0003 🟢
--    Catedral:  e..0011 🔴 / e..0012 🟢
-- ---------------------------------------------------------------------
insert into public.events (id, church_id, title, type, location, starts_at, ends_at, notes, created_by) values
  ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Ensaio da semana','ensaio','Sala de ensaios', (current_date + 2 + time '19:30'), (current_date + 2 + time '22:00'), null,'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','Ensaio geral','ensaio','Templo', (current_date + 9 + time '19:30'), (current_date + 9 + time '22:00'), null,'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001','Show — Igreja Central','evento','Auditório', (current_date + 20 + time '19:00'), (current_date + 20 + time '21:00'), 'Levar cifras impressas','a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000011','c0000000-0000-0000-0000-000000000002','Ensaio de quinta','ensaio','Catedral — salão', (current_date + 3 + time '20:00'), (current_date + 3 + time '22:00'), null,'a0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000012','c0000000-0000-0000-0000-000000000002','Culto de louvor','evento','Catedral', (current_date + 12 + time '18:00'), (current_date + 12 + time '20:00'), null,'a0000000-0000-0000-0000-000000000003')
on conflict (id) do update set
  church_id=excluded.church_id, title=excluded.title, type=excluded.type,
  location=excluded.location, starts_at=excluded.starts_at, ends_at=excluded.ends_at, notes=excluded.notes;

-- ---------------------------------------------------------------------
-- 5) Confirmações
-- ---------------------------------------------------------------------
insert into public.event_members (event_id, profile_id, status) values
  -- Evento 1 (Anglicana) -> 🔴 (sem voz): só Diego
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','confirmado'),
  -- Evento 2 (Anglicana) -> 🟡: 4/8, com voz + base
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','confirmado'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','confirmado'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','confirmado'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004','confirmado'),
  -- Evento 3 (Anglicana) -> 🟢: 6/8, com voz + base
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','confirmado'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','confirmado'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','confirmado'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','confirmado'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000006','confirmado'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000007','confirmado'),
  -- Evento 11 (Catedral) -> 🔴: só Felipe (Guitarra)
  ('e0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000006','confirmado'),
  -- Evento 12 (Catedral) -> 🟢: 3/3, com voz (Carla) + base (Diego)
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000003','confirmado'),
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000004','confirmado'),
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000006','confirmado')
on conflict (event_id, profile_id) do update set status=excluded.status;

-- ---------------------------------------------------------------------
-- 6) Instrumentos escolhidos nas confirmações
-- ---------------------------------------------------------------------
insert into public.event_member_instruments (event_id, profile_id, instrument_id) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004',5),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',1),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',2),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002',3),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002',1),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003',1),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004',5),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',1),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',2),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002',3),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002',1),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003',1),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004',5),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000006',4),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000007',8),
  ('e0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000006',4),
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000003',1),
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000004',5),
  ('e0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000006',4)
on conflict (event_id, profile_id, instrument_id) do nothing;

-- ---------------------------------------------------------------------
-- 7) Licença de exemplo (Henrique, 10 dias)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.absences
    where profile_id = 'a0000000-0000-0000-0000-000000000008'
      and start_date = current_date
  ) then
    insert into public.absences (profile_id, start_date, end_date, reason)
    values ('a0000000-0000-0000-0000-000000000008',
            current_date, current_date + 10, 'Viagem de trabalho');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8) Repertório (biblioteca por igreja) + associação a eventos
-- ---------------------------------------------------------------------
insert into public.songs (id, church_id, artist, title, music_key, link) values
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Hillsong United','Oceans','D','https://www.cifraclub.com.br/hillsong-united/oceans/'),
  ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','Fernandinho','Grande é o Senhor','G','https://www.cifraclub.com.br/fernandinho/grande-e-o-senhor/'),
  ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001','Aline Barros','Ressuscita-me','A','https://www.cifraclub.com.br/aline-barros/ressuscita-me/'),
  ('d0000000-0000-0000-0000-000000000011','c0000000-0000-0000-0000-000000000002','Vineyard','Tua Graça Me Basta','C','https://www.cifraclub.com.br/vineyard/tua-graca-me-basta/')
on conflict (id) do update set church_id=excluded.church_id, artist=excluded.artist,
  title=excluded.title, music_key=excluded.music_key, link=excluded.link;

insert into public.event_songs (event_id, song_id, position) values
  ('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000001',1),
  ('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000002',2),
  ('e0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003',3),
  ('e0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000011',1)
on conflict (event_id, song_id) do update set position=excluded.position;

-- ---------------------------------------------------------------------
-- 9) Solicitação de entrada pendente (p/ o admin da Catedral testar a aprovação)
--    Elisa (membro só da Anglicana) pediu para entrar na Catedral Comunhão.
-- ---------------------------------------------------------------------
insert into public.church_join_requests (church_id, profile_id, status) values
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'pending')
on conflict (church_id, profile_id) do nothing;

