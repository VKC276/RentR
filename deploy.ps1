# Deploy RentR Worker (wrangler.jsonc lives in repo root).
$nodeDir = 'C:\Program Files\nodejs'
if (Test-Path $nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
}

Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js hittades inte. Installera från https://nodejs.org och starta om terminalen.'
  exit 1
}

Write-Host "Node $(node -v)"
npm run deploy
