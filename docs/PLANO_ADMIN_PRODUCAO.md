# 🔐 Admin de sistema em PRODUÇÃO — bootstrap do 1º admin

> **Status:** ✅ DECIDIDO e IMPLEMENTADO (13/11) — opção **C** (allowlist de e-mails).
> Contexto: o app sobe "vazio" em produção (sem usuários, sem igrejas, sem admin). Como
> criar o **primeiro `system_admin`** para então criar igrejas e aprovar membros?
> Local **não** sofre disso: `seed.sql` já cria `ana@teste.com` como `system_admin`.

## 1. Situação atual (o que já existe)

- **Não há login de administrador separado.** O `system_admin` é um usuário comum
  (hoje só Google, em prod), cujo `profiles.role = 'system_admin'` (papel **global**).
  O admin de igreja é `church_members.role = 'admin'` (papel **por igreja**).
- O **único** bootstrap documentado é **manual, via SQL Editor do Supabase**
  (`README.md` §Deploy e `ARQUITETURA.md` §5.4):

  ```sql
  insert into public.churches (name) values ('Minha Igreja');
  update public.profiles set role = 'system_admin' where id = '<uuid-do-admin>';
  insert into public.church_members (church_id, profile_id, role)
    select c.id, '<uuid-do-admin>', 'admin' from public.churches c where c.name = 'Minha Igreja';
  ```

### Por que o Google sozinho não resolve (ovo e galinha)

- `handle_new_user()` (`supabase/schema.sql`, trigger em `auth.users`) cria o `profiles`
  no 1º login **sempre com `role='membro'`** (default da tabela).
- Sem igreja, o app entra mas `MY_CHURCHES` fica vazio / `ACTIVE_CHURCH` indefinido → UI "sem igreja".
- **Criar igreja** exige `is_system_admin()` (policy `churches_write`, `schema.sql`).
- **Virar system_admin pelo app** (`adminSetSystemAdmin` em `web/js/api.js`) esbarra em
  `profiles_write` → `admin_of_profile()`, que só é true para **`system_admin` ou admin de
  alguma igreja** → sem ninguém, impossível no app.

## 2. Opções avaliadas

| # | Opção | Como | Prós | Contras |
|---|---|---|---|---|
| **A** | Bootstrap manual no SQL Editor | Login 1x → pegar UUID → rodar o SQL acima | zero código, zero risco, alinhado ao RLS | passo manual ("segredo" operacional) |
| **B** | Promover no Table Editor | clicar `profiles.role='system_admin'` | mesmo princípio de A, mais visual | ainda manual |
| **C** | Script idempotente de bootstrap no deploy | `supabase/bootstrap.sql` promovendo um **e-mail do dono** fixo | automatiza o 1º admin; reprodutível | precisa definir o e-mail do dono |
| **D** | "1º usuário vira system_admin" (trigger) | trigger promove quem loga primeiro | zero passo manual | **arriscado** em prod (qualquer 1º login vira admin); só com cadastro fechado |
| **E** | Console/login de admin **separado** | provider e-mail/senha em prod + allowlist/flag + **Edge Function com `service_role`** | identidade de admin separada dos músicos; "produto" | mais trabalho; exige `service_role` (nunca no frontend) |

## 3. Recomendação

Para o cenário (igrejas, poucos admins, dono conhecido): **A + B**, com **C** como automação.

- Bootstrap 1x (SQL/C) para o **dono**;
- Depois, **tudo pelo app**: o `system_admin` cria igrejas e (via `admin_of_profile`)
  promove outros `system_admin` em `#/admin`.
- Se quiser **identidade de admin separada** (admin "técnico" que não é membro de igreja),
  ir para **E** como Edge Function com `service_role` — não como um 2º app.

## 4. Decisão e implementação — ✅ opção C (allowlist)

Modelo escolhido: **allowlist de e-mails**. Quem se cadastrar (ou já existir) com um
e-mail presente na allowlist vira **`system_admin` automaticamente**.

**Onde está:**
- `supabase/schema.sql`:
  - tabela `public.system_admin_allowlist (email text PK, created_at)` —
    **RLS habilitada SEM policies** (inacessível por `anon`/`authenticated`; só
    `service_role`/superuser escreve). E-mail sempre minúsculo (`check email = lower(email)`).
  - `handle_new_user()` agora insere o profile já com `role='system_admin'` se o e-mail
    estiver na allowlist (1º login).
  - trigger `on_allowlist_admin_added` + função `promote_allowlisted_admin()`: ao inserir
    um e-mail na allowlist, promove o usuário **já existente** (join com `auth.users`).
- `supabase/bootstrap.sql` (novo, idempotente): insere os e-mails da allowlist; faz **backfill**
  de `profiles` para quem logou antes do schema existir (trigger ainda não rodava) e um `update`
  promovendo as contas já existentes.

**Emails configurados:**
- `worshiper777@gmail.com`
- `victor.ufcg@gmail.com`

**Como aplicar em produção:**
1. Rodar `supabase/schema.sql` (SQL Editor do Supabase — cria/atualiza tudo, idempotente).
2. Rodar `supabase/bootstrap.sql` (SQL Editor — popula a allowlist).
3. Fazer login com um dos e-mails → já entra como `system_admin` → criar igrejas e
   promover outros admins pelo app (`#/admin`).
   - Se a conta já existir, o `bootstrap.sql`/trigger promove na hora.

**Observações:**
- Remover um e-mail da allowlist **não revoga** o `system_admin` (degrada só manualmente),
  por segurança/evitar acidentes.
- Local (dev) não roda `bootstrap.sql`: a allowlist local fica vazia e `ana@teste.com`
  continua admin via `seed.sql` (o fluxo comum local segue igual).
- `system_admin` pode criar igrejas e, via `admin_of_profile`, promover outros
  `system_admin` no app — não precisa mais voltar ao SQL Editor.

### Checklist
- [x] Modelo: **C** (allowlist).
- [x] E-mails definidos (`worshiper777@gmail.com`, `victor.ufcg@gmail.com`).
- [x] Script idempotente (`supabase/bootstrap.sql`).
- [x] `README.md` §Deploy e `ARQUITETURA.md` §5.4 atualizados.

## 5. Referências no código

- `supabase/schema.sql` — `profiles` (l.31 role), `handle_new_user` (l.143-153),
  helpers `is_system_admin/is_admin_of/admin_of_profile` (l.173-229),
  policies `churches_write` / `profiles_write` (l.292-313).
- `web/js/api.js` — `adminSetSystemAdmin` (~l.422), `fetchAllChurches` (~l.38).
- `web/js/app.js` — boot: sessão → perfil → igrejas; `isAdmin()` (~l.40).
- `README.md` (l.149-157) e `docs/ARQUITETURA.md` (§5.4, l.240-245) — bootstrap manual atual.
