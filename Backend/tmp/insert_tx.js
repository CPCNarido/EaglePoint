const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const assignmentId = Number(process.argv[2]);
    if (!assignmentId || Number.isNaN(assignmentId)) {
      console.error('usage: node insert_tx.js <assignment_id>');
      process.exit(2);
    }
    const tx = await prisma.ballTransaction.create({
      data: {
        assignment_id: assignmentId,
        bucket_count: 1,
        delivered_time: new Date(),
      },
    });
    console.log('created tx id=', tx.transaction_id ?? tx.id ?? JSON.stringify(tx));
  } catch (e) {
    console.error('failed creating tx', e);
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
}

run();
