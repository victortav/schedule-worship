# 🎛 STEERING — Gestão de contexto e de tarefas

> Objetivo: manter o contexto de trabalho pequeno o bastante para o resumo de compactação
> **não perder a linha**. Quem executa (agente ou dev humano) segue estas regras.
> **Regra 0:** `docs/TASKS.md` é a ÚNICA fonte de verdade (SOT). Se a informação está lá ou
> aqui, não reler código-fonte. Todo o resto é descartável.

## 1. TASKS.md como snapshot (atualizar a cada 1–2 passos)

- **Topo (10 primeiras linhas):** `▶ NEXT` = EXATAMENTE uma ação, com o comando exato.
- **Estado geral:** 1 linha por fase, `[x]/[~]/[ ]` (máx. 5 linhas).
- **O que fazer AGORA:** cada item = **1 arquivo OU 1 comando**, com expectativa pequena.
- **Log de progresso:** 1 linha por passo (hora + resultado + próximo).
- Tamanho: **máx. ~150 linhas**. Estourou → contratos detalhados vão para `ARQUITETURA.md`.

## 2. Granularidade de tarefa

1. Antes de começar: se uma tarefa implica >1 arquivo ou >1 comando, **dividir em
   subitens** (`1.9a`, `1.9b`, …) no TASKS.md.
2. Cada subitem deve ser verificável com **1 leitura ou 1 comando de saída curta**.
3. Se o MESMO passo falhar **2x**: registrar o diagnóstico em "Pegadinhas" do TASKS.md
   e dividir o passo ainda mais (não insistir no mesmo comando).

## 3. Orçamento de saída (custo real = o que se LÊ, não o que existe)

| Recurso | Limite |
|---|---|
| `read_files` | ≤ 60 linhas por chamada (usar `start_line`/`end_line`) |
| Logs | SOMENTE `-Tail 40` / `--tail 40`; nunca `Get-Content` inteiro |
| `dir` / listagens | só para localizar; nunca tree do projeto inteiro |
| Arquivos-fonte | reler só em debug (os contratos estão no TASKS.md) |
| Comando | saída esperada < 50 linhas; senão redirecionar p/ arquivo e ler em fatias |

- Comando **longo** (docker up/pull/build): rodar escrevendo em `docs/_*.log` e **não
  bloquear** esperando o terminal; checar depois com `-Tail`.
- Saída de `wsl` não chega pelo terminal → **sempre** redirecionar p/ `docs/_*.txt` e `read_files`.

## 4. Arquivos temporários (criar → usar → apagar)

- `docs/_*.txt` e `docs/_*.log` são descartáveis: **apagar no mesmo passo** após ler.
- Exceção: log de processo ainda rodando (manter; apontar o caminho no `▶ NEXT`).

## 5. Checklist ANTES da compactação (rodar proativamente com contexto ~70% cheio)

- [ ] TASKS.md atualizado: `▶ NEXT` (1 ação) + estado + 1 linha no log
- [ ] `docs/_*` que não estão em uso → apagados
- [ ] Processos rodando → anotados (comando + caminho do log) no TASKS.md
- [ ] Nenhum arquivo "meio editado" (toda edição salva e consistente)

## 6. Ambiente fixo (NUNCA redescobrir — espelho do § Pegadinhas do TASKS.md)

- Docker roda em **WSL** (Ubuntu = distro default), **não** no Docker Desktop.
- Do Windows: `.\dev-up.ps1` / `.\dev-down.ps1` / `.\dev-reset.ps1` (wrappers p/ WSL).
- URLs: app `:3000` · API/Studio `:8000` (login `supabase`/senha do `.env`) · PG `:5432`.
- Usuários teste: `ana@teste.com` (admin) · `bruno|carla|diego|elisa|felipe|gabriela|henrique@teste.com` · senha `123456`.
- `web/` = app canônico · `supabase-local/` = vendorizada (nossos: `.env`, `docker-compose.app.yml`, `volumes/web/`) · `supabase/schema.sql` + `seed.sql` = o "dump" que vai para a nuvem.