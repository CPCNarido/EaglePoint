# Stop OneDrive (Windows). Run this PowerShell script as your user.
Write-Host "Attempting to stop OneDrive..."
try {
    Get-Process OneDrive -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Write-Host "OneDrive process stop attempted. If OneDrive restarts automatically, pause sync via the OneDrive UI."
} catch {
    Write-Warning "Could not stop OneDrive: $_"
}
Write-Host "Done."