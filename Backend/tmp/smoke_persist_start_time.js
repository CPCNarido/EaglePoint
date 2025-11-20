// Simple smoke script to verify that creating a BallTransaction sets player.start_time to delivered_time + 30s
// Usage: node tmp/smoke_persist_start_time.js
// Ensure you have .env configured and Prisma client generated.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Starting smoke test: create player, assignment, transaction...');
    // Create a temporary employee to be creator/dispatcher/serviceman
    const emp = await prisma.employee.create({ data: { full_name: 'SMOKE_TEST_USER', username: `smoke_${Date.now()}`, password: 'x', role: 'Dispatcher' } });
    console.log('Created employee', emp.employee_id);

    // Create a bay (or use existing first)
    let bay = await prisma.bay.findFirst();
    if (!bay) bay = await prisma.bay.create({ data: { bay_number: '1', status: 'Available' } });
    console.log('Using bay', bay.bay_id);

    // Create a player (unassigned)
    const player = await prisma.player.create({ data: { nickname: 'SMOKE_PLAYER', creator: { connect: { employee_id: emp.employee_id } } } });
    console.log('Created player', player.player_id);

    // Create an assignment linking player to bay
    const assignment = await prisma.bayAssignment.create({ data: { player: { connect: { player_id: player.player_id } }, bay: { connect: { bay_id: bay.bay_id } }, dispatcher: { connect: { employee_id: emp.employee_id } }, assigned_time: new Date(), open_time: true } });
    console.log('Created assignment', assignment.assignment_id);

    // Create a BallTransaction with delivered_time = now
    const delivered = new Date();
    const tx = await prisma.ballTransaction.create({ data: { assignment: { connect: { assignment_id: assignment.assignment_id } }, handler_id: emp.employee_id, bucket_count: 1, delivered_time: delivered } });
    console.log('Created transaction', tx.transaction_id, 'delivered_time', delivered.toISOString());

    // Read back player.start_time
    const p = await prisma.player.findUnique({ where: { player_id: player.player_id } });
    console.log('Player start_time (DB):', p.start_time ? p.start_time.toISOString() : null);
    const expectedMs = delivered.getTime() + 30000;
    console.log('Expected (delivered + 30s):', new Date(expectedMs).toISOString());

    if (p.start_time) {
      const diffMs = Math.abs(new Date(p.start_time).getTime() - expectedMs);
      console.log('Difference (ms):', diffMs);
      if (diffMs <= 2000) {
        console.log('OK: persisted start_time matches expected within tolerance');
      } else {
        console.warn('WARN: persisted start_time differs from expected by', diffMs, 'ms');
      }
    } else {
      console.error('FAIL: player.start_time was not set');
    }

    // Cleanup: delete created rows
    try { await prisma.ballTransaction.delete({ where: { transaction_id: tx.transaction_id } }); } catch (e) { void e; }
    try { await prisma.bayAssignment.delete({ where: { assignment_id: assignment.assignment_id } }); } catch (e) { void e; }
    try { await prisma.player.delete({ where: { player_id: player.player_id } }); } catch (e) { void e; }
    try { await prisma.employee.delete({ where: { employee_id: emp.employee_id } }); } catch (e) { void e; }

    console.log('Smoke test completed');
  } catch (e) {
    console.error('Error during smoke test', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
