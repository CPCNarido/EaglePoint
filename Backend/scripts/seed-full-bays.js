/**
 * Seed script to populate 45 bays with realistic sample assignments.
 * - Ensures bays 1..45 exist
 * - Upserts Dispatcher / BallHandler / Admin accounts
 * - Creates a player and assignment per bay (skips bay if an open assignment already exists)
 * - Adds a ball transaction per assignment to represent balls/buckets used
 *
 * Usage:
 *   cd Backend
 *   node scripts/seed-full-bays.js [--force] [maxMinutes]
 *
 * Options:
 *   --force   : replace existing open assignments (will create new ones)
 *   maxMinutes: maximum minutes for timed sessions (default 60)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function upsertEmployee({ username, full_name, password = '123456789', role }) {
  const hash = await bcrypt.hash(password, 10);
  return await prisma.employee.upsert({
    where: { username },
    update: { password: hash, full_name, role },
    create: { username, full_name, password: hash, role },
  });
}

function randRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function ensureBays() {
  for (let i = 1; i <= 45; i++) {
    const bayNumber = String(i);
    const exists = await prisma.bay.findFirst({ where: { OR: [{ bay_number: bayNumber }, { bay_number: `B${bayNumber}` }] } });
    if (!exists) {
      await prisma.bay.create({ data: { bay_number: bayNumber, status: 'Available' } });
      process.stdout.write('.');
    } else {
      process.stdout.write(',');
    }
  }
  console.log('\nBays ensured 1..45');
}

async function seedAll({ force = false, maxMinutes = 60 }) {
  console.log('Seeding full 45 bay assignments (force=%s, maxMinutes=%s)...', force, maxMinutes);

  // Ensure employees
  const admin = await upsertEmployee({ username: 'Admin', full_name: 'Administrator', role: 'Admin' });
  const dispatcher = await upsertEmployee({ username: 'Dispatcher', full_name: 'Dispatcher', role: 'Dispatcher' });
  const ballHandler = await upsertEmployee({ username: 'BallHandler', full_name: 'Ball Handler', role: 'BallHandler' });

  for (let i = 1; i <= 45; i++) {
    try {
      const bayNumber = String(i);
      let bay = await prisma.bay.findFirst({ where: { OR: [{ bay_number: bayNumber }, { bay_number: `B${bayNumber}` }] } });
      if (!bay) {
        bay = await prisma.bay.create({ data: { bay_number: bayNumber, status: 'Available' } });
      }

      // check for existing open assignment on this bay
      const existing = await prisma.bayAssignment.findFirst({ where: { bay_id: bay.bay_id, open_time: true } });
      if (existing && !force) {
        console.log(`Skipping bay ${bayNumber}: already has open assignment id=${existing.assignment_id}`);
        continue;
      }

      // choose session type: mostly Timed but some Open
      const isTimed = Math.random() < 0.85; // 85% timed
      // remaining minutes until session end (for Timed sessions)
      const remainingMinutes = isTimed ? randRange(1, Math.min(maxMinutes, 60)) : null;
      // played minutes (how long they've been playing already)
      const playedMinutes = isTimed ? randRange(1, Math.min(30, Math.max(1, Math.floor(Math.max(maxMinutes - remainingMinutes, 1))))) : randRange(5, 120);
      const now = Date.now();
      const start_time = new Date(now - playedMinutes * 60 * 1000);
  // Ensure end_time is always set because Player.end_time is non-nullable in schema.
  // For Open sessions (no remainingMinutes) pick a plausible future end_time so the record looks active.
  const end_time = remainingMinutes ? new Date(now + remainingMinutes * 60 * 1000) : new Date(now + randRange(30, 120) * 60 * 1000);
      const session_type = end_time ? 'Timed' : 'Open';

      // create or reuse a seeded player for this bay (stable receipt so reruns are safe)
      const receipt = `SEED-BAY-${bayNumber}`;
      const creatorConnect = admin ? { connect: { employee_id: admin.employee_id } } : { connect: { employee_id: 1 } };
      const player = await prisma.player.upsert({
        where: { receipt_number: receipt },
        update: { nickname: `Player ${bayNumber}`, start_time: start_time, end_time: end_time, price_per_hour: new Prisma.Decimal('500.00'), creator: creatorConnect },
        create: { nickname: `Player ${bayNumber}`, receipt_number: receipt, start_time: start_time, end_time: end_time, price_per_hour: new Prisma.Decimal('500.00'), creator: creatorConnect },
      });

      // create or update assignment depending on existing open assignment and force flag
      let assignment;
      if (existing && force) {
        assignment = await prisma.bayAssignment.update({
          where: { assignment_id: existing.assignment_id },
          data: { player_id: player.player_id, dispatcher_id: dispatcher.employee_id, assigned_time: start_time, end_time: end_time, session_type },
        });
      } else if (!existing) {
        assignment = await prisma.bayAssignment.create({
          data: {
            player_id: player.player_id,
            bay_id: bay.bay_id,
            dispatcher_id: dispatcher.employee_id,
            assigned_time: start_time,
            open_time: true,
            end_time: end_time,
            session_type: session_type,
          },
        });
      } else {
        // existing && !force handled above via continue; this branch should not be reached
      }

  // mark bay as occupied and set the employee who updated it
  await prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Occupied', updated_by: dispatcher.employee_id } });

  // create a ball transaction to simulate buckets used
  const bucketCount = end_time ? Math.max(1, Math.round(playedMinutes / 10) * 2 + randRange(0, 2)) : randRange(1, 8);
  await prisma.ballTransaction.create({ data: { assignment_id: assignment.assignment_id, handler_id: ballHandler.employee_id, bucket_count: bucketCount } });

  console.log(`Seeded bay ${bayNumber}: assignment=${assignment.assignment_id}, player=${player.player_id}, remainingMinutes=${remainingMinutes || 'open'}, buckets=${bucketCount}`);
    } catch (e) {
      console.warn('Failed seeding for bay', i, e && e.message ? e.message : e);
    }
  }

  console.log('Seeding complete. Run `npx prisma studio` or open Admin UI to inspect.');
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const maybeMax = argv.find((a) => !a.startsWith('-'));
  const maxMinutes = maybeMax ? parseInt(maybeMax, 10) : 60;

  try {
    await ensureBays();
    await seedAll({ force, maxMinutes });
  } catch (e) {
    console.error('Full seeding failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
