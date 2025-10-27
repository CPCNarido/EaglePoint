// Seed script to ensure bays 1..45 exist in the database (idempotent)
// If a bay exists as 'B1'..'B45' this script will rename it to '1'..'45'.
// Run from Backend folder:
//   npm run seed:bays

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    console.log('Seeding bays 1..45 (rename B# -> # if needed)...');
    for (let i = 1; i <= 45; i++) {
      const numeric = `${i}`;
      const bPref = `B${i}`;
      try {
        // If numeric already exists, nothing to do
        const existsNumeric = await prisma.bay.findFirst({ where: { bay_number: numeric } });
        if (existsNumeric) {
          console.log('Exists', numeric);
          continue;
        }

        // If a B-prefixed bay exists, rename it to numeric
        const existsB = await prisma.bay.findFirst({ where: { bay_number: bPref } });
        if (existsB) {
          // primary key is bay_id in schema
          await prisma.bay.update({ where: { bay_id: existsB.bay_id }, data: { bay_number: numeric } });
          console.log('Renamed', bPref, '->', numeric);
          continue;
        }

        // Otherwise create numeric bay
        await prisma.bay.create({ data: { bay_number: numeric, status: 'Available' } });
        console.log('Created', numeric);
      } catch (err) {
        console.error('Error seeding', numeric, err && err.message ? err.message : err);
      }
    }
    console.log('Seeding complete.');
  } catch (err) {
    console.error('Fatal:', err);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
