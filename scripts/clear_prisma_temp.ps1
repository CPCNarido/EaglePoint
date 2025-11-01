# Remove temporary/prisma query_engine temp files that can block `prisma generate` on Windows
# Usage: run from repo root in an elevated PowerShell if necessary.
$clientDir = Join-Path -Path (Join-Path -Path (Get-Location) -ChildPath 'Backend') -ChildPath 'node_modules\\.prisma\\client'
if (-Not (Test-Path $clientDir)) {
  Write-Host "Prisma client path not found: $clientDir"
  Write-Host "Search for query_engine-* temp files (anywhere under Backend)..."
  $found = Get-ChildItem -Path "Backend" -Recurse -Filter "query_engine*" -ErrorAction SilentlyContinue
} else {
  $found = Get-ChildItem -Path $clientDir -Filter "query_engine*" -ErrorAction SilentlyContinue
}
if (!$found) {
  Write-Host "No query_engine temp files found."
  exit 0
}
foreach ($f in $found) {
  try {
    Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
    Write-Host "Removed: $($f.FullName)"
  } catch {
    Write-Warning "Failed to remove $($f.FullName): $_"
  }
}
Write-Host "Cleanup complete. Now run 'npx prisma generate' in Backend (see prisma_reconcile.ps1)."