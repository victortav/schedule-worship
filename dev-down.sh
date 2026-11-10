#!/usr/bin/env bash
# Para todos os containers (mantém os dados em supabase-local/volumes)
set -euo pipefail
cd "$(dirname "$0")/supabase-local"

docker compose \
  -f docker-compose.yml \
  -f docker-compose.app.yml \
  down