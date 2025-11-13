# Safe variant: introspect DB then create dev migration for Attendance
# Usage: Run from repo root in an elevated PowerShell
#   powershell -ExecutionPolicy Bypass -File .\Backend\scripts\apply_attendance_via_pull.ps1

param(
  [switch]$Force
)

Set-StrictMode -Version Latest

Write-Host "Starting safe Attendance migration flow (db pull -> migrate dev)" -ForegroundColor Cyan

# Stop Node processes and OneDrive to avoid file locks
Try { Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force } Catch { }
Try { Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force } Catch { }

# Work in Backend folder
Push-Location .\Backend

# Pull current DB schema into schema.prisma
Write-Host "Running: npx prisma db pull" -ForegroundColor Cyan
Try {
  npx prisma db pull
} Catch {
  Write-Host "prisma db pull failed: $_" -ForegroundColor Red
  Pop-Location
  exit 1
}

$schemaPath = Join-Path (Get-Location) 'prisma\schema.prisma'
if (-not (Test-Path $schemaPath)) {
  Write-Host "schema.prisma not found at $schemaPath" -ForegroundColor Red
  Pop-Location
  exit 1
}

$schema = Get-Content $schemaPath -Raw
if ($schema -match "model\s+Attendance\s+{") {
  Write-Host "Attendance model already present in schema.prisma" -ForegroundColor Green
} else {
  Write-Host "Attendance model not found — appending model block to schema.prisma" -ForegroundColor Yellow
  $model = @'

model Attendance {
  attendance_id Int      @id @default(autoincrement())
  employee_id   Int
  date          DateTime @db.Date
  clock_in      DateTime?
  clock_out     DateTime?
  source        String?
  notes         String?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  employee Employee @relation(fields: [employee_id], references: [employee_id])

  @@unique([employee_id, date])
  @@index([date])
}
'@
  Add-Content -Path $schemaPath -Value $model -Encoding utf8
  Write-Host "Appended Attendance model to schema.prisma" -ForegroundColor Green
}

# Format schema
Write-Host "Running: npx prisma format" -ForegroundColor Cyan
Try { npx prisma format } Catch { Write-Host "prisma format failed: $_" -ForegroundColor Yellow }

# Create a new migration based on the pulled schema + Attendance model
Write-Host "Running: npx prisma migrate dev --name add-attendance" -ForegroundColor Cyan
Try {
  npx prisma migrate dev --name add-attendance
} Catch {
  Write-Host "prisma migrate dev failed: $_" -ForegroundColor Red
  Write-Host "If migrate dev reports drift or asks to reset, consider backing up the DB first or use 'prisma migrate resolve'." -ForegroundColor Yellow
  Pop-Location
  exit 1
}

# Generate client
Write-Host "Running: npx prisma generate" -ForegroundColor Cyan
Try { npx prisma generate } Catch { Write-Host "prisma generate failed: $_" -ForegroundColor Red }

Pop-Location
Write-Host "Safe Attendance migration flow completed. Review migration files under prisma/migrations and commit them." -ForegroundColor Green
