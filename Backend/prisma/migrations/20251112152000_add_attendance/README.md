# Migration `20251112152000_add_attendance`

This SQL migration creates the `Attendance` table with a unique constraint on (employee_id, date), an index on date, and a foreign key to `Employee(employee_id)`.

Apply this migration by running Prisma Migrate in your backend folder:

```powershell
cd Backend
# optionally stop any running backend/Node processes and pause OneDrive
npx prisma migrate deploy
```

If you use `prisma migrate dev` in development, run:

```powershell
npx prisma migrate dev --name add-attendance
```

Note: If your migration history has drift (Prisma reported drift), prefer using `prisma db pull` to refresh `schema.prisma` or run `prisma migrate resolve` as appropriate. See project README or consult the author before applying in production.
