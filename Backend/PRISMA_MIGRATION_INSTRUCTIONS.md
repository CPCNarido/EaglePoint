Prisma migration: add SystemLog.session_type

What changed
- `prisma/schema.prisma` now includes a nullable `session_type String?` field on the `SystemLog` model.

Why you must run a migration locally
- The code writes to `session_type` and the Prisma client types must match the database schema.
- After applying the migration you should regenerate the Prisma client so TypeScript types include `session_type` (you can then remove the temporary `@ts-ignore` in the LoggingService).

Recommended local steps (run from `Backend/`):

1. Inspect schema changes (optional):

   npx prisma format --schema=prisma/schema.prisma

2. Create and apply a migration (development DB):

   npx prisma migrate dev --name add-systemlog-session-type

   - This will create a new migration folder under `prisma/migrations/` and apply it to your local dev database.
   - If you use a production DB or CI, follow your normal migration workflow instead (e.g., `prisma migrate deploy`).

3. Regenerate the Prisma client:

   npx prisma generate

4. Rebuild the backend and run tests:

   npm run build
   npm run test

5. Cleanup (optional):
- Remove the temporary `@ts-ignore` and `as any` cast around the `systemLog.create` payload in `src/common/logging/logging.service.ts` and run `npm run build` again.

Notes and caveats
- If your DB enforces strict field names or non-null constraints, verify the migration SQL before applying.
- If you have CI/CD that runs migrations, apply the migration there (for production use `prisma migrate deploy`).
- If you cannot run the migration locally, the system will still operate but attempts to write `session_type` may fail at runtime if the DB schema is not updated.

If you want I can prepare a draft SQL migration file, but applying it to a database must be done by you (I don't have DB credentials in this environment).