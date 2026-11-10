-- =====================================================================
-- AGENDA DE ENSAIOS — seed de DEV (IDEMPOTENTE)
-- ⚠️ Somente para o ambiente local. NÃO rode em produção.
-- Cria 8 usuários de teste no GoTrue (senha: 123456) + eventos de exemplo.
-- O trigger on_auth_user_created cria os profiles automaticamente.
-- =====================================================================

create extension if not exists pgcrypto; -- crypt()/gen_salt() para as senhas

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
    -- (mesmo formato criado pela API: provider_id = uuid do user)
    insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
    values (ids[i], 'email', ids[i]::text,
            jsonb_build_object('sub', ids[i]::text, 'email', emails[i],
                               'email_verified', true, 'phone_verified', false),
            now(), now())
    on conflict (provider_id, provider) do nothing;
  end loop;
  -- instance_id: o GoTrue SEMPRE busca com instance_id = uuid_nil;
  -- NULL deixa o user invisível p/ login ("Invalid login credentials")
  update auth.users
  set instance_id = '00000000-0000-0000-0000-000000000000'
  where id = any (ids)
    and instance_id is distinct from '00000000-0000-0000-0000-000000000000';

  -- GoTrue v2.197 faz Scan das colunas de token como string: NULL quebra o
  -- login ("Scan error on column ... converting NULL to string is unsupported").
  -- Usuários criados pela API nascem com '' — replicar nos do seed.
  update auth.users
  set confirmation_token     = coalesce(confirmation_token, ''),
      recovery_token         = coalesce(recovery_token, ''),
      email_change           = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, '')
  where id = any (ids);
end $$;

-- Ana é a admin
update public.profiles set role = 'admin'
where id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------
-- 2) Instrumentos de cada membro
--    (1=Voz, 2=Violão, 3=Teclado, 4=Baixo, 5=Bateria, 6=Guitarra)
-- ---------------------------------------------------------------------
insert into public.member_instruments (profile_id, instrument_id, is_primary) values
  ('a0000000-0000-0000-0000-000000000001', 3, true),    -- Ana: Teclado
  ('a0000000-0000-0000-0000-000000000001', 1, false),   -- Ana: Voz
  ('a0000000-0000-0000-0000-000000000002', 2, true),    -- Bruno: Violão
  ('a0000000-0000-0000-0000-000000000002', 1, false),   -- Bruno: Voz
  ('a0000000-0000-0000-0000-000000000003', 1, true),    -- Carla: Voz
  ('a0000000-0000-0000-0000-000000000004', 4, true),    -- Diego: Baixo
  ('a0000000-0000-0000-0000-000000000005', 5, true),    -- Elisa: Bateria
  ('a0000000-0000-0000-0000-000000000006', 2, true),    -- Felipe: Violão
  ('a0000000-0000-0000-0000-000000000007', 1, true),    -- Gabriela: Voz
  ('a0000000-0000-0000-0000-000000000007', 6, false),   -- Gabriela: Guitarra
  ('a0000000-0000-0000-0000-000000000008', 3, true)     -- Henrique: Teclado
on conflict (profile_id, instrument_id) do nothing;

-- ---------------------------------------------------------------------
-- 3) Eventos de exemplo (sempre no futuro)
-- ---------------------------------------------------------------------
insert into public.events (id, title, type, location, starts_at, ends_at, notes, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'Ensaio da semana', 'ensaio', 'Sala de ensaios',
   (current_date + 3 + time '19:30')::timestamptz, (current_date + 3 + time '22:00')::timestamptz,
   null, 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'Ensaio geral', 'ensaio', 'Sala de ensaios',
   (current_date + 7 + time '19:30')::timestamptz, (current_date + 7 + time '22:00')::timestamptz,
   null, 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'Show — Igreja Central', 'evento', 'Igreja Central',
   (current_date + 14 + time '19:00')::timestamptz, (current_date + 14 + time '22:00')::timestamptz,
   'Levar repertório impresso', 'a0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4) Confirmações (montam os 3 estados de criticidade)
-- ---------------------------------------------------------------------

-- Evento 1 -> 🔴 CRÍTICO: só Diego confirmou (Baixo) => sem voz, sem base
insert into public.event_members (event_id, profile_id, status) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'confirmado')
on conflict (event_id, profile_id) do update set status = excluded.status;

-- Evento 2 -> 🟡 ALERTA: 4/8 confirmados (metade), com voz + base
insert into public.event_members (event_id, profile_id, status) values
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'confirmado')
on conflict (event_id, profile_id) do update set status = excluded.status;

-- Evento 3 -> 🟢 OK: 6/8 confirmados, com voz + base
insert into public.event_members (event_id, profile_id, status) values
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'confirmado'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', 'confirmado')
on conflict (event_id, profile_id) do update set status = excluded.status;

-- Instrumentos escolhidos nas confirmações (multi-instrumento!)
insert into public.event_member_instruments (event_id, profile_id, instrument_id) values
  -- Evento 1
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 4),
  -- Evento 2
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 1),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 2),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 1),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 1),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 4),
  -- Evento 3
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 1),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 3),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 2),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 1),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 1),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 4),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 2),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', 1),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', 6)
on conflict (event_id, profile_id, instrument_id) do nothing;

-- ---------------------------------------------------------------------
-- 5) Licença de exemplo (Henrique, 10 dias)
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