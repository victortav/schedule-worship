# Para todos os containers (mantem os dados) - Docker NATIVO do Windows (sem WSL).
Set-StrictMode -Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker nao encontrado no PATH. Abra o Docker Desktop e tente de novo.'
}

Push-Location 'supabase-local'
try {
  docker compose -f docker-compose.yml -f docker-compose.app.yml down
  if ($LASTEXITCODE -ne 0) { throw "docker compose down falhou (exit $LASTEXITCODE)." }
}
finally { Pop-Location }