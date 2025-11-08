const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Checking information_schema for columns named end_time...');
    const cols = await prisma.$queryRawUnsafe(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE column_name='end_time' AND table_schema='public'`);
    if (!cols || !cols.length) {
      console.log('No columns named end_time found in public schema. Exiting.');
      process.exit(0);
    }

    // Find the player table (case-insensitive)
    const playerRow = cols.find((r) => String(r.table_name).toLowerCase() === 'player');
    console.log('Candidates:', cols);
    if (!playerRow) {
      console.log('No table named "player" found among candidates. Exiting.');
      process.exit(0);
    }

    console.log(`Found table=${playerRow.table_name} is_nullable=${playerRow.is_nullable}`);
    if (String(playerRow.is_nullable).toUpperCase() === 'YES') {
      console.log('Column already nullable. Nothing to do.');
      process.exit(0);
    }

    // Perform ALTER TABLE to drop NOT NULL
    const tbl = playerRow.table_name;
    console.log(`Altering table ${tbl} to make column end_time nullable...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tbl}" ALTER COLUMN "end_time" DROP NOT NULL;`);

    console.log('ALTER TABLE completed. Verifying...');
    const verify = await prisma.$queryRawUnsafe(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name='end_time' AND table_schema='public'`, tbl);
    console.log('Verify result:', verify);
    console.log('Done.');
    process.exit(0);
  } catch (e) {
    console.error('Error while attempting to alter column:', e);
    process.exit(2);
  } finally {
    try { await prisma.$disconnect(); } catch (e) { }
  }
})();
