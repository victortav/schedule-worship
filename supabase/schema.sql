-- =====================================================================
-- AGENDA DE ENSAIOS — schema do banco (IDEMPOTENTE)
-- Roda em: Supabase cloud (SQL Editor) e local via Docker (supabase_admin)
--
-- Regras de status (fixas, na view event_status):
--   🔴 crítico = sem voz confirmada OU sem base (Violão/Teclado) confirmada
--   🟡 alerta  = confirmados <= metade dos membros ativos
--   🟢 ok      = voz + base confirmadas e mais da metade confirmada
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------

-- Perfil (1:1 com auth.users; criado automaticamente no 1º login)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  role       text not null default 'membro' check (role in ('admin', 'membro')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Instrumentos (Voz também é um "instrumento").
-- A criticidade usa a category: 'voz' (Voz) e 'base' (Violão/Teclado).
create table if not exists public.instruments (
  id       serial primary key,
  name     text not null unique,
  category text not null default 'outro'
           check (category in ('voz', 'base', 'harmonia', 'ritmo', 'outro'))
);

-- Membro ⇄ Instrumento (muitos-a-muitos: "quem toca o quê")
create table if not exists public.member_instruments (
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  is_primary    boolean not null default false,
  primary key (profile_id, instrument_id)
);

-- Ensaios E eventos (type discrimina; a lógica é a mesma)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  type       text not null check (type in ('ensaio', 'evento')),
  location   text,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  notes      text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);

-- Confirmação de presença: quem vai / não vai. Sem linha = "pendente".
create table if not exists public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pendente'
             check (status in ('pendente', 'confirmado', 'ausente')),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Instrumentos da confirmação: 1+ por pessoa (ex.: Teclado + Voz).
-- O app reescreve as linhas a cada confirmação (delete + insert das próprias).
create table if not exists public.event_member_instruments (
  event_id      uuid not null references public.events (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  primary key (event_id, profile_id, instrument_id)
);

-- Licenças / indisponibilidades por período
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

-- ---------------------------------------------------------------------
-- 2) TRIGGER: perfil criado sozinho no primeiro login
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3) SEED: instrumentos (id fixo p/ referências determinísticas)
-- ---------------------------------------------------------------------
insert into public.instruments (id, name, category) values
  (1, 'Voz',      'voz'),
  (2, 'Violão',   'base'),
  (3, 'Teclado',  'base'),
  (4, 'Baixo',    'ritmo'),
  (5, 'Bateria',  'ritmo'),
  (6, 'Guitarra', 'harmonia')
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.instruments', 'id'),
              (select coalesce(max(id), 1) from public.instruments));

-- ---------------------------------------------------------------------
-- 4) FUNÇÃO helper: usuário atual é admin?
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 5) VIEW de criticidade (security_invoker = respeita o RLS de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.event_status
with ( security_invoker = true )
as
with confirm as (
  -- 1 linha por (evento, membro confirmado), com as flags dos instrumentos escolhidos
  select
    em.event_id,
    em.profile_id,
    bool_or(i.category = 'voz')  as com_voz,
    bool_or(i.category = 'base') as com_base
  from public.event_members em
  left join public.event_member_instruments emi
         on emi.event_id = em.event_id
        and emi.profile_id = em.profile_id
  left join public.instruments i on i.id = emi.instrument_id
  where em.status = 'confirmado'
  group by em.event_id, em.profile_id
),
agg as (
  select
    event_id,
    count(*)                         as confirmados,
    count(*) filter (where com_voz)  as vozes,
    count(*) filter (where com_base) as bases
  from confirm
  group by event_id
),
total as (
  select count(*) as membros from public.profiles where active
)
select
  e.id, e.title, e.type, e.location, e.starts_at, e.ends_at,
  coalesce(a.confirmados, 0) as confirmados,
  coalesce(a.vozes, 0)       as vozes,
  coalesce(a.bases, 0)       as bases,
  t.membros,
  -- 🔴 crítico: sem voz OU sem base (Violão/Teclado) confirmada
  (coalesce(a.vozes, 0) = 0 or coalesce(a.bases, 0) = 0) as e_critico,
  -- 🟡 alerta: confirmados <= metade da banda (ex.: 4/8, 3/7)
  (coalesce(a.confirmados, 0) * 2 <= t.membros)          as e_alerta
from public.events e
cross join total t
left join agg a on a.event_id = e.id;

-- ---------------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
--    auth.uid() is not null = "logado"; nada é visível sem login.
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.instruments        enable row level security;
alter table public.member_instruments enable row level security;
alter table public.events             enable row level security;
alter table public.event_members      enable row level security;
alter table public.event_member_instruments enable row level security;
alter table public.absences           enable row level security;

-- profiles: logados leem (roster visível), só admin edita
drop policy if exists "profiles_select"      on public.profiles;
create policy "profiles_select"      on public.profiles for select
  using (auth.uid() is not null);
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- instruments / member_instruments: logados leem, só admin edita
drop policy if exists "inst_select"      on public.instruments;
create policy "inst_select"      on public.instruments for select
  using (auth.uid() is not null);
drop policy if exists "inst_admin_write" on public.instruments;
create policy "inst_admin_write" on public.instruments for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "mi_select"      on public.member_instruments;
create policy "mi_select"      on public.member_instruments for select
  using (auth.uid() is not null);
drop policy if exists "mi_admin_write" on public.member_instruments;
create policy "mi_admin_write" on public.member_instruments for all
  using (public.is_admin()) with check (public.is_admin());

-- events: logados leem, só admin cria/edita/exclui
drop policy if exists "events_select"      on public.events;
create policy "events_select"      on public.events for select
  using (auth.uid() is not null);
drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write" on public.events for all
  using (public.is_admin()) with check (public.is_admin());

-- event_members: logados leem; cada um só mexe NA PRÓPRIA linha
drop policy if exists "em_select"       on public.event_members;
create policy "em_select"       on public.event_members for select
  using (auth.uid() is not null);
drop policy if exists "em_insert_own"   on public.event_members;
create policy "em_insert_own"   on public.event_members for insert
  with check (profile_id = auth.uid());
drop policy if exists "em_update_own"   on public.event_members;
create policy "em_update_own"   on public.event_members for update
  using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "em_delete_admin" on public.event_members;
create policy "em_delete_admin" on public.event_members for delete
  using (public.is_admin());

-- event_member_instruments: logados leem; cada um só mexe na PRÓPRIA escolha
drop policy if exists "emi_select"     on public.event_member_instruments;
create policy "emi_select"     on public.event_member_instruments for select
  using (auth.uid() is not null);
drop policy if exists "emi_insert_own" on public.event_member_instruments;
create policy "emi_insert_own" on public.event_member_instruments for insert
  with check (profile_id = auth.uid());
drop policy if exists "emi_update_own" on public.event_member_instruments;
create policy "emi_update_own" on public.event_member_instruments for update
  using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "emi_delete_own" on public.event_member_instruments;
create policy "emi_delete_own" on public.event_member_instruments for delete
  using (profile_id = auth.uid() or public.is_admin());

-- absences: logados leem; cada um marca a própria (admin pode por qualquer um)
drop policy if exists "abs_select"     on public.absences;
create policy "abs_select"     on public.absences for select
  using (auth.uid() is not null);
drop policy if exists "abs_insert_own" on public.absences;
create policy "abs_insert_own" on public.absences for insert
  with check (profile_id = auth.uid());
drop policy if exists "abs_update_own" on public.absences;
create policy "abs_update_own" on public.absences for update
  using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "abs_delete_own" on public.absences;
create policy "abs_delete_own" on public.absences for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 7) GRANTS (papéis do PostgREST: anon / authenticated / service_role)
--    RLS continua valendo para todos; o grant só habilita a consulta.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.profiles,
  public.instruments,
  public.member_instruments,
  public.events,
  public.event_members,
  public.event_member_instruments,
  public.absences
to anon, authenticated, service_role;
grant select on public.event_status to anon, authenticated, service_role;
grant usage on all sequences in schema public to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;