const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$connect();
    // find a bay with status Available and no open assignments
    const bays = await prisma.bay.findMany({ select: { bay_id: true, bay_number: true, status: true } });
    for (const b of bays) {
      const openCount = await prisma.bayAssignment.count({ where: { bay_id: b.bay_id, open_time: true } });
      if (String(b.status) === 'Available' && openCount === 0) {
        console.log('FREE_BAY', b.bay_id, b.bay_number);
        process.exit(0);
      }
    }
    console.log('NO_FREE_BAY');
    process.exit(0);
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(2);
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
