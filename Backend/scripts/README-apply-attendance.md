# Apply Attendance migration (safe db-pull + dev-migrate flow)

This folder contains two helper scripts to apply the Attendance schema:

- `apply_attendance_via_pull.ps1` — safe flow: introspect current DB schema (`prisma db pull`), ensure `Attendance` model exists in `schema.prisma`, then run `prisma migrate dev --name add-attendance` and `prisma generate`.
- `apply_attendance_migration.ps1` — (earlier) direct deploy style that attempts `prisma migrate deploy` after removing possible file locks.

Recommended usage (development / shared DB where you cannot drop data):

1. Open PowerShell as Administrator.
2. From the repo root run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Backend\scripts\apply_attendance_via_pull.ps1
```

3. Review the generated migration under `Backend/prisma/migrations`. Commit the migration SQL and `prisma/schema.prisma` changes.

Notes:
- The script will stop Node and OneDrive processes (best-effort) to avoid Windows file-locks when Prisma generates the client.
- Always back up your DB before applying migrations to production. Use your managed DB provider (Aiven) or `pg_dump`.
- If `prisma migrate dev` reports drift that cannot be resolved, consider using `prisma db pull` then reconciling schema manually, or consult with the repository owner.
