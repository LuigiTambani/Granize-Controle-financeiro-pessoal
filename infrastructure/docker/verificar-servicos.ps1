$ErrorActionPreference = "Stop"
$servicesRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $servicesRoot
try {
  docker compose --env-file .env ps
  Write-Host ""
  Write-Host "Granize: http://localhost:3000"
  Write-Host "n8n: http://localhost:5678"
  Write-Host "Evolution: http://localhost:8080"
  Write-Host "Emails de teste: http://localhost:8025"
} finally {
  Pop-Location
}
