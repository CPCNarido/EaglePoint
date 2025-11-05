const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const argv = process.argv.slice(2);
  const bayNumber = parseInt(argv[0] || process.env.SEED_BAY || '3', 10);
  const mins = parseInt(argv[1] || process.env.SEED_MIN || '11', 10);

  if (!bayNumber || Number.isNaN(bayNumber)) {
    console.error('Invalid bay number. Usage: node seed-test-notif-bay.js [bayNumber] [minutes]');
    process.exit(1);
  }

  console.log(`Seeding test notification assignment for bay ${bayNumber} (expires in ${mins} minutes)...`);

  try {
    // Find an existing Dispatcher (prefer role Dispatcher) or Admin as fallback
    let dispatcher = await prisma.employee.findFirst({ where: { role: 'Dispatcher' } });
    if (!dispatcher) {
      dispatcher = await prisma.employee.findFirst({ where: { role: 'Admin' } });
    }
    if (!dispatcher) {
      // Create a minimal dispatcher user if none exists
      const created = await prisma.employee.create({ data: { username: `seed_dispatcher_${Date.now()}`, full_name: 'Seed Dispatcher', role: 'Dispatcher' } });
      dispatcher = created;
      console.log('Created dispatcher user', dispatcher.employee_id);
    }

    // Ensure the bay exists (match numeric or B-prefixed)
    let bay = await prisma.bay.findFirst({ where: { OR: [{ bay_number: String(bayNumber) }, { bay_number: `B${bayNumber}` }] } });
    if (!bay) {
      bay = await prisma.bay.create({ data: { bay_number: String(bayNumber), status: 'Occupied', updated_by: dispatcher.employee_id } });
      console.log('Created bay record', bay.bay_id, bay.bay_number);
    } else {
      console.log('Found bay', bay.bay_id, bay.bay_number);
    }

    // Determine timings so the seeded player looks actively playing
    const now = Date.now();
    const endTime = new Date(now + mins * 60 * 1000);
    const playedMinutes = Math.max(1, Math.min(20, Math.floor(mins / 2))); // conservative played time
    const startTime = new Date(now - playedMinutes * 60 * 1000);

    // Create or reuse a lightweight player for the assignment (use stable receipt so reruns are safe)
    const seedReceipt = `SEED-NOTIF-BAY-${bayNumber}`;
    const creatorConnect = dispatcher ? { connect: { employee_id: dispatcher.employee_id } } : { connect: { employee_id: 1 } };
    const player = await prisma.player.upsert({
      where: { receipt_number: seedReceipt },
      update: { nickname: 'SeedPlayer', start_time: startTime, end_time: endTime, price_per_hour: new Prisma.Decimal('0.00'), creator: creatorConnect },
      create: { nickname: 'SeedPlayer', receipt_number: seedReceipt, start_time: startTime, end_time: endTime, price_per_hour: new Prisma.Decimal('0.00'), creator: creatorConnect },
    });
    console.log('Upserted player', player.player_id, player.receipt_number);

    // Create or update the bay assignment with the computed timings
    const existingAssignment = await prisma.bayAssignment.findFirst({ where: { OR: [{ player_id: player.player_id }, { bay_id: bay.bay_id }], open_time: true } });
    let assignment;
    if (existingAssignment) {
      // update the existing open assignment to refresh timing/details
      assignment = await prisma.bayAssignment.update({
        where: { assignment_id: existingAssignment.assignment_id },
        data: { player_id: player.player_id, dispatcher_id: dispatcher.employee_id, assigned_time: startTime, end_time: endTime, session_type: endTime ? 'Timed' : 'Open' },
      });
      console.log('Updated existing assignment', assignment.assignment_id);
    } else {
      assignment = await prisma.bayAssignment.create({
        data: {
          player_id: player.player_id,
          bay_id: bay.bay_id,
          dispatcher_id: dispatcher.employee_id,
          assigned_time: startTime,
          open_time: true,
          end_time: endTime,
          // session_type is required in some schemas; set to 'Timed' when end_time exists, otherwise 'Open'
          session_type: endTime ? 'Timed' : 'Open',
        },
      });
      console.log('Created assignment', assignment.assignment_id);
    }

    // create a ball transaction for realism
    const bucketCount = Math.max(1, Math.round((playedMinutes || 1) / 10) * 2 + Math.floor(Math.random() * 3));
    await prisma.ballTransaction.create({ data: { assignment_id: assignment.assignment_id, handler_id: dispatcher.employee_id, bucket_count: bucketCount } });

    // update bay to reflect the assignment and set who updated it
    try {
      await prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Occupied', updated_by: dispatcher.employee_id } });
    } catch (e) {}

    console.log('Created assignment', assignment.assignment_id, 'bay_id', assignment.bay_id, 'end_time', assignment.end_time);
    console.log('You can now open the Admin UI and watch for threshold notifications for this bay.');
  } catch (err) {
    console.error('Seed failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
