# 📋 Tarefas — Agenda de Ensaios (SOT)

> **▶ NEXT — validar a v2 (multi-igreja) no browser:** `.\\dev-up.ps1` → http://localhost:3000 →
> login `ana@teste.com`/`123456` → usar o **seletor de igreja** (Anglicana ⇄ Catedral) → alternar
> **tema claro** → Admin: repertório, músicas e igrejas. Depois: **Fase 4** (Produção).
>
> **Retomada:** ler as 30 primeiras linhas daqui → seguir ▶ NEXT.
> Protocolo de contexto: `docs/STEERING.md`. Contratos abaixo (API/UI) substituem reler fonte.

## Regras (fonte: ARQUITETURA.md)

- 🔴 Crítico = sem **voz** confirmada OU sem **base** confirmada (cat. `base`: Teclado, Violão, Baixo, Contrabaixo, Piano, Órgão)
- 🟡 Alerta = confirmados ≤ **metade** dos membros ativos da igreja (`confirmados*2 <= membros`)
- 🟢 Ok = voz + base e mais da metade confirmada
- Confirmação aceita **1+ instrumentos** (tabela `event_member_instruments`)
- **Multi-igreja**: tudo escopado por `church_id`. Papéis: `profiles.role` = `system_admin|membro` (global) · `church_members.role` = `admin|membro` (por igreja)
- **Repertório** por evento (`songs` + `event_songs`) — **só admin** cria/edita/associa
- Instrumentos: catálogo global (21) — **o próprio membro** edita os seus (`member_instruments`)
- App = HTML/CSS/JS **estático sem build** (`web/`) + Supabase (local Docker ou cloud)
- Login: **Google** (prod) · **e-mail/senha autoconfirm** (local = "mock")

## Estado geral

- [x] Fase 0 — Arquitetura
- [x] Fase 1 — Ambiente: seed aplicado + **E2E por API OK** (login ana, 3 status, RLS 401/403)
- [x] Fase 2 — Frontend: base + 7 views (`web/js/views/`)
- [x] Fase 3 — E2E no browser + polimento (responsivo + toast de erro de RLS)
- [x] Fase 5 — **v2**: multi-igreja (`churches`/`church_members`/`system_admin`) + repertório + tema claro + flatpickr
- [ ] Fase 4 — Produção (Vercel/Hostinger + Google OAuth) ← ATUAL

## O que fazer AGORA (1 item = 1 arquivo/comando)

**Fase 1**
- [x] 1.9a db unhealthy + seed → resolvido (vol. named `db-data` + bugs do `seed.sql`)
- [x] 1.9a2 login quebrado → `auth.users` com `instance_id` NULL + 4 colunas de token NULL; corrigido no `seed.sql` (ver Pegadinha 9)
- [x] 1.9b web `:3000` → `200`
- [x] 1.9c `event_status` existe (3 linhas) + anon sem token → `401` (RLS)
- [x] 1.9d `ana@teste.com`/`123456` → login OK; dashboard 1🔴/1🟡/1🟢 (por API)
- [x] 1.9e RLS escrita: `bruno` (membro) criar evento → `403`

**Fase 3**
- [x] 1.9f browser: login + dashboard/logout/rotas conferidos pelo usuário no navegador
- [x] 3.1 responsivo: bottomnav ≤900px / sidebar ≥900px · `.form-grid` 1 col ≤560px · nome oculto ≤480px
- [x] 3.2 erros de RLS → toast amigável (`api.js fail` + `catch` no `mountAnswer.save`)
- [x] 3.3 resultado do E2E anotado no log de progresso

## Mapa dos arquivos (estado real)

```
schedule/
├── docs/TASKS.md + ARQUITETURA.md
├── supabase/schema.sql   ✅ DDL idempotente — **multi-igreja**: churches/church_members/songs/event_songs, RLS por `church_id`, view `event_status`, helpers de authz
│   └── seed.sql          ✅ 8 usuários (ana=`system_admin`) + 2 igrejas (Anglicana/Catedral) + 5 eventos + repertório
├── supabase-local/       ✅ stack oficial vendorizada
│   ├── .env              ✅ ENABLE_EMAIL_AUTOCONFIRM=true
│   ├── docker-compose.app.yml ✅ services: migrate (postgres:17, user postgres) + web (nginx :3000→../web)
│   └── volumes/web/nginx.conf ✅
├── web/                  ← O APP (canônico; docker serve e produção copia daqui)
│   ├── index.html ✅ (login Google + e-mail local) · login-callback.html ✅ · app.html ✅
│   ├── css/styles.css ✅ (temas claro/escuro; .church-pick; .cal-nav)
│   ├── js/{config,client,ui,api}.js ✅ (api: escopo por igreja + songs/churches; ui: tema claro/escuro)
│   ├── js/login.js ✅ · js/app.js ✅ (router hash; boot→perfil→igrejas; window.ACTIVE_CHURCH)
│   └── js/views/ ✅ _shared.js (mountAnswer, mountAbsences)
│                    meu-agenda · dashboard · calendario · evento · membros · perfil · admin
├── app/, supabase/migrations, supabase/seeds — 🗑 legado removido
└── dev-up/down/reset.ps1 e .sh ✅
```

## Fase 1 — Ambiente (detalhe)

- [x] 1.1–1.3 vendor + `.env` (autoconfirm on)
- [x] 1.4 `schema.sql` · [x] 1.5 `seed.sql` · [x] 1.6 compose.app · [x] 1.7 nginx · [x] 1.8 scripts
- [x] 1.9 **E2E**: `.\dev-up.ps1` → `curl localhost:3000` (200), login local OK, dashboard 1🔴/1🟡/1🟢
  - o `migrate` já conecta como `supabase_admin` (ver Pegadinha 2)
- URLs: app `:3000` · API/Studio `:8000` (Studio login `supabase` / senha do `.env`) · PG `:5432`

## CONTRATO API — `web/js/api.js` (use estes nomes exatos)

```
fetchMyChurches(userId)      → [{id,name,role}]  igrejas do usuário (+ papel dele por igreja)
fetchAllChurches()           → [{id,name}]  (RLS: só system_admin enxerga todas)
adminCreateChurch(name) → church
adminAddChurchMember(cid,pid,role='membro') · adminSetChurchMemberRole(cid,pid,role) · adminRemoveChurchMember(cid,pid)

fetchInstruments()          → [{id,name,category}]  ('voz'|'base'|'ritmo'|'harmonia'|'outro')
fetchProfiles()             → profiles[]  (RLS: quem compartilha igreja; todas p/ system_admin)
fetchMembers(churchId)      → [{...profile, church_role, instruments:[{id,name,category}], absences:[...]}] (só active)
fetchMemberInstruments()    → { profileId: [instrumentId,...] }
fetchAbsences()             → { profileId: [rows] }
isOnLeave(absences, iso)    → bool
saveMyInstruments(user, ids[])   // o PRÓPRIO membro define seus instrumentos
adminSetInstruments(pid, ids[])  // admin define os de outro membro

fetchUpcomingEvents(churchId)   → events[] (futuros, asc)
fetchEvent(id)              → event|null
fetchEventStatus(churchId)  → event_status[] futuros (por igreja)
fetchEventStatusBetween(churchId, a, b) → event_status[] no período (calendário)
fetchEventStatusById(id)    → event_status (detalhe)
fetchEventConfirmations(eid)→ [{profile_id,status,instruments:[{id,name,category}]}]  (SEM linha = pendente)
fetchMyConfirmations(user, eventIds[]) → { eventId: {event_id,status} }
fetchMyEventInstruments(user, eid)     → [instrumentId]
saveMyAttendance(user, eid, status, instrumentIds=[])   // upsert + reescrita das escolhas
saveMyAbsence(user, start_date, end_date, reason) · deleteAbsence(userId, absenceId, isAdmin)

fetchSongs(churchId)        → songs[]  (biblioteca da igreja)
fetchEventSongs(eid)        → [{...song, position}]  (ordenado)
adminCreateSong(cid, fields) · adminUpdateSong(id, fields) · adminDeleteSong(id)
adminSetEventSongs(eid, songIds[])   // reescreve o repertório (ordem = ordem da lista)

adminCreateEvent(user, churchId, fields) → event · adminUpdateEvent(id, fields) · adminDeleteEvent(id)
adminToggleActive(pid, bool) · adminSetSystemAdmin(pid, bool)
```
Erros → `toast(msg,'erro')` + `throw` (mensagem RLS vira "Sem permissão…").

## CONTRATO UI

- `ui.js`: `$ $$ esc fmtWhen(s,e) fmtDay isPast relDay toast(msg,'ok'|'erro') statusLevel(row)→critico|alerta|ok statusBadge(row) statusReasons(row)→[txt] avatar(name,size) instNames(list) confirmLabel(status)` + **tema**: `initTheme() currentTheme() toggleTheme()`
- CSS: `.card(.clickable .row .grow)` `.chip(.inst)` `.badge .b-critico .b-alerta .b-ok .b-pend` `.avatar` `.btn(.primary .danger .ghost .small)` `label.field>span` `.form-grid(.full) .form-actions` `.inst-picks label(input checkbox)` `.list-row(.grow)` `.empty(.big)` `.loading` `.toast(.erro)` `.cal-nav(.cal-month) .cal-head .cal-grid(.dow .cal-cell(.other .today .dn) .cal-ev .e-critico .e-alerta .e-ok)` `.church-pick` · **temas**: `:root` (escuro) + `:root[data-theme='light']` + fallback `@media (prefers-color-scheme: light) :root:not([data-theme])` · flatpickr alinhado ao tema
- **app.html**: `#boot.loading` → `#topbar.topbar` (logo+title+`#church-pick`+`#user-chip`+`#theme-toggle`) → `#shell.app` (`#sidebar.sidebar` `a[data-route]`, `.admin-only` + `#view.content`) → `#bottomnav` → **flatpickr** (2 `<script>` CDN: core + l10n/pt) → `/js/app.js`
- **app.js**: `boot()` = sessão → perfil → **igrejas**; expõe `window.ME`, `window.MY_CHURCHES`, `window.ACTIVE_CHURCH`, `window.ACTIVE_CHURCH_ID`, `window.isAdmin()` (= `system_admin` OU admin da igreja ativa). Seletor de igreja persiste em `localStorage['churchId']`; tema em `localStorage['theme']`. Rotas `#/nome` e `#/evento/:id`; views exportam `{ render(el, arg) }` async
- **login.js**: `index.html` carrega `/js/login.js`; ids `#google-area #btn-google #email-area #form-login #li-email #li-pass #btn-login #btn-signup #li-msg`; local = `IS_LOCAL_ENV`; Google via `googleOAuthUrl()`
- **Admin** (`views/admin.js`): eventos (com **flatpickr**), repertório da igreja (CRUD de músicas), repertório por evento, membros (papel na igreja, instrumentos, ativar, remover, adicionar) e **igrejas** (só `system_admin`)
- **RLS**: membro edita **os próprios** `member_instruments`/`event_members`/`event_member_instruments`/`absences`; leitura escopada pela(s) igreja(s); `songs`/`events`/`church_members`/`churches` = escrita de **admin**; tudo filtrado por `church_id`

## Pegadinhas

1. **Docker roda no WSL** (distro Ubuntu = default), NÃO no Docker Desktop do Windows.
   - Do Windows: `wsl -e bash /mnt/c/Users/antonio.vneto/devel/schedule/dev-up.sh` (ou `.\dev-up.ps1`)
   - Scripts `.sh`: cd p/ `$(dirname $0)/supabase-local` e `docker compose -f docker-compose.yml -f docker-compose.app.yml`
   - `.\dev-up.ps1` etc. são wrappers: `wslpath -u $PWD.Path` + `wsl -e bash "$wslPath\dev-*.sh"`
   - `.sh` precisam estar com **LF** (não CRLF) — normalizar: `sed -i 's/\r$//' dev-*.sh`
   - saída de `wsl` não vem pelo terminal (shell integration) → **redirecionar p/ arquivo e `read_files`**
2. `migrate` conecta como **`supabase_admin`** (superuser) — no stack novo `postgres` NÃO é superuser
   (trigger em `auth.users` + grants exigem). OS user no container continua `postgres` (só PGUSER mudou).
3. `web/js/config.js` exporta `CONFIG` + `IS_LOCAL_ENV`; PROD com TODOs p/ Fase 4
4. Compose serve `../web` — **nunca** editar `app/` de novo
5. `supabase-local/` é vendorizada: só `.env`, `docker-compose.app.yml`, `volumes/web/` são nossos
6. `seed.sql` usa UUIDs fixos `a0000000-…-NNNN` e eventos `e0000000-…-NNNN` (idempotente)
7. **WSL/DrvFs:** PG não consegue `chmod` em bind mount do `/mnt/c` (initdb falha:
   "could not change permissions"). Dados do PG vivem no **volume named `db-data`**
   (override no `docker-compose.app.yml`). Nunca reativar o bind `./volumes/db/data`.
8. Se mudar o compose e o container **não for recriado** (`Starting` em vez de `Created`),
   forçar: `docker compose … down -v` + `up -d` (o merge por target está correto; a
   heurística de "mudou?" do compose não detectou).
9. **`seed.sql` + GoTrue v2.197 (`auth.users`):** o login quebra se o user do seed tiver
   (a) `instance_id` NULL (GoTrue busca sempre por `uuid_nil` → `Invalid login credentials`)
   ou (b) qualquer coluna de token NULL — `confirmation_token`, `recovery_token`,
   `email_change`, `email_change_token_new` (GoTrue faz Scan como `string` →
   `unexpected_failure: Database error querying schema`, log
   `Scan error on column ... converting NULL to string is unsupported`).
   Usuários criados pela API nascem com `instance_id=uuid_nil` e tokens `''`; o `seed.sql`
   agora replica isso (bloco `do $$ … $$`). Editar o seed **exige** reexecutar o `migrate`:
   `docker start schedule-migrate` (container one-shot já saiu). O endpoint
   `/auth/v1/health` responde `200` **só com** header `apikey` (sem ele → `401`).
10. **v2 (multi-igreja):** o `schema.sql` mudou muito. Se o banco local foi criado com a **v1**,
    o `create table if not exists` **não** adiciona `church_id` em `events`/`songs` nem renomeia
    instrumentos → faça **reset**: `.\dev-reset.ps1` + `.\dev-up.ps1`. Alternativa rápida:
    `drop schema public cascade; create schema public;` e reaplicar `schema.sql` + `seed.sql`
    (o seed **recria os profiles**; o trigger só cria no 1º insert em `auth.users`).
11. **RLS multi-igreja:** tudo depende de `church_id`. Helpers `security definer`:
    `is_system_admin()`, `is_member_of(c)`, `is_admin_of(c)`, `shares_church(pid)`,
    `admin_of_profile(pid)`, `event_church(eid)`. Papéis: `profiles.role`
    (`system_admin`|`membro`, global) e `church_members.role` (`admin`|`membro`, por igreja).
    `ana@teste.com` é `system_admin`; `carla@` é admin da Catedral (e membro das 2 igrejas).

## Decisões pendentes (não bloqueiam)

- [ ] Licença conta no denominador da "metade"? (default: **sim**)
- [ ] Evento novo nasce 🔴 (default: sim, "pede atenção")
- [ ] Nome da banda p/ logo/título (hoje: genérico "Agenda de Ensaios" 🎸)

## Log de progresso

| Data | O que foi feito |
|---|---|
| 05/11 | Arquitetura + stack vendorizada + `schema.sql`/`seed.sql` + compose.app + scripts dev |
| 05/11 16h | Diagnóstico: `up` falhou por Docker Desktop desligado; `web/` = canônico (base nova: config/client/ui/api/css/índices); `app/` = legado; TASKS.md refinado com contratos |
| 05/11 17h | Views completas (7 rotas + `_shared.js`); api.js +2 fns (status between/byId); legado removido. PRÓXIMO: `dev-up` + E2E 1.9 |
| 05/11 18h | Criado `STEERING.md` (protocolo de contexto); TASKS.md virou snapshot (▶ NEXT + itens 1-cmd); temporários `docs/_*.txt` apagados. `dev-up` abortou: **db unhealthy**. ▶ NEXT 1.9a: log do db |
| 05/11 18:30 | Root cause do seed: (1) `\|\| '"}'::jsonb` → `jsonb_build_object('full_name',…)`; (2) `date at time` não existe → `date + time '19:30'`; (3) 2 UUIDs com dash faltando (lin. 95-96, 31 chars). Seed 100% aplicado: 8 users, 3 eventos, 11 confirmações, 16 instrumentos, 1 licença. ▶ NEXT: `docs/_verify.txt` → E2E browser |
| 06/11 | E2E **por API** OK (item 1.9): login `ana@teste.com`/`123456` voltou a funcionar após 2 fixes no `seed.sql` — `instance_id = uuid_nil` + 4 colunas de token `NULL`→`''` (GoTrue v2.197). Validações: web `200`, migrate `MIGRATION OK`, anon→`401`, `event_status` = 1🔴 (Ensaio da semana) / 1🟡 (Ensaio geral) / 1🟢 (Show), `ana`=admin, membro criando evento → `403` (RLS). ▶ NEXT 1.9f: confirmar o visual no browser |
| 06/11 | Fase 3 concluída: usuário validou o E2E no navegador (1.9f). Polimento aplicado: `.form-grid` → 1 coluna ≤560px; toast sobe no desktop (≥900px); nome do usuário oculto ≤480px; `catch` no `mountAnswer.save` (erros de RLS já viram toast em `api.js fail`). Assets servindo `200`. ▶ NEXT: Fase 4 (Produção) |
| 06/11 | **v2 multi-igreja + repertório** (backend validado por API): tabelas `churches`/`church_members`/`songs`/`event_songs`; `church_id` em events/songs; papel global `system_admin`; helper RLS `is_system_admin/is_member_of/is_admin_of/shares_church/admin_of_profile/event_church`; catálogo com 20 instrumentos (+Voz); `member_instruments` editável pelo próprio membro. Seed: 2 igrejas (Anglicana Libertador = dados atuais; Catedral Comunhão = nova), repertório, 5 eventos. Front: seletor de igreja, **tema claro**, **flatpickr** nos pickers, repertório por evento, instrumentos editáveis, fix do `.cal-nav`. ▶ NEXT: validar v2 no browser |