// Check for open assignments for a given bay and inspect specific player ids
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
    const openAssignments = await prisma.bayAssignment.findMany({ where: { bay_id: bay.bay_id, open_time: true }, include: { player: true, dispatcher: true, transactions: true } });
    const anyOpen = openAssignments && openAssignments.length > 0;
    console.log('Bay:', bay);
    console.log('Has open assignments:', anyOpen);
    if (anyOpen) console.log(JSON.stringify(openAssignments, null, 2));

    // Additionally inspect player 2139 if present in overviewEntry we saw earlier
    const playerId = 2139;
    const p = await prisma.player.findUnique({ where: { player_id: playerId } }).catch(() => null);
    console.log('Player 2139:', p);
    const assignmentsForPlayer = await prisma.bayAssignment.findMany({ where: { player_id: playerId }, include: { bay: true, dispatcher: true } }).catch(() => []);
    console.log('Assignments for player 2139:', JSON.stringify(assignmentsForPlayer, null, 2));
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
}

main();
