<#
Automated helper to reset the development database and run seed scripts.

USAGE (from repository root):
  # Run with elevated PowerShell (recommended)
  powershell -ExecutionPolicy Bypass -File .\Backend\scripts\reset-and-seed.ps1

What the script does:
  1. Runs the cleanup helper to stop OneDrive/Node/VSCode and remove Prisma client tmp files.
  2. Resets the database (drops and recreates) using `npx prisma migrate reset --force`.
  3. Runs `npx prisma generate` to regenerate the client.
  4. Executes a set of seed scripts found in `Backend/scripts/` (best-effort; continues on errors).

WARNING: This will DROP your development database and all data will be lost. Do NOT run against production.
#>

Set-StrictMode -Version Latest

function Run-Command($cmd, $workingDir = '.') {
  Write-Host "\n> Running: $cmd (in $workingDir)"
  $proc = Start-Process -FilePath pwsh -ArgumentList "-NoProfile","-NonInteractive","-Command","Set-Location -LiteralPath '$workingDir'; $cmd" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
  if ($proc.ExitCode -ne 0) {
    Write-Host "Command exited with code $($proc.ExitCode)"
    return $false
  }
  return $true
}

$repoRoot = (Resolve-Path .).ProviderPath
$backend = Join-Path $repoRoot 'Backend'

Write-Host "Reset-and-seed starting (Backend folder: $backend)"

# 1) Cleanup helper (stop OneDrive, node, VS Code, remove tmp files)
Write-Host "Step 1: Running Prisma cleanup helper"
try {
  powershell -ExecutionPolicy Bypass -File .\Backend\scripts\fix-prisma-generate.ps1
} catch {
  Write-Host "Cleanup helper failed or returned error: $($_.Exception.Message)"
}

# 2) Reset DB (destructive)
Write-Host "Step 2: Resetting database (this will DROP all data)."
Push-Location $backend
try {
  # Use --force to avoid interactive prompt in scripted runs
  $res = & npx prisma migrate reset --force
  Write-Host $res
} catch {
  Write-Host "prisma migrate reset failed: $($_.Exception.Message)"
  Pop-Location
  exit 1
}

# 3) Regenerate Prisma client
Write-Host "Step 3: Regenerating Prisma client"
try {
  & npx prisma generate
} catch {
  Write-Host "prisma generate failed: $($_.Exception.Message)"
  Pop-Location
  exit 1
}

# 4) Run seed scripts (best-effort)
Write-Host "Step 4: Running seed scripts (best-effort, errors will not stop the script)"
$seedScripts = @(
  'seed-test-accounts.js',
  'seed-bays.js',
  'seed-test-data.js',
  'seed-test-notif-bay.js',
  'reset-and-seed-bays.js',
  'post-test-staff.js',
  'post-test-staff.js'
)

foreach ($s in $seedScripts) {
  $path = Join-Path $backend "scripts\$s"
  if (Test-Path $path) {
    Write-Host "Running seed: $s"
    try {
      & node $path
    } catch {
      Write-Host "Seed $s failed: $($_.Exception.Message)"
    }
  } else {
    Write-Host "Seed script not found (skipping): $s"
  }
}

Pop-Location

Write-Host "Reset-and-seed completed. Verify with 'npx prisma studio' or your app start command."
