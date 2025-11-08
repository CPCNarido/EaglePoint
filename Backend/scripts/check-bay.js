// Quick DB check script: prints Bay and most recent BayAssignment for a given bay_number
// Usage: node scripts/check-bay.js <bay_number>

const { PrismaClient } = require('@prisma/client');

async function main() {
  const bayNumber = process.argv[2] || '1';
  const prisma = new PrismaClient();
  try {
    const bay = await prisma.bay.findFirst({ where: { bay_number: String(bayNumber) } });
    if (!bay) {
      console.log(JSON.stringify({ ok: false, error: 'Bay not found', bayNumber }));
      return;
    }
    const assignment = await prisma.bayAssignment.findFirst({
      where: { bay_id: bay.bay_id },
      include: { player: true },
      orderBy: { assigned_time: 'desc' },
    });
    console.log(JSON.stringify({ ok: true, bay: bay, assignment: assignment }, null, 2));
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
}

main();
