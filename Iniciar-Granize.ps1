$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpm) { throw "Instale o Node.js e o pnpm antes de iniciar o Granize." }

$servicesScript = Join-Path $root "infrastructure\docker\iniciar-servicos.ps1"
if (Test-Path $servicesScript) {
  & $servicesScript -SkipPull
}

$alreadyRunning = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $alreadyRunning) {
  $logOut = Join-Path $root ".granize-web.log"
  $logError = Join-Path $root ".granize-web-error.log"
  Start-Process -FilePath $pnpm.Source -ArgumentList "dev" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logError
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw "O Granize demorou para iniciar. Consulte .granize-web-error.log na pasta do projeto." }
}

Start-Process "http://localhost:3000"
Write-Host "Granize aberto em http://localhost:3000" -ForegroundColor Green
Write-Host "Se o Windows bloquear o aviso, escolha Permitir para receber seus lembretes." -ForegroundColor Cyan
