-- =====================================================================
-- AGENDA DE ENSAIOS — schema do banco (IDEMPOTENTE) — multi-igreja
-- Roda em: Supabase cloud (SQL Editor) e local via Docker (supabase_admin)
--
-- Papéis:
--   profiles.role        = 'system_admin' | 'membro'   (global)
--   church_members.role  = 'admin' | 'membro'          (por igreja)
--
-- Regras de status (view event_status, por igreja):
--   🔴 crítico = sem voz confirmada OU sem base confirmada
--   🟡 alerta  = confirmados <= metade dos membros ativos da igreja
--   🟢 ok      = voz + base confirmadas e mais da metade confirmada
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------

-- Igrejas (tenant)
create table if not exists public.churches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Perfil (1:1 com auth.users; criado automaticamente no 1º login)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  role       text not null default 'membro' check (role in ('system_admin', 'membro')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Membro ⇄ Igreja (N:N) + papel do membro NA igreja
create table if not exists public.church_members (
  church_id  uuid not null references public.churches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'membro' check (role in ('admin', 'membro')),
  created_at timestamptz not null default now(),
  primary key (church_id, profile_id)
);

-- Instrumentos (catálogo global). Voz também é um "instrumento".
create table if not exists public.instruments (
  id       serial primary key,
  name     text not null unique,
  category text not null default 'outro'
           check (category in ('voz', 'base', 'harmonia', 'ritmo', 'outro'))
);

-- Membro ⇄ Instrumento (global: "o que a pessoa toca")
create table if not exists public.member_instruments (
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  is_primary    boolean not null default false,
  primary key (profile_id, instrument_id)
);

-- Ensaios E eventos (por igreja)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  title      text not null,
  type       text not null check (type in ('ensaio', 'evento')),
  location   text,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  notes      text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_church_starts_idx on public.events (church_id, starts_at);

-- Confirmação de presença: quem vai / não vai (sem linha = pendente)
create table if not exists public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pendente'
             check (status in ('pendente', 'confirmado', 'ausente')),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Instrumentos da confirmação: 1+ por pessoa
create table if not exists public.event_member_instruments (
  event_id      uuid not null references public.events (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  primary key (event_id, profile_id, instrument_id)
);

-- Licenças / indisponibilidades (globais, por pessoa)
create table if not exists public.absences (
  id         serial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists absences_profile_idx on public.absences (profile_id, start_date, end_date);

-- Repertório: biblioteca de músicas por igreja
create table if not exists public.songs (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  artist     text,
  title      text not null,
  music_key  text,
  link       text,
  created_at timestamptz not null default now()
);
create index if not exists songs_church_idx on public.songs (church_id);

-- Associação evento ⇄ música (repertório do evento, com ordem)
create table if not exists public.event_songs (
  event_id uuid not null references public.events (id) on delete cascade,
  song_id  uuid not null references public.songs (id) on delete cascade,
  position int  not null default 0,
  primary key (event_id, song_id)
);

-- Solicitações de entrada em igreja (o admin da igreja aprova/recusa)
create table if not exists public.church_join_requests (
  church_id  uuid not null references public.churches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (church_id, profile_id)
);

-- ---------------------------------------------------------------------
-- 2) TRIGGER: perfil criado sozinho no primeiro login
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3) SEED: instrumentos (id fixo p/ referências determinísticas)
-- ---------------------------------------------------------------------
insert into public.instruments (id, name, category) values
  (1,'Voz','voz'),                 (2,'Teclado','base'),        (3,'Violão','base'),
  (4,'Guitarra','harmonia'),       (5,'Baixo','base'),          (6,'Bateria Acústica','ritmo'),
  (7,'Bateria Eletrônica','ritmo'),(8,'Violino','harmonia'),    (9,'Violoncelo','harmonia'),
  (10,'Viola','harmonia'),         (11,'Contrabaixo','base'),   (12,'Saxofone','harmonia'),
  (13,'Trompete','harmonia'),      (14,'Trombone','harmonia'),  (15,'Flauta','harmonia'),
  (16,'Clarinete','harmonia'),     (17,'Cajon','ritmo'),        (18,'Pandeiro','ritmo'),
  (19,'Shaker','ritmo'),           (20,'Piano','base'),         (21,'Órgão','base')
on conflict (id) do update set name = excluded.name, category = excluded.category;
select setval(pg_get_serial_sequence('public.instruments', 'id'),
              (select coalesce(max(id), 1) from public.instruments));

-- ---------------------------------------------------------------------
-- 4) HELPERS de autorização (multi-igreja)
-- ---------------------------------------------------------------------
create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'system_admin');
$$;

create or replace function public.is_member_of(church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_system_admin()
      or exists (select 1 from public.church_members
                 where church_id = church and profile_id = auth.uid());
$$;

create or replace function public.is_admin_of(church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_system_admin()
      or exists (select 1 from public.church_members
                 where church_id = church and profile_id = auth.uid()
                   and role = 'admin');
$$;

create or replace function public.shares_church(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.church_members a
    join public.church_members b on a.church_id = b.church_id
    where a.profile_id = auth.uid() and b.profile_id = target
  );
$$;

create or replace function public.admin_of_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_system_admin() or exists (
    select 1 from public.church_members a
    join public.church_members b on a.church_id = b.church_id
    where a.profile_id = auth.uid() and a.role = 'admin' and b.profile_id = target
  );
$$;

create or replace function public.event_church(e uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select church_id from public.events where id = e;
$$;

-- o usuário atual pode ver o perfil `target`?
-- (self, system_admin, quem compartilha igreja, ou quem PEDIU entrada numa igreja que administro)
create or replace function public.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_system_admin()
      or target = auth.uid()
      or public.shares_church(target)
      or exists (
        select 1 from public.church_join_requests r
        join public.church_members a on a.church_id = r.church_id
        where r.profile_id = target and a.profile_id = auth.uid() and a.role = 'admin'
      );
$$;

-- ---------------------------------------------------------------------
-- 5) VIEW de criticidade (por igreja; security_invoker = respeita o RLS)
-- ---------------------------------------------------------------------
create or replace view public.event_status
with ( security_invoker = true )
as
with confirm as (
  select em.event_id, em.profile_id,
         bool_or(i.category = 'voz')  as com_voz,
         bool_or(i.category = 'base') as com_base
  from public.event_members em
  left join public.event_member_instruments emi
         on emi.event_id = em.event_id and emi.profile_id = em.profile_id
  left join public.instruments i on i.id = emi.instrument_id
  where em.status = 'confirmado'
  group by em.event_id, em.profile_id
),
agg as (
  select event_id, count(*) as confirmados,
         count(*) filter (where com_voz)  as vozes,
         count(*) filter (where com_base) as bases
  from confirm group by event_id
),
total as (
  select cm.church_id, count(*) as membros
  from public.church_members cm
  join public.profiles p on p.id = cm.profile_id
  where p.active
  group by cm.church_id
)
select e.id, e.church_id, e.title, e.type, e.location, e.starts_at, e.ends_at,
  coalesce(a.confirmados, 0) as confirmados,
  coalesce(a.vozes, 0)       as vozes,
  coalesce(a.bases, 0)       as bases,
  coalesce(t.membros, 0)     as membros,
  (coalesce(a.vozes, 0) = 0 or coalesce(a.bases, 0) = 0)      as e_critico,
  (coalesce(a.confirmados, 0) * 2 <= coalesce(t.membros, 0))  as e_alerta
from public.events e
left join agg a on a.event_id = e.id
left join total t on t.church_id = e.church_id;

-- ---------------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.churches             enable row level security;
alter table public.profiles             enable row level security;
alter table public.church_members       enable row level security;
alter table public.instruments          enable row level security;
alter table public.member_instruments   enable row level security;
alter table public.events               enable row level security;
alter table public.event_members        enable row level security;
alter table public.event_member_instruments enable row level security;
alter table public.absences             enable row level security;
alter table public.songs                enable row level security;
alter table public.event_songs          enable row level security;
alter table public.church_join_requests enable row level security;

-- churches: qualquer logado lê a lista (para poder PEDIR entrada); system_admin cria/edita
drop policy if exists "churches_select" on public.churches;
create policy "churches_select" on public.churches for select
  using (auth.uid() is not null);
drop policy if exists "churches_write" on public.churches;
create policy "churches_write" on public.churches for all
  using (public.is_system_admin()) with check (public.is_system_admin());

-- church_members: membros da igreja leem o roster; admin da igreja escreve; o próprio sai
drop policy if exists "cm_select" on public.church_members;
create policy "cm_select" on public.church_members for select
  using (public.is_member_of(church_id) or profile_id = auth.uid());
drop policy if exists "cm_write" on public.church_members;
create policy "cm_write" on public.church_members for all
  using (public.is_admin_of(church_id)) with check (public.is_admin_of(church_id));
drop policy if exists "cm_self_delete" on public.church_members;
create policy "cm_self_delete" on public.church_members for delete
  using (profile_id = auth.uid());

-- profiles: ver quem compartilha igreja (ou self/sysadmin); editar = admin do alvo
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (public.can_view_profile(id));
drop policy if exists "profiles_write" on public.profiles;
create policy "profiles_write" on public.profiles for all
  using (public.admin_of_profile(id)) with check (public.admin_of_profile(id));

-- instruments: catálogo global — leem todos, escreve só system_admin
drop policy if exists "inst_select" on public.instruments;
create policy "inst_select" on public.instruments for select
  using (auth.uid() is not null);
drop policy if exists "inst_write" on public.instruments;
create policy "inst_write" on public.instruments for all
  using (public.is_system_admin()) with check (public.is_system_admin());

-- member_instruments: a própria pessoa edita; admin do alvo também
drop policy if exists "mi_select" on public.member_instruments;
create policy "mi_select" on public.member_instruments for select
  using (auth.uid() is not null);
drop policy if exists "mi_write" on public.member_instruments;
create policy "mi_write" on public.member_instruments for all
  using (profile_id = auth.uid() or public.admin_of_profile(profile_id))
  with check (profile_id = auth.uid() or public.admin_of_profile(profile_id));

-- events: membros da igreja leem; admin da igreja escreve
drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events for select
  using (public.is_member_of(church_id));
drop policy if exists "events_write" on public.events;
create policy "events_write" on public.events for all
  using (public.is_admin_of(church_id)) with check (public.is_admin_of(church_id));

-- event_members: membros da igreja do evento leem; cada um mexe na PRÓPRIA linha
drop policy if exists "em_select" on public.event_members;
create policy "em_select" on public.event_members for select
  using (public.is_member_of(public.event_church(event_id)));
drop policy if exists "em_insert_own" on public.event_members;
create policy "em_insert_own" on public.event_members for insert
  with check (profile_id = auth.uid());
drop policy if exists "em_update_own" on public.event_members;
create policy "em_update_own" on public.event_members for update
  using (profile_id = auth.uid() or public.is_admin_of(public.event_church(event_id)));
drop policy if exists "em_delete_own" on public.event_members;
create policy "em_delete_own" on public.event_members for delete
  using (profile_id = auth.uid() or public.is_admin_of(public.event_church(event_id)));

-- event_member_instruments: logados leem; cada um só mexe na PRÓPRIA escolha
drop policy if exists "emi_select" on public.event_member_instruments;
create policy "emi_select" on public.event_member_instruments for select
  using (public.is_member_of(public.event_church(event_id)));
drop policy if exists "emi_insert_own" on public.event_member_instruments;
create policy "emi_insert_own" on public.event_member_instruments for insert
  with check (profile_id = auth.uid());
drop policy if exists "emi_update_own" on public.event_member_instruments;
create policy "emi_update_own" on public.event_member_instruments for update
  using (profile_id = auth.uid() or public.is_admin_of(public.event_church(event_id)));
drop policy if exists "emi_delete_own" on public.event_member_instruments;
create policy "emi_delete_own" on public.event_member_instruments for delete
  using (profile_id = auth.uid() or public.is_admin_of(public.event_church(event_id)));

-- absences (global, por pessoa)
drop policy if exists "abs_select" on public.absences;
create policy "abs_select" on public.absences for select
  using (auth.uid() is not null);
drop policy if exists "abs_insert_own" on public.absences;
create policy "abs_insert_own" on public.absences for insert
  with check (profile_id = auth.uid());
drop policy if exists "abs_update_own" on public.absences;
create policy "abs_update_own" on public.absences for update
  using (profile_id = auth.uid() or public.is_system_admin());
drop policy if exists "abs_delete_own" on public.absences;
create policy "abs_delete_own" on public.absences for delete
  using (profile_id = auth.uid() or public.is_system_admin());

-- songs: membros da igreja leem; admin da igreja escreve
drop policy if exists "songs_select" on public.songs;
create policy "songs_select" on public.songs for select
  using (public.is_member_of(church_id));
-- repertório ABERTO a qualquer membro da igreja (não só admin)
drop policy if exists "songs_write" on public.songs;
create policy "songs_write" on public.songs for all
  using (public.is_member_of(church_id)) with check (public.is_member_of(church_id));

-- event_songs: membros da igreja do evento leem E escrevem (repertório aberto)
drop policy if exists "es_select" on public.event_songs;
create policy "es_select" on public.event_songs for select
  using (public.is_member_of(public.event_church(event_id)));
drop policy if exists "es_write" on public.event_songs;
create policy "es_write" on public.event_songs for all
  using (public.is_member_of(public.event_church(event_id)))
  with check (public.is_member_of(public.event_church(event_id)));

-- church_join_requests: o próprio cria/vê/cancela; admin da igreja vê e decide
drop policy if exists "cjr_select" on public.church_join_requests;
create policy "cjr_select" on public.church_join_requests for select
  using (profile_id = auth.uid() or public.is_admin_of(church_id));
drop policy if exists "cjr_insert_own" on public.church_join_requests;
create policy "cjr_insert_own" on public.church_join_requests for insert
  with check (profile_id = auth.uid());
drop policy if exists "cjr_update_admin" on public.church_join_requests;
create policy "cjr_update_admin" on public.church_join_requests for update
  using (public.is_admin_of(church_id)) with check (public.is_admin_of(church_id));
drop policy if exists "cjr_delete" on public.church_join_requests;
create policy "cjr_delete" on public.church_join_requests for delete
  using (profile_id = auth.uid() or public.is_admin_of(church_id));

-- ---------------------------------------------------------------------
-- 7) GRANTS (RLS continua valendo; o grant só habilita a consulta)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.churches, public.profiles, public.church_members, public.instruments,
  public.member_instruments, public.events, public.event_members,
  public.event_member_instruments, public.absences, public.songs,
  public.event_songs, public.church_join_requests
to anon, authenticated, service_role;
grant select on public.event_status to anon, authenticated, service_role;
grant usage on all sequences in schema public to anon, authenticated, service_role;
grant execute on function
  public.is_system_admin(), public.is_member_of(uuid), public.is_admin_of(uuid),
  public.shares_church(uuid), public.admin_of_profile(uuid), public.event_church(uuid),
  public.can_view_profile(uuid)
to anon, authenticated, service_role;


