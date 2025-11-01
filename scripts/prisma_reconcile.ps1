<#
This helper script runs a recommended, safe reconciliation workflow for Prisma when the DB schema exists
but migration history is missing ("drift detected").

Usage (from repo root):
  # Non-destructive (recommended): pulls DB schema, creates a single create-only migration you can inspect
  .\scripts\prisma_reconcile.ps1

  # If you want to reset the DB (destructive), pass -Reset
  .\scripts\prisma_reconcile.ps1 -Reset

Notes:
- This script requires `npx prisma` available. Run it from the repository root.
- It will not automatically mark migrations as applied; it shows the commands to run to mark them.
- Run `npx prisma generate` after completing the steps.
#>
param(
  [switch]$Reset
)

if ($Reset) {
  Write-Host "*** DESTRUCTIVE: running prisma migrate reset --force (drops DB)." -ForegroundColor Yellow
  Write-Host "If you really want this, run the script again with -Reset. Exiting now." -ForegroundColor Red
  exit 1
}

Write-Host "Pulling current DB schema into prisma/schema.prisma..."
pushd Backend
try {
  npx prisma db pull
  Write-Host "Creating a create-only migration named 'baseline_from_db' (will not apply)."
  npx prisma migrate dev --create-only --name baseline_from_db
  Write-Host "If the migration folder was created (check prisma/migrations), you can mark it as applied:
  npx prisma migrate resolve --applied <migration-folder-name>"
  Write-Host "Finally run: npx prisma generate"
} catch {
  Write-Warning "Command failed: $_"
} finally {
  popd
}
Write-Host "Script finished. Inspect migration files before marking them applied or resetting."