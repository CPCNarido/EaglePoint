/*
  Seed the DB with sessions across different timelines to exercise Reports & Analytics.
  - Creates bays 1..30 if missing
  - Ensures Dispatcher and BallHandler accounts exist
  - Generates sessions (players + bay assignments + ball transactions) across a date range

  Usage (from Backend/):
    node scripts/seed-reports-sample.js
*/

require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');
// use the maintained faker package
const { faker } = require('@faker-js/faker');
const prisma = new PrismaClient();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function ensureBays(max = 30) {
  console.log(`Ensuring bays 1..${max}`);
  for (let i = 1; i <= max; i++) {
    const bayNumber = String(i);
    const existing = await prisma.bay.findFirst({ where: { bay_number: bayNumber } });
    if (!existing) {
      await prisma.bay.create({ data: { bay_number: bayNumber, status: 'Available' } });
      process.stdout.write('.');
    } else process.stdout.write(',');
  }
  console.log('\nBays ensured');
}

async function ensureEmployees() {
  const ensure = async (username, full_name, role) => {
    const e = await prisma.employee.findFirst({ where: { username } });
    if (!e) {
      const created = await prisma.employee.create({ data: { username, full_name, role, password: 'seeded' } });
      console.log('Created', username, created.employee_id);
      return created;
    }
    return e;
  };
  const dispatcher = await ensure('Dispatcher', 'Dispatcher Seed', 'Dispatcher');
  const ballHandler = await ensure('BallHandler', 'Ball Handler Seed', 'BallHandler');
  return { dispatcher, ballHandler };
}

async function createSession({ day, bay, dispatcher, ballHandler, idx }) {
  // create player
  const start = new Date(day);
  // start time random hour between 8 and 20
  start.setHours(randInt(8, 20), randInt(0, 59), 0, 0);
  const durationMinutes = pick([30, 45, 60, 90, 120]);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const receipt = `R-SEED-${day.toISOString().slice(0,10)}-${String(idx).padStart(3, '0')}`;
  const pricePerHour = new Prisma.Decimal(pick([500, 450, 400]));

  const player = await prisma.player.create({ data: {
    nickname: faker.name.firstName(),
    receipt_number: receipt,
    start_time: start,
    end_time: end,
    price_per_hour: pricePerHour,
    created_by: dispatcher.employee_id,
  }});

  // create assignment
  const assign = await prisma.bayAssignment.create({ data: {
    player_id: player.player_id,
    bay_id: bay.bay_id,
    dispatcher_id: dispatcher.employee_id,
    assigned_time: start,
    end_time: end,
    open_time: pick([true, false, false]), // more timed than open
    session_type: pick(['Timed','Open']),
  }});

  // add ball transaction
  const buckets = randInt(1, 8);
  await prisma.ballTransaction.create({ data: {
    assignment_id: assign.assignment_id,
    handler_id: ballHandler.employee_id,
    bucket_count: buckets,
  }});

  return { player, assign };
}

async function seedRange({ days = 180, maxBays = 20, intensity = { min: 3, max: 12 } }) {
  console.log(`Seeding ${days} days, bays 1..${maxBays}.`);
  await ensureBays(maxBays);
  const { dispatcher, ballHandler } = await ensureEmployees();
  const bays = await prisma.bay.findMany({ where: { bay_number: { in: Array.from({length:maxBays}, (_,i)=>String(i+1)) } } });

  const today = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    // random sessions count per day
    const sessionsToday = randInt(intensity.min, intensity.max);
    for (let s = 0; s < sessionsToday; s++) {
      const bay = pick(bays);
      try {
        await createSession({ day, bay, dispatcher, ballHandler, idx: s+1 });
      } catch (e) {
        console.warn('Failed to create session', e && e.message ? e.message : e);
      }
    }
    if (d % 7 === 0) process.stdout.write('|');
  }
  console.log('\nSeeding complete');
}

async function main() {
  try {
    await seedRange({ days: 365, maxBays: 30, intensity: { min: 2, max: 10 } });
  } catch (e) {
    console.error('Seeding failed', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
