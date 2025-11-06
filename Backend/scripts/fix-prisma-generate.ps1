<#
Fix helper for Prisma generate EPERM on Windows.

This script will:
- attempt to stop OneDrive (if running)
- stop Node and VS Code processes that commonly lock files
- remove the generated Prisma client folder and any tmp query engine dll files
- optionally run `npx prisma generate` at the end (pass -Generate)

Usage (from repository root):
  # Run cleanup only
  powershell -ExecutionPolicy Bypass -File .\Backend\scripts\fix-prisma-generate.ps1

  # Run cleanup and then run prisma generate
  powershell -ExecutionPolicy Bypass -File .\Backend\scripts\fix-prisma-generate.ps1 -Generate

NOTE: This script forcibly stops processes and deletes files. Close important apps first.
#>

param(
  [switch]$Generate
)

Set-StrictMode -Version Latest

function Stop-IfRunning($name) {
  $p = Get-Process -Name $name -ErrorAction SilentlyContinue
  if ($p) {
    Write-Host "Stopping process(es): $name (pid: $($p.Id -join ', '))"
    $p | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "=== Prisma generate fix helper ==="

# 1) Try to stop OneDrive gracefully (if installed)
if (Get-Command -ErrorAction SilentlyContinue .\scripts\stop_onedrive.ps1) {
  try {
    Write-Host "Running existing stop_onedrive.ps1 script (if present)..."
    & .\scripts\stop_onedrive.ps1
  } catch {
    Write-Host "stop_onedrive.ps1 failed or not present; attempting to stop OneDrive process directly..."
    Stop-IfRunning "OneDrive"
  }
} else {
  Stop-IfRunning "OneDrive"
}

# 2) Kill Node and VS Code processes that commonly hold file handles
Stop-IfRunning "node"
Stop-IfRunning "Code"    # VS Code (may be 'Code' or 'Code.exe')
Stop-IfRunning "Code - OSS" -ErrorAction SilentlyContinue

# 3) Remove prisma client tmp files and client folder
$clientPath = Join-Path -Path (Resolve-Path .\Backend) -ChildPath "node_modules\.prisma\client"
if (Test-Path $clientPath) {
  try {
    Write-Host "Removing Prisma client folder: $clientPath"
    Remove-Item -Recurse -Force -LiteralPath $clientPath -ErrorAction Stop
  } catch {
    Write-Host "Failed to remove client folder (maybe locked): $($_.Exception.Message)"
  }
}

# Also try removing leftover tmp dll files if present under Backend
$tmpFiles = Get-ChildItem -Path .\Backend\node_modules\.prisma\client -Filter 'query_engine-windows.dll.node.tmp*' -ErrorAction SilentlyContinue
if ($tmpFiles) {
  foreach ($f in $tmpFiles) {
    try {
      Write-Host "Removing tmp file: $($f.FullName)"
      Remove-Item -Force -LiteralPath $f.FullName -ErrorAction Stop
    } catch {
      Write-Host "Could not remove tmp file $($f.FullName): $($_.Exception.Message)"
    }
  }
}

Write-Host "Cleanup finished. If you still see file lock errors, rebooting Windows often clears lingering handles."

if ($Generate) {
  Write-Host "Running: npx prisma generate (from Backend folder)..."
  Push-Location .\Backend
  try {
    npx prisma generate
  } catch {
    Write-Host "npx prisma generate failed: $($_.Exception.Message)"
  }
  Pop-Location
}

Write-Host "Done. If you didn't pass -Generate, run 'npx prisma generate' from the Backend folder now (preferably in an elevated/admin PowerShell)."
