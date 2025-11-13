# PowerShell helper to prepare environment and run Prisma migrations for Attendance
# WARNING: This script will stop Node and OneDrive processes on this machine (best-effort).
# Run this script from the repository root as Administrator: Open PowerShell 'Run as Administrator'.

param(
  [switch]$Force
)

Set-StrictMode -Version Latest

Write-Host "Preparing to apply Attendance migration..." -ForegroundColor Cyan

# Stop Node processes (dev servers) that may lock .prisma client
Try {
  $nodes = Get-Process node -ErrorAction SilentlyContinue
  if ($nodes) {
    Write-Host "Stopping Node processes..." -ForegroundColor Yellow
    $nodes | Stop-Process -Force
  }
} Catch {
  Write-Host "No Node processes found or failed to stop: $_" -ForegroundColor Yellow
}

# Stop OneDrive (if present)
Try {
  $od = Get-Process OneDrive -ErrorAction SilentlyContinue
  if ($od) {
    Write-Host "Stopping OneDrive..." -ForegroundColor Yellow
    $od | Stop-Process -Force
  }
} Catch {
  Write-Host "No OneDrive process found or failed to stop: $_" -ForegroundColor Yellow
}

# Remove prisma client temp files to avoid EPERM rename issues
$prismaClientDir = Join-Path -Path (Resolve-Path -Path .\Backend) -ChildPath "node_modules\.prisma\client"
if (Test-Path $prismaClientDir) {
  Write-Host "Removing existing prisma client folder (if any)..." -ForegroundColor Yellow
  Try {
    Remove-Item -Recurse -Force -Path $prismaClientDir -ErrorAction Stop
  } Catch {
    Write-Host "Failed to remove prisma client dir: $_" -ForegroundColor Red
    if (-not $Force) { Write-Host "Rerun with -Force or close programs that may lock files."; exit 1 }
  }
}

# Format schema
Write-Host "Formatting Prisma schema..." -ForegroundColor Cyan
Push-Location .\Backend
Try { npx prisma format } Catch { Write-Host "prisma format failed: $_" -ForegroundColor Red }

# Generate client
Write-Host "Generating Prisma client..." -ForegroundColor Cyan
Try {
  npx prisma generate
} Catch {
  Write-Host "prisma generate failed: $_" -ForegroundColor Red
  Pop-Location
  exit 1
}

# Run migrate (dev mode will prompt if drift). For production, use deploy.
Write-Host "Applying migrations (prisma migrate deploy)..." -ForegroundColor Cyan
Try {
  npx prisma migrate deploy
} Catch {
  Write-Host "prisma migrate deploy failed: $_" -ForegroundColor Red
  Write-Host "If you are developing locally and willing to reset the DB, consider running 'npx prisma migrate reset' instead." -ForegroundColor Yellow
  Pop-Location
  exit 1
}

Pop-Location
Write-Host "Migration process finished. Restart your backend server if needed." -ForegroundColor Green
