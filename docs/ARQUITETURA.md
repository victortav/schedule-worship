# 🎸 Agenda da Banda — Arquitetura

App web para **ensaios e eventos** de banda: confirmação de presença, instrumento que cada
membro vai tocar, períodos de licença e um **dashboard de criticidade** (ensaios/eventos
sem base, sem voz ou com poucas pessoas confirmadas).

> **⚠️ Atualização v2 — multi-igreja + repertório (este documento descreve a v1):**
> a v2 adiciona **multi-igreja** (`churches` + `church_members` N:N, papel **por igreja**),
> o papel global **`system_admin`**, `church_id` em `events`/`songs`, **repertório**
> (`songs` + `event_songs`, escrita só de admin), catálogo de **21 instrumentos**,
> edição dos **próprios instrumentos** pelo membro, **seletor de igreja** e **tema claro/escuro**.
> Referência atualizada: `README.md` e `docs/TASKS.md`. (Revisão completa deste arquivo pendente.)

## 1. Stack (e por quê)

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | HTML + CSS + JS puro (ES Modules) — **sem build step** | "Tudo em HTML": vira site 100% estático, roda em Vercel **e** em Hostinger (até o compartilhado) sem Node, sem compilação, sem `.htaccess` |
| UI/Design | CSS próprio moderno (custom properties, Grid, mobile-first, dark mode) | Leve, sem framework, responsivo em celular/tablet/desktop |
| Cliente do banco | `@supabase/supabase-js` v2 via **CDN** (esm.sh) | Sem npm, sem bundle |
| Backend + banco | **Supabase** (Postgres + Auth + Row Level Security) | Banco gerenciado, auth com Google pronta, regras de permissão no próprio banco |
| Autenticação | **Google OAuth** (fornecido pelo Supabase) | Login com Google sem gerenciar senha |
| Hosting | Vercel **ou** Hostinger — o código é o mesmo | O site é estático; todo o backend vive na nuvem Supabase |

Decisões-chave:

- **Hash routing** (`app.html#/dashboard`): funciona em qualquer hospedagem sem
  configurar rewrite de URL — essencial para dar certo no Hostinger compartilhado.
- **Ensaios e eventos na mesma tabela** (`events.type`): uma única lógica de
  confirmação e de criticidade para os dois.
- **Voz é um "instrumento"**: quem canta e toca violão registra os dois, e ao
  confirmar um evento escolhe com o quê vai tocar.
- **Criticidade calculada no banco** (view `event_status`): a regra vive em um
  único lugar, e o dashboard do admin e a agenda do membro usam a mesma fonte.

## 2. Visão geral

```
 Navegador (celular / tablet / desktop)
 ┌─────────────────────────────────────────────────────┐
 │ index.html          → landing + botão "Entrar c/ Google"
 │ login-callback.html → finaliza o OAuth e guarda sessão
 │ app.html            → o app (hash routing, 1 <main>)
 │ css/styles.css      → design system responsivo
 │ js/*.js             → config · client · api · router · views
 └──────────────────────────┬──────────────────────────┘
                            │ HTTPS (API do Supabase)
                            ▼
 ┌─────────────────────────────────────────────────────┐
 │ SUPABASE (nuvem)                                    │
 │  • Auth (Google OAuth)                              │
 │  • Postgres + RLS:                                  │
 │      profiles · instruments · member_instruments    │
 │      events · event_members · em_instruments · abs  │
 │      view event_status (criticidade)                │
 └─────────────────────────────────────────────────────┘
 Hospedagem: Vercel e/ou Hostinger (apenas os arquivos estáticos)
```

## 3. Estrutura de pastas

```
schedule/
├─ index.html               # Landing + login (Google)
├─ login-callback.html      # Recebe o redirect do OAuth
├─ app.html                 # App protegido: layout (nav) + <main id="view">
├─ css/
│  └─ styles.css            # vars de tema, grid, cards, chips, bottom-nav/sidebar
├─ js/
│  ├─ config.js             # SUPABASE_URL + SUPABASE_ANON_KEY
│  ├─ client.js             # createClient, sessão, is_admin(), guard de login
│  ├─ api.js                # 1 função por consulta (eventos, meus pendentes, etc.)
│  ├─ router.js             # #/meu-agenda #/dashboard #/agenda #/membros #/admin
│  ├─ main.js               # boot: auth guard, layout, navegação
│  └─ views/
│     ├─ dashboard.js       # dashboard de criticidade
│     ├─ meu-agenda.js      # "o que eu preciso confirmar" (tela inicial)
│     ├─ agenda.js          # calendário mensal + detalhe do ensaio/evento
│     ├─ membros.js         # roster, instrumentos, licenças
│     └─ admin.js           # CRUD de eventos, membros, instrumentos, regras
└─ docs/
   └─ ARQUITETURA.md        # este arquivo
```

## 4. Mapa de telas

| Rota | Quem | O que mostra |
|---|---|---|
| `/` (index.html) | todos | landing + "Entrar com Google" |
| `#/meu-agenda` (inicial) | membro | eventos futuros que **preciso responder**: [Vou 🎶] / [Não vou] + escolha de **1 ou mais** instrumentos (ex.: Teclado + Voz); minhas licenças |
| `#/dashboard` | todos (destaque admin) | cards dos próximos eventos: 🔴 **crítico** (sem voz confirmada OU sem base — Violão/Teclado) · 🟡 **alerta** (metade ou menos dos membros confirmados) · 🟢 ok |
| `#/agenda` | todos | calendário mensal; cor do dia = criticidade; clique no evento → quem vai e com que instrumento |
| `#/membros` | todos | cards de membros: foto, instrumentos (destacando o principal), licenças ativas |
| `#/admin` | admin | criar/editar ensaios e eventos, gerenciar membros (ativar/desativar) e instrumentos |

## 5. Banco de dados (SQL completo — rodar no SQL Editor do Supabase)

### 5.1 Tabelas

```sql
-- =========================================================
-- 1) TABELAS
-- =========================================================

-- 1.1 Perfil (1:1 com auth.users; criado automaticamente no 1º login)
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  role       text not null default 'membro' check (role in ('admin', 'membro')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 1.2 Instrumentos (Voz também é um "instrumento").
--     A criticidade usa a category: 'voz' (Voz) e 'base' (Violão/Teclado).
create table public.instruments (
  id       serial primary key,
  name     text not null unique,
  category text not null default 'outro'
           check (category in ('voz', 'base', 'harmonia', 'ritmo', 'outro'))
);

-- 1.3 Membro ⇄ Instrumento (muitos-a-muitos: "quem toca o quê")
create table public.member_instruments (
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  is_primary    boolean not null default false,
  primary key (profile_id, instrument_id)
);

-- 1.4 Ensaios E eventos (type discrimina; a lógica é a mesma)
create table public.events (
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
create index events_starts_idx on public.events (starts_at);

-- 1.5 Confirmação de presença: quem vai / não vai.
--     Sem linha = "pendente" (ainda não respondeu).
create table public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pendente'
             check (status in ('pendente', 'confirmado', 'ausente')),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- 1.6 Instrumentos da confirmação: 1+ por pessoa (ex.: Teclado + Voz).
--     O app reescreve as linhas a cada confirmação (delete + insert das próprias).
create table public.event_member_instruments (
  event_id      uuid not null references public.events (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  instrument_id int  not null references public.instruments (id) on delete cascade,
  primary key (event_id, profile_id, instrument_id)
);

-- 1.7 Licenças / indisponibilidades por período
create table public.absences (
  id         serial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index absences_profile_idx on public.absences (profile_id, start_date, end_date);
```

### 5.2 Trigger (perfil automático) + seed

```sql
-- 2) Perfil é criado sozinho no primeiro login
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Seed: instrumentos (a category é usada pela criticidade)
insert into public.instruments (name, category) values
  ('Voz',      'voz'),
  ('Violão',   'base'),
  ('Teclado',  'base'),
  ('Baixo',    'ritmo'),
  ('Bateria',  'ritmo'),
  ('Guitarra', 'harmonia')
on conflict (name) do nothing;

-- Regras de status (fixas, implementadas na view event_status):
--   🔴 crítico = sem voz confirmada OU sem base (Violão/Teclado) confirmada
--   🟡 alerta  = metade ou menos dos membros ativos confirmados
```

### 5.3 Promover o primeiro admin (rodar uma vez, no SQL Editor)

```sql
-- depois que VOCÊ logar com Google e o perfil existir:
update public.profiles set role = 'admin'
where id = (select id from public.profiles limit 1); -- ou: where full_name = 'Seu Nome'
```

## 6. Segurança (Row Level Security)

Toda a proteção vive **no banco**: o app usa a `anon key` (pública por design) e o RLS
bloqueia qualquer leitura/escrita fora das regras — mesmo que alguém chame a API diretamente.
`auth.uid() is not null` = "logado"; nada é visível sem login.

```sql
-- 4) Helper: usuário atual é admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 5) Habilitar RLS em tudo
alter table public.profiles           enable row level security;
alter table public.instruments        enable row level security;
alter table public.member_instruments enable row level security;
alter table public.events                    enable row level security;
alter table public.event_members             enable row level security;
alter table public.event_member_instruments  enable row level security;
alter table public.absences                  enable row level security;

-- profiles: logados leem (roster visível), só admin edita
create policy "profiles_select"      on public.profiles for select
  using (auth.uid() is not null);
create policy "profiles_admin_write" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- instruments / member_instruments: logados leem, só admin edita
create policy "inst_select"      on public.instruments for select
  using (auth.uid() is not null);
create policy "inst_admin_write" on public.instruments for all
  using (public.is_admin()) with check (public.is_admin());
create policy "mi_select"      on public.member_instruments for select
  using (auth.uid() is not null);
create policy "mi_admin_write" on public.member_instruments for all
  using (public.is_admin()) with check (public.is_admin());

-- events: logados leem, só admin cria/edita/exclui
create policy "events_select"      on public.events for select
  using (auth.uid() is not null);
create policy "events_admin_write" on public.events for all
  using (public.is_admin()) with check (public.is_admin());

-- event_members: logados leem; cada um só mexe NA PRÓPRIA linha
create policy "em_select"       on public.event_members for select
  using (auth.uid() is not null);
create policy "em_insert_own"   on public.event_members for insert
  with check (profile_id = auth.uid());
create policy "em_update_own"   on public.event_members for update
  using (profile_id = auth.uid() or public.is_admin());
create policy "em_delete_admin" on public.event_members for delete
  using (public.is_admin());

-- absences: logados leem; cada um marca a própria (admin pode por qualquer um)
create policy "abs_select"     on public.absences for select
  using (auth.uid() is not null);
create policy "abs_insert_own" on public.absences for insert
  with check (profile_id = auth.uid());
create policy "abs_update_own" on public.absences for update
  using (profile_id = auth.uid() or public.is_admin());
create policy "abs_delete_own" on public.absences for delete
  using (profile_id = auth.uid() or public.is_admin());

-- event_member_instruments: logados leem; cada um só mexe na PRÓPRIA escolha
create policy "emi_select"     on public.event_member_instruments for select
  using (auth.uid() is not null);
create policy "emi_insert_own" on public.event_member_instruments for insert
  with check (profile_id = auth.uid());
create policy "emi_update_own" on public.event_member_instruments for update
  using (profile_id = auth.uid() or public.is_admin());
create policy "emi_delete_own" on public.event_member_instruments for delete
  using (profile_id = auth.uid() or public.is_admin());
```

## 7. Criticidade — view `event_status`

A regra de status vive em **uma única view**, com três níveis (crítico tem prioridade):

- 🔴 **crítico**: sem **voz** confirmada *ou* sem **base** (Violão/Teclado) confirmada
- 🟡 **alerta**: não é crítico, mas tem **metade ou menos** dos membros confirmados
- 🟢 **ok**: tem voz + base confirmadas e mais da metade dos membros confirmados

> Denominador do "metade" = membros **ativos** em `profiles` (quem está de licença
> continua contando como membro). O teste `confirmados * 2 <= membros` dá o resultado
> exato mesmo com número ímpar de membros (3/7 = alerta, 4/7 = não).

Os contadores expostos (`vozes`, `bases`, `confirmados`, `membros`) alimentam os selos
da UI ("Sem voz", "Sem base", "3/8 confirmados").

```sql
-- security_invoker (PG15+) faz a view respeitar o RLS de quem consulta
create or replace view public.event_status security_invoker as
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
```

> Comportamento: evento recém-criado (ninguém respondeu) já nasce `e_critico = true`
> (0 confirmados) — "pede atenção" até alguém confirmar. É o que queremos.

## 8. Principal consulta do frontend ("Meu Agenda")

Eventos do **futuro**, que eu **ainda não respondi**, e em que **não estou de licença**:

```sql
select es.*
from public.event_status es
where es.starts_at > now()
  and not exists (
    select 1 from public.event_members em
    where em.event_id = es.id
      and em.profile_id = auth.uid()
      and em.status in ('confirmado', 'ausente')
  )
  and not exists (
    select 1 from public.absences a
    where a.profile_id = auth.uid()
      and a.start_date <= es.starts_at::date
      and a.end_date   >= es.starts_at::date
  )
order by es.starts_at;
```

Respostas do membro:

- **Vou** → upsert em `event_members` com `status = 'confirmado'` + **1 ou mais** instrumentos (checkboxes entre os que ele tem cadastrado — ex.: Teclado + Voz) gravados em `event_member_instruments`. O app faz delete + insert das próprias linhas a cada resposta (idempotente)
- **Não vou** → `status = 'ausente'` (com atalho opcional "marcar licença", que cria linha em `absences`)
- **Mudar de resposta** → novo upsert sobrescreve; a escolha de instrumentos é substituída

## 9. Fluxo de autenticação (Google)

```
index.html  ──▶  supabase.auth.signInWithOAuth({
                   provider: 'google',
                   options: { redirectTo: ORIGIN + '/login-callback.html' }
                 })
                      │  (redireciona para o Google)
login-callback.html ◀─┘
  ──▶ supabase.auth.getSessionFromUrl()  →  cria a sessão (localStorage)
  ──▶ window.location.replace('app.html#/meu-agenda')

app.html ──▶ on load: supabase.auth.getSession()
             sem sessão → volta para index.html
             com sessão → carrega layout + view da rota atual
```

Setup no Supabase (uma vez):

1. **Authentication → Providers → Google** — ativar. (O Supabase provisiona as credenciais; se preferir usar seu próprio client do Google Cloud, o redirect `https://<ref>.supabase.co/auth/v1/callback` precisa estar autorizado no client OAuth.)
2. **Authentication → URL Configuration** — Site URL e Redirect URLs com **todos** os domínios:
   - `http://localhost:5500` (dev)
   - `https://SEU-PROJETO.vercel.app`
   - `https://DOMINIO-NO-HOSTINGER`
3. **Primeiro admin**: você loga com Google (o trigger cria o perfil) e roda a query do §5.3.

## 10. Design responsivo (mobile-first)

- **Celular** (≤ 640px): 1 coluna; navegação em **bottom-nav** fixa (Meu, Agenda, Painel, Membros, Admin); botões de confirmação grandes (thumb-friendly)
- **Tablet** (641–1024px): grid de 2 colunas nos cards; nav lateral recolhível
- **Desktop** (> 1024px): **sidebar** fixa à esquerda + grid `repeat(auto-fill, minmax(300px, 1fr))`
- **Tema**: custom properties (`--bg`, `--surface`, `--accent`, `--ok`, `--warn`, `--crit`) + dark mode por `prefers-color-scheme` e toggle manual
- **Selo de status** nos cards (a UI deriva o motivo dos contadores da view): 🔴 **crítico** — "Sem voz" / "Sem base (Violão/Teclado)" · 🟡 **alerta** — "3/8 confirmados (metade ou menos)" · 🟢 **ok**
- **Tipografia**: system font stack (zero download) ou 1 Google Font (Inter) com `font-display: swap`
- **Calendário mensal** desenhado em JS (grade 7 colunas) — sem biblioteca externa

## 11. Deploy (mesmo código nos dois)

O site é **100% estático** — nenhum backend próprio, nada de Node em produção.

**Vercel**

1. Subir o projeto para o GitHub (ou CLI: `npx vercel`)
2. Importar na Vercel → framework: *Other* → deploy
3. Adicionar o domínio em Supabase → Redirect URLs

**Hostinger**

1. hPanel → **Gerenciador de Arquivos** (ou FTP) → enviar o conteúdo da pasta para `public_html/`
2. (Em VPS: apontar o `root` do Nginx/Apache para a pasta do site)
3. Adicionar o domínio em Supabase → Redirect URLs
4. Nada a configurar de servidor: hash routing dispensa rewrites e `.htaccess`

**Chaves** (nas duas): `js/config.js` com `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
A `anon key` **é pública por design** — a segurança é o RLS. Nunca usar `service_role` no frontend.

## 12. Evolução (v2, opcional)

- **Realtime**: dashboard atualiza ao vivo quando alguém confirma (Supabase Realtime em `event_members`)
- **Notificações**: Edge Function + e-mail (Resend) — "Fulano confirmou o ensaio" e lembretes de pendência; atalho **WhatsApp** (`wa.me`) com mensagem de confirmação
- **Ensaios recorrentes** (ex.: toda sexta) gerados automaticamente
- **Exportar ICS** (importar a agenda no Google Calendar)
- **Alerta de desistência de última hora**: desconfirmação perto da data → destaque no painel

## 13. Roadmap de construção

| # | Etapa | Entrega |
|---|---|---|
| 1 | Supabase: projeto + SQL (§5–7) + Google OAuth | banco pronto |
| 2 | Login: index, callback, guard, layout base | entra com Google |
| 3 | **Meu Agenda**: listar pendentes + Vou/Não vou + instrumento | fluxo principal funcionando |
| 4 | **Dashboard**: cards críticos com motivos | visibilidade da banda |
| 5 | Agenda mensal + detalhe do evento (quem vai, com que instrumento) | visão completa |
| 6 | Membros + instrumentos + licenças | cadastro completo |
| 7 | Admin: criar eventos, gerenciar membros e instrumentos | controle total |
| 8 | Deploy: Vercel (teste) → Hostinger (produção) | no ar |
