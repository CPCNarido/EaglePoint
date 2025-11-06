require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function upsertStaff({ username, full_name, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  try {
    const res = await prisma.employee.upsert({
      where: { username },
      update: { password: hash, full_name, role },
      create: { username, full_name, password: hash, role },
    });
    return res;
  } catch (e) {
    console.error('Upsert failed for', username, e.message || e);
    throw e;
  }
}

async function main() {
  console.log('Seeding ~40 staff...');
  const roles = ['Dispatcher', 'Cashier', 'BallHandler', 'Serviceman'];
  const created = [];
  for (let i = 1; i <= 40; i++) {
    const username = `staff${i}`;
    const full_name = `Staff ${i}`;
    const role = roles[(i - 1) % roles.length];
    try {
      const r = await upsertStaff({ username, full_name, password: 'password', role });
      created.push({ username: r.username, id: r.employee_id, role: r.role });
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  console.log('\nDone. Created/upserted staff:');
  created.forEach((c) => console.log(` - ${c.username} (id=${c.id}) role=${c.role}`));
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
