$ErrorActionPreference = "Stop"
$servicesRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $servicesRoot)
$envFile = Join-Path $servicesRoot ".env"
$appEnvFile = Join-Path $projectRoot ".env.local"

function New-GranizeSecret {
  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
}

function Read-DotEnv {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2] }
  }
  return $values
}

function Set-DotEnvValue {
  param([string]$Path, [string]$Name, [string]$Value)
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $Path) { foreach ($line in Get-Content $Path) { $lines.Add($line) } }
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

$values = Read-DotEnv $envFile
$secret = New-GranizeSecret
Set-DotEnvValue $envFile "EVOLUTION_WEBHOOK_SECRET" $secret
Set-DotEnvValue $appEnvFile "EVOLUTION_WEBHOOK_SECRET" $secret

$headers = @{ apikey = $values["EVOLUTION_API_KEY"] }
$instances = Invoke-RestMethod "http://localhost:8080/instance/fetchInstances" -Headers $headers -TimeoutSec 10
foreach ($instance in @($instances)) {
  $webhook = @{
    enabled = $true
    url = "http://host.docker.internal:3000/api/evolution/webhook?token=$secret"
    webhookByEvents = $false
    webhookBase64 = $false
    events = @("QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT")
  }
  $body = @{ webhook = $webhook } | ConvertTo-Json -Depth 5
  Invoke-RestMethod ("http://localhost:8080/webhook/set/" + [uri]::EscapeDataString($instance.name)) -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 15 | Out-Null
}

$secret = $null
Write-Output "WebhookSecretRotated=True"
