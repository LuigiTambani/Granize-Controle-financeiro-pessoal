$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "O Granize já está fechado."
  exit 0
}
$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
  Stop-Process -Id $_ -ErrorAction SilentlyContinue
}
Write-Host "Granize fechado." -ForegroundColor Green
