const path = require('path');
// load .env from Backend folder to ensure DATABASE_URL is available
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function hash(pw) {
  return await bcrypt.hash(pw, 10);
}

async function main() {
  console.log('Seeding test data...');

  // Employees (upsert so rerunning is safe)
  const users = [
    { username: 'Dispatcher1', full_name: 'Dispatcher One', password: '123456789', role: 'Dispatcher' },
    { username: 'Cashier1', full_name: 'Cashier One', password: '123456789', role: 'Cashier' },
    { username: 'BallHandler1', full_name: 'Ball Handler', password: '123456789', role: 'BallHandler' },
    { username: 'Admin', full_name: 'Administrator', password: '123456789', role: 'Admin' },
    { username: 'Serviceman1', full_name: 'Serviceman One', password: '123456789', role: 'Serviceman' },
  ];

  const created = {};
  for (const u of users) {
    const pw = await hash(u.password);
    const up = await prisma.employee.upsert({
      where: { username: u.username },
      update: { password: pw, full_name: u.full_name, role: u.role },
      create: { username: u.username, full_name: u.full_name, password: pw, role: u.role },
    });
    console.log('Upserted user', up.username, up.employee_id);
    created[u.username] = up;
  }

  // Bays
  const bayData = [
    { bay_number: 'B1', status: 'Available', note: 'Near entrance' },
    { bay_number: 'B2', status: 'Occupied', note: 'Center' },
    { bay_number: 'B3', status: 'Maintenance', note: 'Under repair' },
  ];
  const bays = [];
  for (const b of bayData) {
    // bay_number is not unique in the schema, so use findFirst then create/update by id
    let bay = await prisma.bay.findFirst({ where: { bay_number: b.bay_number } });
    if (bay) {
      bay = await prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: b.status, note: b.note } });
    } else {
      bay = await prisma.bay.create({ data: { bay_number: b.bay_number, status: b.status, note: b.note } });
    }
    bays.push(bay);
    console.log('Upserted bay', bay.bay_number, bay.bay_id);
  }

  // BallBucketInventory
  const inv = await prisma.ballBucketInventory.upsert({
    where: { inventory_id: 1 },
    update: { total_buckets_start: 500, total_buckets_remaining: 480, bottom_limit: 50 },
    create: { total_buckets_start: 500, total_buckets_remaining: 480, bottom_limit: 50 },
  });
  console.log('Upserted inventory id', inv.inventory_id);

  // Players
  const player1 = await prisma.player.upsert({
    where: { receipt_number: 'R-1001' },
    update: { nickname: 'PlayerOne', start_time: new Date(), end_time: new Date(Date.now() + 60*60*1000), price_per_hour: new Prisma.Decimal('50.00'), created_by: created['Admin'].employee_id },
    create: { nickname: 'PlayerOne', receipt_number: 'R-1001', start_time: new Date(), end_time: new Date(Date.now() + 60*60*1000), price_per_hour: new Prisma.Decimal('50.00'), created_by: created['Admin'].employee_id },
  });
  const player2 = await prisma.player.upsert({
    where: { receipt_number: 'R-1002' },
    update: { nickname: 'PlayerTwo', start_time: new Date(), end_time: new Date(Date.now() + 2*60*60*1000), price_per_hour: new Prisma.Decimal('30.00'), created_by: created['Admin'].employee_id },
    create: { nickname: 'PlayerTwo', receipt_number: 'R-1002', start_time: new Date(), end_time: new Date(Date.now() + 2*60*60*1000), price_per_hour: new Prisma.Decimal('30.00'), created_by: created['Admin'].employee_id },
  });
  console.log('Upserted players', player1.player_id, player2.player_id);

  // BayAssignment linking player1 to bay B2 with Dispatcher1
  const assignment = await prisma.bayAssignment.create({
    data: {
      player_id: player1.player_id,
      bay_id: bays[1].bay_id,
      dispatcher_id: created['Dispatcher1'].employee_id,
      serviceman_id: created['Serviceman1'].employee_id,
      assigned_time: new Date(),
      open_time: true,
    },
  });
  console.log('Created assignment', assignment.assignment_id);

  // BallTransaction
  const tx = await prisma.ballTransaction.create({
    data: {
      assignment_id: assignment.assignment_id,
      handler_id: created['BallHandler1'].employee_id,
      bucket_count: 5,
    },
  });
  console.log('Created transaction', tx.transaction_id);

  // ServicemanQueue
  const queue = await prisma.servicemanQueue.upsert({
    where: { queue_id: 1 },
    update: { serviceman_id: created['Serviceman1'].employee_id, status: 'Available' },
    create: { serviceman_id: created['Serviceman1'].employee_id, status: 'Available' },
  });
  console.log('Upserted serviceman queue', queue.queue_id);

  // Notifications
  await prisma.notification.create({ data: { message: 'Test notification: system seeded' } });

  // Chat room and messages
  const chat = await prisma.chatRoom.create({ data: { name: 'General', is_group: true } });
  await prisma.chatParticipant.createMany({ data: [
    { chat_id: chat.chat_id, employee_id: created['Admin'].employee_id },
    { chat_id: chat.chat_id, employee_id: created['Dispatcher1'].employee_id },
  ]});
  await prisma.chatMessage.create({ data: { chat_id: chat.chat_id, sender_id: created['Admin'].employee_id, content: 'Welcome to the system' } });

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
