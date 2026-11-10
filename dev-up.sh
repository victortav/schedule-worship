#!/usr/bin/env bash
# Sobe o ambiente local completo: Supabase + schema/seed + app web
# ATENÇÃO: o Docker roda no WSL — execute por:
#   wsl -e bash /mnt/c/Users/antonio.vneto/devel/schedule/dev-up.sh
set -euo pipefail
cd "$(dirname "$0")/supabase-local"

docker compose \
  -f docker-compose.yml \
  -f docker-compose.app.yml \
  up -d

cat <<'EOF'

  ✔ Ambiente subindo!

  App (login):   http://localhost:3000
  Studio (admin):http://localhost:8000/   (usuário: supabase)
  API:           http://localhost:8000

  Usuários de teste (senha: 123456):
    ana@teste.com (admin) · bruno@teste.com · carla@teste.com · diego@teste.com
    elisa@teste.com · felipe@teste.com · gabriela@teste.com · henrique@teste.com
EOF