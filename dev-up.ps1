# Sobe o ambiente local completo. Docker: Windows (Desktop) OU WSL; este wrapper usa WSL.
Set-StrictMode -Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$wslPath = & wslpath -u $PWD.Path
wsl -e bash "$wslPath\dev-up.sh"