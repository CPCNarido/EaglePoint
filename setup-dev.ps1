<#
  setup-dev.ps1

  Usage examples:
    # interactive (prompts for DB URL + session secret), install deps and start services:
    powershell -ExecutionPolicy Bypass -File .\setup-dev.ps1 -StartServices

    # pass DB URL and session secret, install only (don't start services):
    powershell -ExecutionPolicy Bypass -File .\setup-dev.ps1 -DbUrl "postgres://user:pass@host:5432/db" -SessionSecret "change-me" -InstallOnly

  Notes:
   - This is for development convenience. Do NOT use DEV_ALLOW_SELF_SIGNED_TLS or commit secrets in production.
   - If Node/npm are not installed, the script will stop and show instructions to install Node.js.
#>

param(
  [string]$DbUrl,
  [string]$SessionSecret,
  [switch]$InstallOnly,       # if set, only run npm install steps (don't start servers)
  [switch]$StartServices,     # if set, start backend and frontend after install
  [switch]$SeedTestAccounts   # if set, run Backend/scripts/add-test-accounts.js after install
)

function Check-CommandExists($cmd) {
  $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

Write-Host "`n=== EaglePoint dev setup helper ===`n"

if (-not (Check-CommandExists 'node')) {
  Write-Error "node is not installed or not in PATH. Install Node.js (https://nodejs.org/) and re-run this script."
  exit 1
}
if (-not (Check-CommandExists 'npm')) {
  Write-Error "npm is not installed or not in PATH. Install Node.js (includes npm) and re-run this script."
  exit 1
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $root 'Backend'))) {
  Write-Error "Can't find Backend folder under $root. Run this script from the project root."
  exit 1
}
if (-not (Test-Path (Join-Path $root 'Frontend'))) {
  Write-Warning "Frontend folder not found. The script will still install Backend dependencies."
}

# Prompt for DATABASE_URL and SESSION_SECRET if not provided
if (-not $DbUrl) {
  $DbUrl = Read-Host "Enter DATABASE_URL (postgres://user:pass@host:5432/db). Leave blank to skip DB-dependent steps"
}
if (-not $SessionSecret) {
  $SessionSecret = Read-Host "Enter a SESSION_SECRET (dev only). Press Enter to auto-generate"
  if (-not $SessionSecret) {
    $SessionSecret = [guid]::NewGuid().ToString()
    Write-Host "Generated SESSION_SECRET: $SessionSecret"
  }
}

# 1) Install dependencies
Write-Host "`n-> Installing backend dependencies..."
Push-Location (Join-Path $root 'Backend')
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed in Backend" }
Pop-Location

if (Test-Path (Join-Path $root 'Frontend')) {
  Write-Host "`n-> Installing frontend dependencies..."
  Push-Location (Join-Path $root 'Frontend')
  npm install
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed in Frontend" }
  Pop-Location
}

# 2) Create .env in Backend if not exists (minimal)
$envPath = Join-Path $root 'Backend\.env'
if (-not (Test-Path $envPath)) {
  if ($DbUrl) {
    Write-Host "`n-> Creating Backend\\.env (development helper)."
    $envContent = @()
    $envContent += "DATABASE_URL=$DbUrl"
    $envContent += "SESSION_SECRET=$SessionSecret"
    # development helper — you may set DEV_ALLOW_SELF_SIGNED_TLS=1 when connecting to Aiven in dev
    $envContent += "DEV_ALLOW_SELF_SIGNED_TLS=1"
    $envContent += "DEV_LOGIN_EMAIL=admin"
    $envContent += "DEV_LOGIN_PASSWORD=ChangeMe123!"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8
    Write-Host "  -> Written $envPath"
  } else {
    Write-Warning "DATABASE_URL not provided; skipping automatic .env creation. Create Backend\\.env manually if needed."
  }
} else {
  Write-Host "`n-> Backend\\.env already exists; leaving it unchanged."
}

# 3) Optionally seed test accounts
if ($SeedTestAccounts) {
  if (-not $DbUrl) {
    Write-Warning "Cannot run seed script without DATABASE_URL. Provide -DbUrl or create Backend\\.env."
  } else {
    Write-Host "`n-> Seeding test accounts..."
    Push-Location (Join-Path $root 'Backend')
    # Use environment var override for TLS helper; set in process to let node scripts use it
    $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
    node .\scripts\add-test-accounts.js
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Seeding test accounts failed" }
    Pop-Location
    Remove-Variable NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
  }
}

if ($InstallOnly) {
  Write-Host "`nInstall-only requested; finished installation steps. Run the servers manually when ready."
  exit 0
}

# 4) Start services if requested (background)
if ($StartServices) {
  Write-Host "`n-> Starting backend (dev) in background..."
  Push-Location (Join-Path $root 'Backend')

  # Ensure DEV_ALLOW_SELF_SIGNED_TLS exists so main.ts can set NODE_TLS_REJECT_UNAUTHORIZED
  $env:DEV_ALLOW_SELF_SIGNED_TLS = '1'
  # Start backend as a detached process so the script can exit after launching
  Start-Process -FilePath 'npm' -ArgumentList 'run','start:dev' -WorkingDirectory (Get-Location) -NoNewWindow
  Pop-Location

  if (Test-Path (Join-Path $root 'Frontend')) {
    Write-Host "`n-> Starting frontend (npm start) in background..."
    Push-Location (Join-Path $root 'Frontend')
    Start-Process -FilePath 'npm' -ArgumentList 'start' -WorkingDirectory (Get-Location) -NoNewWindow
    Pop-Location
  }

  Write-Host "`nAll requested services started. Check their logs in their respective terminals or run 'npm run start:dev' in Backend and 'npm start' in Frontend for foreground output."
} else {
  Write-Host "`nDone. To start servers manually run in separate terminals:"
  Write-Host "  cd Backend"
  Write-Host "  $env:DEV_ALLOW_SELF_SIGNED_TLS='1'; npm run start:dev  # dev-only"
  Write-Host ""
  Write-Host "  cd Frontend"
  Write-Host "  npm start"
}

Write-Host "`nSetup script finished."