# 🎸 Agenda da Banda — Arquitetura (v2)

App web **multi-igreja** para organizar **ensaios e eventos** de banda: confirmação de
presença, instrumento que cada membro vai tocar, períodos de licença, **repertório** de
músicas por evento e um **dashboard de criticidade** (ensaios/eventos sem voz, sem base ou
com poucas confirmações) — **tudo escopado por igreja**.

## 1. Stack (e por quê)

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | HTML + CSS + JS puro (ES Modules) — **sem build step** | site 100% estático; roda em Vercel **e** Hostinger (até compartilhado) sem Node/compilação/`.htaccess` |
| UI/Design | CSS próprio (custom properties, Grid, mobile-first, **temas claro/escuro**) + **flatpickr** (CDN) nos pickers | leve, responsivo, sem framework |
| Cliente do banco | `@supabase/supabase-js` v2 via **CDN** (esm.sh) | sem npm, sem bundle |
| Backend + banco | **Supabase** (Postgres + Auth + RLS) — **multi-tenant** | banco gerenciado; permissões no próprio banco |
| Autenticação | **Google OAuth** (prod) · e-mail/senha autoconfirm (local) | login sem gerenciar senha |
| Hospedagem | Vercel **ou** Hostinger (mesmo código) | site estático; backend vive na nuvem Supabase |

Decisões-chave:

- **Hash routing** (`app.html#/dashboard`): funciona em qualquer hospedagem, sem rewrites/`.htaccess`.
- **Multi-igreja (multi-tenant)**: `churches` + `church_members` (N:N com papel **por igreja**);
  todo dado é filtrado por `church_id`. O **admin de sistema** (`profiles.role`) cria igrejas
  e administra tudo.
- **Ensaios e eventos na mesma tabela** (`events.type`) — uma lógica só de confirmação/criticidade.
- **Voz é um "instrumento"** (category `voz`): quem canta e toca registra os dois.
- **Criticidade no banco** (view `event_status`, **por igreja**) — fonte única p/ dashboard e agenda.
- **Repertório** por evento (`songs` + `event_songs`) — escrita só de **admin**.
- **Membros editam os próprios instrumentos** (`member_instruments`).

## 2. Visão geral

```
 Navegador (celular / tablet / desktop)
 ┌──────────────────────────────────────────────────────┐
 │ index.html / login-callback.html → autenticação       │
 │ app.html → o app (hash routing, 1 <main>)             │
 │ css/styles.css → design system (temas claro/escuro)   │
 │ js/*.js → config · client · ui · api · app(router)    │
 │           + views/                                    │
 └───────────────────────────┬───────────────────────────┘
                             │ HTTPS (API do Supabase)
                             ▼
 ┌──────────────────────────────────────────────────────┐
 │ SUPABASE (nuvem)                                       │
 │  • Auth (Google OAuth / e-mail)                        │
 │  • Postgres + RLS (multi-igreja):                      │
 │      churches · church_members · profiles · instruments│
 │      member_instruments · events · event_members ·     │
 │      event_member_instruments · absences ·             │
 │      songs · event_songs · view event_status           │
 └──────────────────────────────────────────────────────┘
 Hospedagem: Vercel e/ou Hostinger (apenas arquivos estáticos)
```

## 3. Estrutura de pastas

```
schedule-worship/
├─ web/                       # O APP (canônico; o Docker serve e a produção copia)
│  ├─ index.html              # Landing + login (Google / e-mail local)
│  ├─ login-callback.html     # Recebe o redirect do OAuth (PKCE)
│  ├─ app.html                # App protegido: topbar (church-pick + tema) + nav + <main>
│  ├─ css/styles.css          # design system: temas, grid, cards, .church-pick, .cal-nav
│  └─ js/
│     ├─ config.js            # CONFIG (URL + anon key) + IS_LOCAL_ENV
│     ├─ client.js            # createClient (esm.sh), sessão, googleOAuthUrl()
│     ├─ ui.js                # helpers DOM/datas/toasts + tema (initTheme/toggleTheme)
│     ├─ api.js               # 1 função por consulta (escopo por igreja, songs, churches)
│     ├─ login.js             # tela de login
│     ├─ app.js               # boot → perfil → igrejas → router hash
│     └─ views/
│        ├─ _shared.js        # mountAnswer (presença) · mountAbsences (licenças)
│        ├─ meu-agenda.js · dashboard.js · calendario.js · evento.js
│        └─ membros.js · perfil.js · admin.js
├─ supabase/                  # schema.sql + seed.sql (o "dump" p/ a nuvem)
├─ supabase-local/            # stack oficial Supabase (vendorizada) + docker-compose.app.yml
├─ docs/                      # ARQUITETURA.md · STEERING.md · TASKS.md
└─ dev-up / dev-down / dev-reset .(ps1|sh)   # ambiente (rodam via WSL)
```

## 4. Mapa de telas

| Rota | Quem | O que mostra |
|---|---|---|
| `/` (index.html) | todos | landing + "Entrar com Google" (e e-mail no local) |
| `#/meu-agenda` (inicial) | membro | eventos futuros que **preciso responder**: [Vou 🎶] / [Não vou] + **1+ instrumentos**; minhas licenças |
| `#/dashboard` | todos | cards dos próximos eventos: 🔴 **crítico** (sem voz OU sem base) · 🟡 **alerta** (≤ metade confirmada) · 🟢 ok |
| `#/calendario` | todos | calendário mensal (cor = criticidade) + navegação ‹ › Hoje; clique → evento |
| `#/repertorio` | membro | biblioteca de músicas da igreja (CRUD) + associação por evento — **aberto a membros** |
| `#/evento/:id` | todos | detalhe: status, **repertório** (ver **e** editar), minha resposta e participação |
| `#/membros` | todos | roster da igreja ativa: instrumentos + licenças |
| `#/perfil` | todos | meus dados, **editar meus instrumentos**, minhas licenças |
| `#/admin` | admin da igreja / system_admin | eventos (com date/time picker), repertório (músicas + associação), membros (papel/instrumentos/ativo) e **igrejas** (só system_admin) |

No **topo** de todas as telas: seletor de **igreja** (quando o usuário tem 2+) e botão de **tema** (🌙/☀️).

## 5. Banco de dados (SQL completo — rodar no SQL Editor do Supabase)

### 5.1 Tabelas (v2: multi-igreja)

```sql
-- 1.1 Igrejas (tenant)
create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 1.2 Perfil (1:1 auth.users). role = papel GLOBAL
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text, avatar_url text,
  role text not null default 'membro' check (role in ('system_admin','membro')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 1.3 Membro ⇄ Igreja (N:N) + papel NA igreja
create table if not exists public.church_members (
  church_id uuid not null references public.churches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'membro' check (role in ('admin','membro')),
  created_at timestamptz not null default now(),
  primary key (church_id, profile_id)
);

-- 1.4 Instrumentos (catálogo GLOBAL). Voz também é instrumento.
create table if not exists public.instruments (
  id serial primary key,
  name text not null unique,
  category text not null default 'outro'
           check (category in ('voz','base','harmonia','ritmo','outro'))
);

-- 1.5 Membro ⇄ Instrumento (global): "o que a pessoa toca"
create table if not exists public.member_instruments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id int not null references public.instruments (id) on delete cascade,
  is_primary boolean not null default false,
  primary key (profile_id, instrument_id)
);

-- 1.6 Ensaios E eventos (por igreja)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  title text not null,
  type text not null check (type in ('ensaio','evento')),
  location text, starts_at timestamptz not null, ends_at timestamptz, notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_church_starts_idx on public.events (church_id, starts_at);

-- 1.7 Confirmação (sem linha = pendente)
create table if not exists public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pendente'
         check (status in ('pendente','confirmado','ausente')),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- 1.8 Instrumentos da confirmação (1+ por pessoa)
create table if not exists public.event_member_instruments (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id int not null references public.instruments (id) on delete cascade,
  primary key (event_id, profile_id, instrument_id)
);

-- 1.9 Licenças (global, por pessoa)
create table if not exists public.absences (
  id serial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null, end_date date not null, reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 1.10 Repertório: biblioteca de músicas por igreja
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  artist text, title text not null, music_key text, link text,
  created_at timestamptz not null default now()
);

-- 1.11 Associação evento ⇄ música (repertório do evento, com ordem)
create table if not exists public.event_songs (
  event_id uuid not null references public.events (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  position int not null default 0,
  primary key (event_id, song_id)
);
```

### 5.2 Trigger de perfil + catálogo de instrumentos

```sql
-- 2) Perfil criado sozinho no 1º login
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 3) Catálogo de instrumentos (id fixo; a category alimenta a criticidade)
insert into public.instruments (id, name, category) values
  (1,'Voz','voz'), (2,'Teclado','base'), (3,'Violão','base'), (4,'Guitarra','harmonia'),
  (5,'Baixo','base'), (6,'Bateria Acústica','ritmo'), (7,'Bateria Eletrônica','ritmo'),
  (8,'Violino','harmonia'), (9,'Violoncelo','harmonia'), (10,'Viola','harmonia'),
  (11,'Contrabaixo','base'), (12,'Saxofone','harmonia'), (13,'Trompete','harmonia'),
  (14,'Trombone','harmonia'), (15,'Flauta','harmonia'), (16,'Clarinete','harmonia'),
  (17,'Cajon','ritmo'), (18,'Pandeiro','ritmo'), (19,'Shaker','ritmo'),
  (20,'Piano','base'), (21,'Órgão','base')
on conflict (id) do update set name = excluded.name, category = excluded.category;
```

> Categorias usadas pela criticidade: **`voz`** (Voz) e **`base`** (Teclado, Violão, Baixo,
> Contrabaixo, Piano, Órgão). `ritmo`/`harmonia` são informativas.

### 5.3 Seed de desenvolvimento

`supabase/seed.sql` cria 2 igrejas (**Anglicana Libertador** — recebe todos os dados atuais —
e **Catedral Comunhão**), 8 usuários de teste (senha `123456`), eventos, confirmações e
**repertório**. `ana@teste.com` é **admin de sistema**; `carla@` é admin da Catedral;
`carla`/`diego`/`felipe` pertencem às **duas** igrejas (testam o seletor).

### 5.4 Primeiro admin de sistema (rodar uma vez, no SQL Editor)

```sql
insert into public.churches (name) values ('Minha Igreja');
update public.profiles set role = 'system_admin' where id = '<uuid-do-admin>';
insert into public.church_members (church_id, profile_id, role)
  select c.id, '<uuid-do-admin>', 'admin' from public.churches c where c.name = 'Minha Igreja';
```

## 6. Segurança — Row Level Security (multi-igreja)

Toda a proteção vive **no banco** (o app usa a `anon key`, pública por design). `auth.uid()`
= usuário logado. O acesso é **por igreja**: a pessoa vê o que pertence à(s) igreja(s) onde
tem vínculo; quem administra uma igreja escreve nela; o `system_admin` administra tudo.

```sql
-- Helpers (security definer ⇒ não sofrem RLS de dentro deles)
create or replace function public.is_system_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'system_admin'); $$;

create or replace function public.is_member_of(church uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_system_admin() or exists (select 1 from public.church_members
    where church_id = church and profile_id = auth.uid()); $$;

create or replace function public.is_admin_of(church uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_system_admin() or exists (select 1 from public.church_members
    where church_id = church and profile_id = auth.uid() and role = 'admin'); $$;

-- e ainda: shares_church(target uuid) · admin_of_profile(target uuid) · event_church(e uuid)
```

Padrão das policies (todas em `docs/../supabase/schema.sql`):

- **churches** — `select` para **qualquer logado** (para poder pedir entrada); escrita só `system_admin`.
- **church_members** — `select` se membro (ou a própria linha); admin escreve; o próprio pode **sair** (`profile_id = auth.uid()`).
- **profiles** — `select` se *self* / `shares_church` / `system_admin`; escrita se `admin_of_profile(id)`.
- **instruments** — todos leem; escrita só `system_admin`.
- **member_instruments** — `select` logados; escrita se `profile_id = auth.uid()` **ou** `admin_of_profile(profile_id)` (⇒ o membro edita os próprios instrumentos).
- **events** — `select` se `is_member_of(church_id)`; escrita se `is_admin_of(church_id)`.
- **event_members / event_member_instruments** — leitura se membro da igreja **do evento** (`is_member_of(event_church(event_id))`); escrita se `profile_id = auth.uid()` (a própria) ou admin da igreja do evento.
- **absences** — leitura logados; escrita própria (ou `system_admin`).
- **songs / event_songs** — membros da igreja leem **e escrevem** (repertório aberto — não só admin).
- **church_join_requests** — o próprio cria/vê/cancela; o **admin da igreja** vê e decide (aprovar ⇒ vira membro).

## 7. Criticidade — view `event_status` (por igreja)

A regra vive em **uma única view** (`security_invoker` ⇒ respeita o RLS de quem consulta):

- 🔴 **crítico** = sem **voz** confirmada **ou** sem **base** confirmada
- 🟡 **alerta** = não é crítico, mas confirmados ≤ **metade** dos membros ativos da igreja
- 🟢 **ok** = caso contrário

```sql
create or replace view public.event_status with (security_invoker = true) as
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
total as (   -- membros ativos POR IGREJA
  select cm.church_id, count(*) as membros
  from public.church_members cm
  join public.profiles p on p.id = cm.profile_id
  where p.active
  group by cm.church_id
)
select e.id, e.church_id, e.title, e.type, e.location, e.starts_at, e.ends_at,
  coalesce(a.confirmados,0) as confirmados,
  coalesce(a.vozes,0)       as vozes,
  coalesce(a.bases,0)       as bases,
  coalesce(t.membros,0)     as membros,
  (coalesce(a.vozes,0) = 0 or coalesce(a.bases,0) = 0)     as e_critico,
  (coalesce(a.confirmados,0) * 2 <= coalesce(t.membros,0)) as e_alerta
from public.events e
left join agg a on a.event_id = e.id
left join total t on t.church_id = e.church_id;
```

> Evento recém-criado (ninguém respondeu) já nasce `e_critico = true` — "pede atenção" até
> alguém confirmar. O frontend filtra por igreja (`church_id`) e mostra os selos derivando
> dos contadores (`vozes`, `bases`, `confirmados`, `membros`).

## 8. Repertório (v2)

- **`songs`** — biblioteca da igreja (Artista, Música, **Tom**, Link letra/cifra). CRUD **só admin**.
- **`event_songs`** — músicas de cada evento, com **ordem** (`position`). Só admin associa.
- **Página própria** (`views/repertorio.js`, rota `#/repertorio`): CRUD de músicas + associação
  por evento — **aberta a qualquer membro** (não só admin).
- **No detalhe do evento** (`views/evento.js`): ver **e** editar o repertório (checkboxes + salvar).

## 9. Frontend — contexto de igreja, tema e fluxo

`app.js` (boot):

1. `supabase.auth.getSession()` → sem sessão, volta para `index.html`.
2. Carrega o **perfil** (`profiles`) → `window.ME`.
3. Carrega as **igrejas** do usuário (`church_members` + `churches`); para `system_admin`, todas.
4. Define a **igreja ativa** (`localStorage['churchId']` ou a 1ª) e expõe `window.ACTIVE_CHURCH`,
   `window.ACTIVE_CHURCH_ID`, `window.MY_CHURCHES`, `window.isAdmin()` (= `system_admin` **ou** admin da igreja ativa).
5. Monta o **seletor de igreja** e o botão de **tema**; mostra os itens `.admin-only` se `isAdmin()`.
6. `render()` = hash routing → a view da rota executa `render(el, arg)` (async).

**Tema:** `ui.initTheme()` aplica `localStorage['theme']` em `data-theme`; `toggleTheme()` alterna.
O CSS tem `:root` (escuro) + `:root[data-theme='light']` + fallback `@media (prefers-color-scheme: light)`.

**Consulta principal do membro** (eventos futuros da igreja ativa que ainda não respondi):

```sql
select es.* from public.event_status es
where es.church_id = '<igreja-ativa>' and es.starts_at > now()
  and not exists (select 1 from public.event_members em
                  where em.event_id = es.id and em.profile_id = auth.uid()
                    and em.status in ('confirmado','ausente'))
order by es.starts_at;
```

Respostas: **Vou** → upsert `confirmado` + 1+ instrumentos em `event_member_instruments`
(o app faz delete+insert das próprias linhas a cada resposta); **Não vou** → `ausente`.

## 10. Autenticação

```
index.html  ──▶ supabase.auth.signInWithOAuth({ provider:'google',
                 options:{ redirectTo: ORIGIN + '/login-callback.html' } })
login-callback.html ──▶ supabase.auth.getSession()   (PKCE troca o ?code= pela sessão)
                    ──▶ location.replace('app.html#/meu-agenda')
```

No **local** (Docker): `IS_LOCAL_ENV` mostra o formulário **e-mail/senha** (autoconfirm ligado)
e esconde o Google. `signUp` envia `options.data.full_name` (o trigger lê `raw_user_meta_data`).

Setup no Supabase (uma vez):

1. **Auth → Providers → Google** — ativar (ou usar seu próprio client OAuth do Google Cloud).
2. **Auth → URL Configuration** — Site/Redirect URLs com todos os domínios
   (`http://localhost:3000`, Vercel, Hostinger).
3. **1º admin de sistema** — ver §5.4.

## 11. Design responsivo e temas

- **Celular** (≤ ~760px): 1 coluna; **bottom-nav** fixa; título do topbar oculto; `church-pick` compacto.
- **Desktop** (≥ 900px): **sidebar** fixa + grid `repeat(auto-fill, minmax(300px, 1fr))`.
- **Formulários**: `.form-grid` (2 colunas) → **1 coluna** em telas ≤ 560px.
- **Tema**: claro/escuro (botão 🌙/☀️ + `prefers-color-scheme`); flatpickr alinhado ao tema.
- **Selo de status**: a UI deriva o motivo dos contadores da view (`statusReasons`).
- **Calendário**: grade de 7 colunas desenhada em JS (sem biblioteca) + barra `.cal-nav` (‹ Mês › Hoje).

## 12. Deploy (mesmo código nos dois)

O site é **100% estático** — nenhum backend próprio, nada de Node em produção.

**Vercel** — importar o repo → framework *Other* → deploy → adicionar o domínio em Supabase → Redirect URLs.

**Hostinger** — hPanel → Gerenciador de Arquivos/FTP → enviar o conteúdo de `web/` para
`public_html/` → adicionar o domínio em Supabase → Redirect URLs. Hash routing dispensa
rewrites/`.htaccess`.

**Chaves**: `web/js/config.js` (`CONFIG.supabaseUrl` + `CONFIG.anonKey`). A `anon key` **é
pública por design** — a segurança é o RLS. **Nunca** use `service_role` no frontend.

## 13. Evolução (v3, opcional)

- **Realtime**: dashboard atualiza ao vivo quando alguém confirma (canal em `event_members`).
- **Notificações**: Edge Function + e-mail (Resend) e/ou atalho **WhatsApp** (`wa.me`).
- **Convite de membro** por link/e-mail (hoje o admin adiciona integrantes já existentes).
- **Ensaios recorrentes** (ex.: toda sexta) gerados automaticamente.
- **Exportar ICS** (importar a agenda no Google Calendar).
- **Alerta de desistência** de última hora (desconfirmação perto da data).

## 14. Roadmap de construção

| # | Etapa | Entrega | Status |
|---|---|---|---|
| 1 | Supabase: projeto + SQL + Google OAuth | banco pronto | ✅ |
| 2 | Login: index, callback, guard, layout base | entra com Google | ✅ |
| 3 | Meu Agenda: pendentes + Vou/Não vou + instrumentos | fluxo principal | ✅ |
| 4 | Dashboard: cards críticos com motivos | visibilidade | ✅ |
| 5 | Calendário + detalhe do evento | visão completa | ✅ |
| 6 | Membros + instrumentos + licenças | cadastro | ✅ |
| 7 | Admin: eventos, membros, instrumentos, papéis | controle | ✅ |
| 8 | **v2**: multi-igreja + repertório + temas + flatpickr | multi-tenant | ✅ |
| 9 | Deploy: Vercel (teste) → Hostinger (produção) | no ar | ⬜ |
