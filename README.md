# 🎸 Agenda de Ensaios — `schedule-worship`

App web para a banda organizar **ensaios e eventos**: confirmação de presença, o
instrumento que cada membro vai tocar, períodos de licença e um **dashboard de
criticidade** que mostra onde falta gente (sem voz, sem base ou com poucas confirmações).

## ✨ Funcionalidades

- Login com **Google** (produção) e **e-mail/senha** (local)
- **Meu agenda** — pendências, botões *Vou / Não vou* e escolha de 1+ instrumentos
- **Dashboard de criticidade** — 🔴 sem voz/sem base · 🟡 ≤ metade confirmada · 🟢 ok
- **Calendário** mensal + detalhe do evento (quem vai, com que instrumento)
- **Membros** — instrumentos de cada um + licenças
- **Admin** — criar/editar eventos, gerenciar membros, instrumentos e papéis

## 🧱 Stack

| Camada | Escolha |
|---|---|
| Frontend | HTML + CSS + JS puro (ES Modules) — **sem build step** |
| UI/Design | CSS próprio (custom properties, Grid, mobile-first, dark mode) |
| Cliente do banco | `@supabase/supabase-js` v2 via **CDN** (esm.sh) |
| Backend + banco | **Supabase** (Postgres + Auth + Row Level Security) |
| Autenticação | Google OAuth (prod) · e-mail/senha autoconfirm (local) |
| Hospedagem | Vercel **ou** Hostinger (site 100% estático) |

Decisões-chave: **hash routing** (`app.html#/dashboard`) para funcionar em qualquer
hospedagem; **ensaios e eventos na mesma tabela** (`events.type`); **criticidade
calculada no banco** (view `event_status`), fonte única para dashboard e agenda.

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

**Usuários de teste** (senha `123456`): `ana@teste.com` (admin), `bruno@`, `carla@`,
`diego@`, `elisa@`, `felipe@`, `gabriela@`, `henrique@teste.com`.

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

## 🗄 Banco de dados

Tabelas: `profiles`, `instruments`, `member_instruments`, `events`, `event_members`,
`event_member_instruments`, `absences`. A criticidade vive na view **`event_status`**:

- 🔴 **Crítico** = sem **voz** confirmada **OU** sem **base** (violão/teclado) confirmada
- 🟡 **Alerta** = confirmados ≤ metade dos membros ativos (`confirmados*2 <= membros`)
- 🟢 **Ok** = voz + base confirmadas **e** mais da metade confirmada

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
URLs e, no 1º login, promover o admin:
`update public.profiles set role = 'admin' where id = '<uuid-do-admin>';`

## 📈 Estado do projeto

- ✅ Fase 0 — Arquitetura
- ✅ Fase 1 — Ambiente local + E2E de backend (login / criticidade / RLS)
- ✅ Fase 2 — Frontend (7 views)
- 🟡 Fase 3 — E2E no browser + polimento
- ⬜ Fase 4 — Produção

## 📄 Documentação

- `docs/ARQUITETURA.md` — visão completa, modelo de dados e deploy
- `docs/TASKS.md` — tarefas e estado atual (**fonte de verdade / SOT**)
- `docs/STEERING.md` — protocolo de gestão de contexto
