# Installs PostgreSQL 16 locally for development and writes server/.env.
# Generates a random local-only password so it never has to be typed or shared.
# Usage (from the repo root):  & .\scripts\install-postgres-windows.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'server\.env'

$chars = [char[]]'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$password = -join (1..20 | ForEach-Object { $chars | Get-Random })

Write-Host 'Installing PostgreSQL 16 (approve the Windows admin prompt if it appears)...' -ForegroundColor Cyan
winget install -e --id PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements `
  --override "--mode unattended --unattendedmodeui minimal --superpassword $password --serverport 5432 --disable-components stackbuilder"
if ($LASTEXITCODE -ne 0) { throw "winget failed with exit code $LASTEXITCODE" }

$secret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
@"
# Local settings (git-ignored, never committed).
DATABASE_URL="postgresql://postgres:$password@localhost:5432/postgres"
JWT_SECRET=$secret
CLINIC_TZ=Asia/Kolkata
PORT=4000
"@ | Out-File -Encoding ascii $envFile

Write-Host "PostgreSQL installed. Connection string written to $envFile" -ForegroundColor Green
