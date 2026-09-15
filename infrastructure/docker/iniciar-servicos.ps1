param(
  [switch]$SkipPull
)

$ErrorActionPreference = "Stop"
$servicesRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $servicesRoot ".env"
$projectRoot = Split-Path -Parent (Split-Path -Parent $servicesRoot)
$appEnvFile = Join-Path $projectRoot ".env.local"

function New-GranizeSecret {
  param([int]$Size = 32)
  $bytes = New-Object byte[] $Size
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
}

function Read-DotEnv {
  param([string]$Path)
  $values = @{}
  if (Test-Path $Path) {
    foreach ($line in Get-Content $Path) {
      if ($line -match '^\s*([^#=]+)=(.*)$') {
        $values[$matches[1].Trim()] = $matches[2]
      }
    }
  }
  return $values
}

function Set-DotEnvValue {
  param([string]$Path, [string]$Name, [string]$Value)
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $Path) {
    foreach ($line in Get-Content $Path) { $lines.Add($line) }
  }
  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^$([regex]::Escape($Name))=") {
      $lines[$index] = "$Name=$Value"
      $updated = $true
      break
    }
  }
  if (-not $updated) { $lines.Add("$Name=$Value") }
  [System.IO.File]::WriteAllLines($Path, $lines)
}

function Test-DockerReady {
  try {
    docker info 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if (-not (Test-Path $envFile)) {
  $postgresPassword = New-GranizeSecret 24
  $n8nEncryptionKey = New-GranizeSecret 32
  $sharedSecret = New-GranizeSecret 32
  $evolutionKey = New-GranizeSecret 32
  $evolutionWebhookSecret = New-GranizeSecret 32
  $content = @(
    "POSTGRES_USER=granize",
    "POSTGRES_PASSWORD=$postgresPassword",
    "N8N_ENCRYPTION_KEY=$n8nEncryptionKey",
    "N8N_SHARED_SECRET=$sharedSecret",
    "EVOLUTION_API_KEY=$evolutionKey",
    "EVOLUTION_WEBHOOK_SECRET=$evolutionWebhookSecret",
    "GRANIZE_SITE_URL=http://host.docker.internal:3000"
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($envFile, $content)
}

Set-DotEnvValue -Path $envFile -Name "GRANIZE_SITE_URL" -Value "http://host.docker.internal:3000"
$serviceValues = Read-DotEnv $envFile
Set-DotEnvValue -Path $appEnvFile -Name "EVOLUTION_API_URL" -Value "http://localhost:8080"
Set-DotEnvValue -Path $appEnvFile -Name "EVOLUTION_API_KEY" -Value $serviceValues["EVOLUTION_API_KEY"]
Set-DotEnvValue -Path $appEnvFile -Name "EVOLUTION_WEBHOOK_SECRET" -Value $serviceValues["EVOLUTION_WEBHOOK_SECRET"]
Set-DotEnvValue -Path $appEnvFile -Name "EVOLUTION_WEBHOOK_BASE_URL" -Value "http://host.docker.internal:3000"
Set-DotEnvValue -Path $appEnvFile -Name "GRANIZE_BOT_INSTANCE_NAME" -Value "granize-bot"
Set-DotEnvValue -Path $appEnvFile -Name "N8N_WEBHOOK_URL" -Value "http://localhost:5678/webhook/granize-evolution"
Set-DotEnvValue -Path $appEnvFile -Name "WHISPER_API_URL" -Value "http://localhost:8000"
Set-DotEnvValue -Path $appEnvFile -Name "WHISPER_MODEL" -Value "Systran/faster-whisper-small"
Set-DotEnvValue -Path $appEnvFile -Name "N8N_SHARED_SECRET" -Value $serviceValues["N8N_SHARED_SECRET"]

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop ainda não está disponível. Reinicie o Windows e execute este arquivo novamente."
}

if (-not (Test-DockerReady)) {
  $dockerDesktop = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
  if (-not (Test-Path $dockerDesktop)) {
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  }
  if (Test-Path $dockerDesktop) {
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 2
    if (Test-DockerReady) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "O Docker não iniciou. Abra o Docker Desktop, aceite os termos e tente novamente."
  }
}

Push-Location $servicesRoot
try {
  if (-not $SkipPull) {
    docker compose --env-file .env pull
  }
  docker compose --env-file .env up -d

  Write-Host ""
  Write-Host "Serviços do Granize iniciados." -ForegroundColor Green
  Write-Host "n8n: http://localhost:5678"
  Write-Host "Evolution: http://localhost:8080"
  Write-Host "Emails de teste: http://localhost:8025"
} finally {
  Pop-Location
}
