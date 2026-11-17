# Sobe o ambiente local completo usando o Docker NATIVO do Windows (sem WSL).
Set-StrictMode -Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker nao encontrado no PATH. Abra o Docker Desktop e tente de novo.'
}

Push-Location 'supabase-local'
try {
  docker compose -f docker-compose.yml -f docker-compose.app.yml up -d
  if ($LASTEXITCODE -ne 0) { throw "docker compose up falhou (exit $LASTEXITCODE)." }
}
finally { Pop-Location }

@"

  Ambiente subindo!

  App (login):    http://localhost:3000
  Studio (admin): http://localhost:8000/   (usuario: supabase)
  API:            http://localhost:8000

  Usuarios de teste (senha: 123456):
    ana@teste.com (admin) | bruno@teste.com | carla@teste.com | diego@teste.com
    elisa@teste.com | felipe@teste.com | gabriela@teste.com | henrique@teste.com
"@ | Write-Host