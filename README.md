# 🎸 Agenda de Ensaios — `schedule-worship`

App web para a banda organizar **ensaios e eventos**: confirmação de presença, o
instrumento que cada membro vai tocar, períodos de licença e um **dashboard de
criticidade** que mostra onde falta gente (sem voz, sem base ou com poucas confirmações).

## ✨ Funcionalidades

- Login com **Google** (produção) e **e-mail/senha** (local)
- **Multi-igreja**: cada usuário participa de 1..N igrejas; **seletor de igreja** no topo (ao lado de "Sair")
- **Meu agenda** — pendências, botões *Vou / Não vou* e escolha de 1+ instrumentos
- **Dashboard de criticidade** — 🔴 sem voz/sem base · 🟡 ≤ metade confirmada · 🟢 ok (por igreja)
- **Calendário** mensal + **detalhe do evento** (participação + **repertório**)
- **Repertório** por evento — biblioteca de músicas (Artista, Música, Tom, Link letra/cifra); **só admin** cria/edita/associa
- **Membros** — instrumentos de cada um + licenças; cada membro edita **os próprios** instrumentos
- **Admin** — eventos (com date/time picker), membros, repertório e igrejas
- **Tema claro/escuro** (botão no topo)

## 🧱 Stack

| Camada | Escolha |
|---|---|
| Frontend | HTML + CSS + JS puro (ES Modules) — **sem build step** |
| UI/Design | CSS próprio (custom properties, Grid, mobile-first, **temas claro/escuro**) — pickers de data/hora com **flatpickr** (CDN) |
| Cliente do banco | `@supabase/supabase-js` v2 via **CDN** (esm.sh) |
| Backend + banco | **Supabase** (Postgres + Auth + Row Level Security) — **multi-igreja (multi-tenant)** |
| Autenticação | Google OAuth (prod) · e-mail/senha autoconfirm (local) |
| Hospedagem | Vercel **ou** Hostinger (site 100% estático) |

Decisões-chave: **hash routing** (`app.html#/dashboard`) para funcionar em qualquer
hospedagem; **ensaios e eventos na mesma tabela** (`events.type`); **criticidade
calculada no banco** (view `event_status`), fonte única para dashboard e agenda;
**tudo escopado por igreja** (`church_id`) e **repertório** ligado ao evento.

## 📂 Estrutura

```
schedule-worship/
├─ web/                     # O APP (canônico; o Docker serve e a produção copia daqui)
│  ├─ index.html · login-callback.html · app.html
│  ├─ css/styles.css
│  └─ js/ config · client · ui · api · login · app(router)
│     └─ views/ meu-agenda · dashboard · calendario · evento · membros · perfil · admin · _shared
├─ supabase/               # schema.sql (DDL idempotente) + seed.sql (dados de dev)
├─ supabase-local/         # stack oficial do Supabase (vendorizada) + docker-compose.app.yml
├─ docs/                   # ARQUITETURA.md · STEERING.md · TASKS.md
└─ dev-up / dev-down / dev-reset .(ps1|sh)   # scripts do ambiente (rodam via WSL)
```

## 🚀 Rodar localmente

**Pré-requisito:** Docker rodando no **WSL (Ubuntu)** — *não* use o Docker Desktop.

**1) (1ª vez) criar o `.env`:**

```bash
cp supabase-local/.env.example supabase-local/.env
```

**2) Subir tudo:**

```powershell
.\dev-up.ps1            # no Windows (faz o wrapper p/ WSL)
# ou direto no WSL:
wsl -e bash /mnt/c/Users/<seu-usuario>/devel/schedule/dev-up.sh
```

Aguarde ~30s até `supabase-db` e `supabase-auth` ficarem `healthy`.

**3) Acessar:**

| Serviço | URL |
|---|---|
| App (login) | http://localhost:3000 |
| Studio (admin do banco) | http://localhost:8000/ — usuário `supabase` (senha no `supabase-local/.env`) |
| API | http://localhost:8000 |

**Usuários de teste** (senha `123456`): `ana@teste.com` (**admin de sistema**), `bruno@`,
`carla@` (**admin** da Catedral), `diego@`, `elisa@`, `felipe@`, `gabriela@`, `henrique@teste.com`.
Dados de exemplo: igrejas **Anglicana Libertador** (todos) e **Catedral Comunhão**
(`carla`, `diego`, `felipe`) — teste o **seletor de igreja**.

**Parar / resetar:**

```powershell
.\dev-down.ps1     # para os containers (mantém os dados)
.\dev-reset.ps1    # apaga tudo (banco + storage) e recomeça do zero
```

### O que o `dev-up` faz

1. Sobe o Supabase local (Postgres, Auth, PostgREST, Studio, Realtime, Storage…).
2. O serviço **`migrate`** aplica `supabase/schema.sql` + `supabase/seed.sql` (ambos **idempotentes**).
3. O serviço **`web`** (nginx) serve a pasta `web/` na porta `3000`.

> **Dicas:** editou arquivos em `web/`? Já refletem (bind mount) — dê *hard refresh*.
> Alterou `supabase/seed.sql`? Reaplique: `wsl -e bash -c "docker start schedule-migrate"`.
> **Mudou o `schema.sql`** (ex.: veio da v1)? Faça **reset**: `.\dev-reset.ps1` + `.\dev-up.ps1`.

## 🗄 Banco de dados

**Multi-igreja (multi-tenant):** `churches` + `church_members` (N:N, papel **por igreja**).
`events` e `songs` têm `church_id`; confirmações/licenças derivam a igreja do evento/perfil.

Tabelas: `churches`, `church_members`, `profiles`, `instruments`, `member_instruments`,
`events`, `event_members`, `event_member_instruments`, `absences`, `songs`, `event_songs`.

**Papéis:** `profiles.role` = `system_admin` | `membro` (global) · `church_members.role`
= `admin` | `membro` (por igreja). O **admin de sistema** cria igrejas e administra tudo.

Criticidade (view **`event_status`**, por igreja):

- 🔴 **Crítico** = sem **voz** confirmada **OU** sem **base** (cat. `base`) confirmada
- 🟡 **Alerta** = confirmados ≤ metade dos membros ativos da igreja (`confirmados*2 <= membros`)
- 🟢 **Ok** = voz + base confirmadas **e** mais da metade confirmada

**RLS:** leitura escopada pela(s) igreja(s) do usuário; escrita de eventos/repertório/membros
= **admin**; o membro edita os **próprios** instrumentos, confirmações e licenças. Helpers:
`is_system_admin / is_member_of / is_admin_of / shares_church / admin_of_profile / event_church`.
Instrumentos (catálogo de 21): Voz, Teclado, Violão, Guitarra, Baixo, Bateria Acústica,
Bateria Eletrônica, Violino, Violoncelo, Viola, Contrabaixo, Saxofone, Trompete, Trombone,
Flauta, Clarinete, Cajon, Pandeiro, Shaker, Piano, Órgão.

O `migrate` conecta como **`supabase_admin`** (superuser) — necessário para criar o
trigger em `auth.users` + grants.

## ⚙️ Configuração do app

`web/js/config.js` detecta o ambiente automaticamente:

- **Local** (`localhost`): usa `http://localhost:8000` + a anon key do `supabase-local/.env`.
- **Produção**: preencher `PROD.supabaseUrl` e `PROD.anonKey` (Supabase → API → anon key).

A `anon key` **é pública por design** — a segurança é o RLS. Nunca use `service_role` no frontend.

## ☁️ Deploy (o mesmo código nos dois)

O site é **100% estático** — nenhum backend próprio.

- **Vercel:** importe o repositório → framework *Other* → deploy.
- **Hostinger:** envie o conteúdo de `web/` para `public_html/`.
- Em ambos: adicione o domínio em **Supabase → Authentication → URL Configuration → Redirect URLs**.

**Setup no Supabase (uma vez):** ativar o provider **Google**, configurar Site/Redirect
URLs e, no 1º login, criar a 1ª igreja + promover o **admin de sistema**:

```sql
insert into public.churches (name) values ('Minha Igreja');
update public.profiles set role = 'system_admin' where id = '<uuid-do-admin>';
insert into public.church_members (church_id, profile_id, role)
  select c.id, '<uuid-do-admin>', 'admin' from public.churches c where c.name = 'Minha Igreja';
```

## 📈 Estado do projeto

- ✅ Fase 0 — Arquitetura
- ✅ Fase 1 — Ambiente local + E2E de backend (login / criticidade / RLS)
- ✅ Fase 2 — Frontend (7 views)
- ✅ Fase 3 — E2E no browser + polimento (responsivo + toast de RLS)
- ✅ Fase 5 — **v2**: multi-igreja + repertório + tema claro + flatpickr
- 🟡 Fase 4 — Produção (Vercel/Hostinger + Google OAuth)

## 📄 Documentação

- `docs/ARQUITETURA.md` — visão completa, modelo de dados e deploy
- `docs/TASKS.md` — tarefas e estado atual (**fonte de verdade / SOT**)
- `docs/STEERING.md` — protocolo de gestão de contexto
