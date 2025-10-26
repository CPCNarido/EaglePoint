const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function upsertUser({ username, fullName, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await prisma.employee.upsert({
      where: { username },
      update: { password: hash, full_name: fullName, role },
      create: {
        username,
        full_name: fullName,
        password: hash,
        role,
      },
    });
    console.log(`Upserted ${username} (id=${result.employee_id})`);
  } catch (err) {
    console.error(`Failed to upsert ${username}:`, err.message || err);
    throw err;
  }
}

async function main() {
  const users = [
    { username: 'Dispatcher1', fullName: 'Dispatcher1', password: '123456789', role: 'Dispatcher' },
    { username: 'Cashier1', fullName: 'Cashier1', password: '123456789', role: 'Cashier' },
    { username: 'BallHandler1', fullName: 'BallHandler1', password: '123456789', role: 'BallHandler' },
    { username: 'Admin', fullName: 'Admin', password: '123456789', role: 'Admin' },
  ];

  for (const u of users) {
    await upsertUser(u);
  }
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
