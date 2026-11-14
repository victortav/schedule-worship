# Zera TUDO: para os containers e apaga os dados - Docker NATIVO do Windows (sem WSL).
Set-StrictMode -Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker nao encontrado no PATH. Abra o Docker Desktop e tente de novo.'
}

Push-Location 'supabase-local'
try {
  docker compose -f docker-compose.yml -f docker-compose.app.yml down -v
  if ($LASTEXITCODE -ne 0) { throw "docker compose down -v falhou (exit $LASTEXITCODE)." }

  foreach ($p in @('volumes\db\data', 'volumes\db\pgdata')) {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force }
  }
  if (Test-Path -LiteralPath 'volumes\storage') {
    Get-ChildItem -LiteralPath 'volumes\storage' -Force |
      Where-Object { $_.Name -ne '.gitkeep' } |
      Remove-Item -Recurse -Force
  }
}
finally { Pop-Location }

Write-Host 'Ambiente zerado. Rode .\dev-up.ps1 para comecar do zero.'