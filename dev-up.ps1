# Sobe o ambiente local completo (o Docker roda no WSL — Ubuntu)
Set-StrictMode -Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$wslPath = & wslpath -u $PWD.Path
wsl -e bash "$wslPath\dev-up.sh"