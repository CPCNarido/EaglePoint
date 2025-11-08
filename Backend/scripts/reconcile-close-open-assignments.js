const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes('--apply');

(async () => {
  try {
    await prisma.$connect();
    console.log('Scanning for open assignments (open_time = true) ...');
    const openAssignments = await prisma.bayAssignment.findMany({ where: { open_time: true }, include: { bay: true, player: true } });
    if (!openAssignments || openAssignments.length === 0) {
      console.log('No open assignments found.');
      return process.exit(0);
    }

    // Group by bay
    const byBay = new Map();
    for (const a of openAssignments) {
      const key = `${a.bay_id}:${a.bay?.bay_number ?? 'unknown'}`;
      if (!byBay.has(key)) byBay.set(key, []);
      byBay.get(key).push(a);
    }

    console.log(`Found ${openAssignments.length} open assignment(s) across ${byBay.size} bay(s):`);
    for (const [k, arr] of byBay.entries()) {
      console.log(`  ${k} -> ${arr.length} assignment(s)`);
      for (const a of arr) console.log(`    assignment_id=${a.assignment_id} player=${a.player?.player_id ?? 'null'} nickname=${a.player?.nickname ?? 'null'} assigned_time=${a.assigned_time}`);
    }

    if (!apply) {
      console.log('\nDry-run only. To close these assignments, re-run with --apply (this will set bayAssignment.open_time=false, assignment.end_time=now, and Player.end_time=now).');
      return process.exit(0);
    }

    console.log('\nApplying closure to open assignments...');
    const ids = openAssignments.map((a) => a.assignment_id);
    const now = new Date();

    // Close assignments
    await prisma.bayAssignment.updateMany({ where: { assignment_id: { in: ids } }, data: { open_time: false, end_time: now } });

    // Update players
    const playerIds = openAssignments.map((a) => a.player_id).filter((p) => p != null);
    if (playerIds.length) {
      await prisma.player.updateMany({ where: { player_id: { in: playerIds } }, data: { end_time: now } });
    }

    // Optionally mark bays available if no other open assignments exist for a bay
    const affectedBayIds = Array.from(new Set(openAssignments.map((a) => a.bay_id)));
    for (const bid of affectedBayIds) {
      const stillOpen = await prisma.bayAssignment.count({ where: { bay_id: bid, open_time: true } });
      if (stillOpen === 0) {
        await prisma.bay.update({ where: { bay_id: bid }, data: { status: 'Available' } });
      }
    }

    console.log('Applied closures to open assignments. Done.');
  } catch (e) {
    console.error('Error during reconciliation:', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
