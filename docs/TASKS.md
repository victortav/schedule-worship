# 📋 Tarefas — Agenda de Ensaios (SOT)

> **▶ NEXT — 1.9f (browser):** abrir http://localhost:3000 → login `ana@teste.com`/`123456`
> → conferir visualmente dashboard 1🔴 (Ensaio da semana) 1🟡 (Ensaio geral) 1🟢 (Show).
> Backend já validado por API (migrate/login/criticidade/RLS OK em `docs/_verify.txt`).
>
> **Retomada:** ler as 30 primeiras linhas daqui → seguir ▶ NEXT.
> Protocolo de contexto: `docs/STEERING.md`. Contratos abaixo (API/UI) substituem reler fonte.

## Regras (fonte: ARQUITETURA.md)

- 🔴 Crítico = sem **voz** confirmada OU sem **base** (violão/teclado) confirmada
- 🟡 Alerta = confirmados ≤ **metade** dos membros ativos (`confirmados*2 <= membros`)
- 🟢 Ok = voz + base e mais da metade confirmada
- Confirmação aceita **1+ instrumentos** (tabela `event_member_instruments`)
- App = HTML/CSS/JS **estático sem build** (`web/`) + Supabase (local Docker ou cloud)
- Login: **Google** (prod) · **e-mail/senha autoconfirm** (local = "mock")

## Estado geral

- [x] Fase 0 — Arquitetura
- [x] Fase 1 — Ambiente: seed aplicado + **E2E por API OK** (login ana, 3 status, RLS 401/403)
- [x] Fase 2 — Frontend: base + 7 views (`web/js/views/`)
- [~] Fase 3 — E2E no browser (visual) + polimento ← ATUAL
- [ ] Fase 4 — Produção

## O que fazer AGORA (1 item = 1 arquivo/comando)

**Fase 1**
- [x] 1.9a db unhealthy + seed → resolvido (vol. named `db-data` + bugs do `seed.sql`)
- [x] 1.9a2 login quebrado → `auth.users` com `instance_id` NULL + 4 colunas de token NULL; corrigido no `seed.sql` (ver Pegadinha 9)
- [x] 1.9b web `:3000` → `200`
- [x] 1.9c `event_status` existe (3 linhas) + anon sem token → `401` (RLS)
- [x] 1.9d `ana@teste.com`/`123456` → login OK; dashboard 1🔴/1🟡/1🟢 (por API)
- [x] 1.9e RLS escrita: `bruno` (membro) criar evento → `403`

**Fase 3 (só após 1.9f)**
- [ ] 1.9f browser: confirmar visualmente login + dashboard/logout/rotas
- [ ] 3.1 responsivo: 375px (bottomnav) / 1280px (sidebar)
- [ ] 3.2 erros de RLS viram toast amigável
- [ ] 3.3 resultado do E2E anotado no log de progresso

## Mapa dos arquivos (estado real)

```
schedule/
├── docs/TASKS.md + ARQUITETURA.md
├── supabase/schema.sql   ✅ DDL idempotente (RLS, view event_status, is_admin())
│   └── seed.sql          ✅ 8 usuários (senha 123456, ana=admin) + 3 eventos (1🔴 1🟡 1🟢)
├── supabase-local/       ✅ stack oficial vendorizada
│   ├── .env              ✅ ENABLE_EMAIL_AUTOCONFIRM=true
│   ├── docker-compose.app.yml ✅ services: migrate (postgres:17, user postgres) + web (nginx :3000→../web)
│   └── volumes/web/nginx.conf ✅
├── web/                  ← O APP (canônico; docker serve e produção copia daqui)
│   ├── index.html ✅ (login Google + e-mail local) · login-callback.html ✅ · app.html ✅
│   ├── css/styles.css ✅
│   ├── js/{config,client,ui,api}.js ✅ (+fetchEventStatusBetween/ById)
│   ├── js/login.js ✅ · js/app.js ✅ (router hash; boot→profile→window.ME)
│   └── js/views/ ✅ _shared.js (mountAnswer, mountAbsences)
│                    meu-agenda · dashboard · calendario · evento · membros · perfil · admin
├── app/, supabase/migrations, supabase/seeds — 🗑 legado removido
└── dev-up/down/reset.ps1 e .sh ✅
```

## Fase 1 — Ambiente (detalhe)

- [x] 1.1–1.3 vendor + `.env` (autoconfirm on)
- [x] 1.4 `schema.sql` · [x] 1.5 `seed.sql` · [x] 1.6 compose.app · [x] 1.7 nginx · [x] 1.8 scripts
- [ ] 1.9 **E2E**: `.\dev-up.ps1` → `curl localhost:3000` (200), login local, dashboard ok
  - se `migrate` falhar (user `postgres` sem permissão de superuser no stack novo):
    trocar em `docker-compose.app.yml` `user: "postgres"` + `PGUSER: postgres` → `supabase_admin`
- URLs: app `:3000` · API/Studio `:8000` (Studio login `supabase` / senha do `.env`) · PG `:5432`

## CONTRATO API — `web/js/api.js` (use estes nomes exatos)

```
fetchInstruments()          → [{id,name,category}]  ('voz'|'base'|'ritmo'|'harmonia'|'outro')
fetchProfiles()             → profiles[]
fetchMembers()              → [{...profile, instruments:[{id,name,category}], absences:[{id,start_date,end_date,reason}]}] (só active)
fetchMemberInstruments()    → { profileId: [instrumentId,...] }
fetchAbsences()             → { profileId: [rows] }
isOnLeave(absences, iso)    → bool
fetchUpcomingEvents()       → events[] (futuros, asc)
fetchEvent(id)              → event|null
fetchEventStatus()          → event_status[] futuros: {id,title,type,location,starts_at,ends_at,confirmados,vozes,bases,membros,e_critico,e_alerta}
fetchEventStatusBetween(a,b)→ event_status[] no período (calendário)
fetchEventStatusById(id)    → event_status (detalhe, p/ evento específico)
fetchEventConfirmations(eid)→ [{profile_id,status,instruments:[{id,name,category}]}]  (SEM linha = pendente)
fetchMyConfirmations(user, eventIds[]) → { eventId: {event_id,status} }
fetchMyEventInstruments(user, eid)     → [instrumentId]
saveMyAttendance(user, eid, status, instrumentIds=[])   // 'confirmado'|'ausente'; upsert+reescrita
saveMyAbsence(user, start_date, end_date, reason) · deleteAbsence(userId, absenceId, isAdmin)
adminCreateEvent(user, fields) → event · adminUpdateEvent(id, fields) · adminDeleteEvent(id)
adminSetRole(pid, role) · adminSetInstruments(pid, ids[]) · adminToggleActive(pid, bool)
saveMyName(user, full_name)  // ⚠️ RLS: só admin edita profiles — não expor a membros
```
Erros → `toast(msg,'erro')` + `throw` (mensagem RLS vira "Sem permissão…").

## CONTRATO UI

- `ui.js`: `$ $$ esc fmtWhen(s,e) fmtDay isPast relDay toast(msg,'ok'|'erro') statusLevel(row)→critico|alerta|ok statusBadge(row) statusReasons(row)→[txt] avatar(name,size) instNames(list) confirmLabel(status)`
- CSS pronto: `.card(.clickable .row .grow)` `.chip(.inst)` `.badge .b-critico .b-alerta .b-ok .b-pend` `.avatar` `.btn(.primary .danger .ghost .small .on)` `label.field>span` `.form-grid(.full) .form-actions` `.inst-picks label(input checkbox)` `.list-row(.grow)` `.empty(.big)` `.loading` `.toast` `.cal-head .cal-grid(.dow .cal-cell(.other .today .dn) .cal-ev .e-critico .e-alerta .e-ok)`
- **app.html** (escrever): `#boot.loading` → `#topbar.topbar` (logo+title+`#user-chip`) → `#shell.app` contendo `#sidebar.sidebar` (`a[data-route]`, admin com `.admin-only`) + `#view.content` → `#bottomnav.bottomnav` (`a[data-route] .ic`) → `<script type="module" src="/js/app.js">`
- **app.js**: `boot()` sessão→perfil via `supabase.from('profiles').eq('id', ME.id).maybeSingle()` (⚠️ client.js **não** exporta `currentProfile`); `window.ME`; rotas `#/nome` e `#/evento/:id`; views exportam `{ render(el, arg) }` async; rotas: `meu-agenda` (default) `dashboard` `calendario` `evento` `membros` `perfil` `admin`
- **login.js**: `index.html` carrega `/js/login.js`; ids `#google-area #btn-google #email-area #form-login #li-email #li-pass #btn-login #btn-signup #li-msg`; local = `IS_LOCAL_ENV` (⚠️ **não** existe `ENV.provider` — era do app/ legado); Google via `googleOAuthUrl()`; `signUp` com `options.data.full_name` (trigger lê `raw_user_meta_data->>'full_name'`)
- **RLS**: membros só escrevem `event_members`/`event_member_instruments`/`absences` **próprias**; resto = admin. "Meus instrumentos" no Perfil = **read-only** (admin gerencia)

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