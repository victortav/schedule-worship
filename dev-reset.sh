#!/usr/bin/env bash
# Zera TUDO: para os containers e apaga os dados (banco + arquivos de storage)
set -euo pipefail
cd "$(dirname "$0")/supabase-local"

docker compose \
  -f docker-compose.yml \
  -f docker-compose.app.yml \
  down -v

rm -rf volumes/db/data volumes/db/pgdata volumes/storage/*

echo "✔ Ambiente zerado. Rode ./dev-up.sh para começar do zero."