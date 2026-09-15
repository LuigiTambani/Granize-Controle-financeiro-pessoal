$ErrorActionPreference = "Stop"
$servicesRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $servicesRoot
try {
  docker compose --env-file .env down
} finally {
  Pop-Location
}
