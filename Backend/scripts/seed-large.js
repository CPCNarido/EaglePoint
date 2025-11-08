/*
 Idempotent large seed script for development.
 - Ensures bays 1..45 exist
 - Upserts Admin/Dispatcher/Cashier/BallHandler accounts with password '123456789'
 - Creates additional employees until total employee count is 60
 - Creates SiteConfig, PricingConfig, OperationalConfig rows (typed)
 - Adds a few players and assignments to populate related data

 Run from Backend folder after running migrations and `npx prisma generate`:
   node scripts/seed-large.js
*/

require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function ensureBays() {
  console.log('Ensuring bays 1..45');
  for (let i = 1; i <= 45; i++) {
    const bayNumber = String(i);
    const existing = await prisma.bay.findFirst({ where: { bay_number: bayNumber } });
    if (!existing) {
      await prisma.bay.create({ data: { bay_number: bayNumber, status: 'Available' } });
      process.stdout.write('.');
    } else {
      process.stdout.write(',');
    }
  }
  console.log('\nBays ensured');
}

async function upsertEmployee({ username, full_name, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  return await prisma.employee.upsert({
    where: { username },
    update: { password: hash, full_name, role },
    create: { username, full_name, password: hash, role },
  });
}

async function ensureEmployees() {
  console.log('Ensuring special accounts');
  const specials = [
    { username: 'Admin', full_name: 'Administrator', password: '123456789', role: 'Admin' },
    { username: 'Dispatcher', full_name: 'Dispatcher', password: '123456789', role: 'Dispatcher' },
    { username: 'Cashier', full_name: 'Cashier', password: '123456789', role: 'Cashier' },
    { username: 'BallHandler', full_name: 'Ball Handler', password: '123456789', role: 'BallHandler' },
  ];

  const created = {};
  for (const s of specials) {
    const res = await upsertEmployee(s);
    created[res.username] = res;
    console.log(`Upserted special account: ${res.username} (id=${res.employee_id})`);
  }

  // Ensure total employees count reaches 60
  const target = 60;
  const currentCount = await prisma.employee.count();
  console.log(`Current employee count: ${currentCount}`);
  if (currentCount >= target) {
    console.log('No extra employees needed');
    return created;
  }

  console.log(`Creating ${target - currentCount} additional employee accounts`);
  const roles = ['Dispatcher', 'Cashier', 'BallHandler', 'Serviceman'];
  let idx = 1;
  while ((await prisma.employee.count()) < target) {
    const username = `user${idx}`;
    // skip if conflicts with special usernames
    if (['Admin', 'Dispatcher', 'Cashier', 'BallHandler'].includes(username)) {
      idx++;
      continue;
    }
    const full_name = `User ${idx}`;
    const role = roles[idx % roles.length];
    try {
      await upsertEmployee({ username, full_name, password: 'password', role });
    } catch (e) {
      // if upsert fails (username exists), skip
    }
    idx++;
  }

  console.log('Employees ensured to 60 total');
  return created;
}

async function ensureTypedConfigs() {
  console.log('Ensuring SiteConfig / PricingConfig / OperationalConfig');

  try {
    // SiteConfig
    const site = await prisma.siteConfig.findFirst();
    if (site) {
      await prisma.siteConfig.update({ where: { site_id: site.site_id }, data: { site_name: 'Eagle Point', currency_symbol: '₱', enable_reservations: true } });
      console.log('Updated SiteConfig');
    } else {
      await prisma.siteConfig.create({ data: { site_name: 'Eagle Point', currency_symbol: '₱', enable_reservations: true } });
      console.log('Created SiteConfig');
    }
  } catch (e) {
    console.warn('SiteConfig not available (migration not applied?), skipping');
  }

  try {
    const pricing = await prisma.pricingConfig.findFirst();
    const pricingData = { timed_session_rate: new Prisma.Decimal('500.00'), open_time_rate: new Prisma.Decimal('450.00') };
    if (pricing) {
      await prisma.pricingConfig.update({ where: { pricing_id: pricing.pricing_id }, data: pricingData });
      console.log('Updated PricingConfig');
    } else {
      await prisma.pricingConfig.create({ data: pricingData });
      console.log('Created PricingConfig');
    }
  } catch (e) {
    console.warn('PricingConfig not available (migration not applied?), skipping');
  }

  try {
    const ops = await prisma.operationalConfig.findFirst();
    const opsData = { total_available_bays: 45, standard_tee_interval_minutes: 10, ball_bucket_warning_threshold: 5 };
    if (ops) {
      await prisma.operationalConfig.update({ where: { operational_id: ops.operational_id }, data: opsData });
      console.log('Updated OperationalConfig');
    } else {
      await prisma.operationalConfig.create({ data: opsData });
      console.log('Created OperationalConfig');
    }
  } catch (e) {
    console.warn('OperationalConfig not available (migration not applied?), skipping');
  }
}

async function addSamplePlayersAndAssignments(createdSpecials) {
  console.log('Adding a few sample players and assignments');
  try {
    const admin = await prisma.employee.findFirst({ where: { username: 'Admin' } });
    const dispatcher = await prisma.employee.findFirst({ where: { username: 'Dispatcher' } });
    const ballHandler = await prisma.employee.findFirst({ where: { username: 'BallHandler' } });

    // create two players
    const creatorConnect = admin ? { connect: { employee_id: admin.employee_id } } : { connect: { employee_id: 1 } };
    const p1 = await prisma.player.upsert({
      where: { receipt_number: 'R-SEED-001' },
      update: { nickname: 'SeedPlayer1', start_time: new Date(), end_time: null, price_per_hour: new Prisma.Decimal('500.00'), creator: creatorConnect },
      create: { nickname: 'SeedPlayer1', receipt_number: 'R-SEED-001', start_time: new Date(), end_time: null, price_per_hour: new Prisma.Decimal('500.00'), creator: creatorConnect },
    });

    const p2 = await prisma.player.upsert({
      where: { receipt_number: 'R-SEED-002' },
      update: { nickname: 'SeedPlayer2', start_time: new Date(), end_time: null, price_per_hour: new Prisma.Decimal('450.00'), creator: creatorConnect },
      create: { nickname: 'SeedPlayer2', receipt_number: 'R-SEED-002', start_time: new Date(), end_time: null, price_per_hour: new Prisma.Decimal('450.00'), creator: creatorConnect },
    });

    // find a free bay (1..45) and assign player1
    const bay = await prisma.bay.findFirst({ where: { status: 'Available' } });
    if (bay && dispatcher) {
      const assignment = await prisma.bayAssignment.create({ data: { player_id: p1.player_id, bay_id: bay.bay_id, dispatcher_id: dispatcher.employee_id, assigned_time: new Date(), open_time: true, session_type: 'Open' } });
      console.log('Created assignment', assignment.assignment_id, 'for player', p1.player_id, 'on bay', bay.bay_number);

      if (ballHandler) {
        await prisma.ballTransaction.create({ data: { assignment_id: assignment.assignment_id, handler_id: ballHandler.employee_id, bucket_count: 5 } });
        console.log('Created ball transaction for assignment');
      }
    }
  } catch (e) {
    console.warn('Skipping player/assignment seeding due to error (migrations/client?):', e && e.message ? e.message : e);
  }
}

async function main() {
  try {
    await ensureBays();
    const specials = await ensureEmployees();
    await ensureTypedConfigs();
    await addSamplePlayersAndAssignments(specials);
    console.log('Large seeding complete');
  } catch (e) {
    console.error('Seeding failed', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
