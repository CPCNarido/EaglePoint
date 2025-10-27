require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    console.log('Attempting test create employee...');
    const r = await prisma.employee.create({ data: { full_name: 'Dbg User', password: 'x', role: 'Dispatcher' } });
    console.log('Created:', r);
  } catch (e) {
    console.error('ERROR:', e && e.message ? e.message : e);
    if (e && e.meta) console.error('META:', e.meta);
  } finally {
    await prisma.$disconnect();
  }
})();
