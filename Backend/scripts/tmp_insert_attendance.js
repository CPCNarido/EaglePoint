const { PrismaClient } = require('@prisma/client');
(async function(){
  const prisma = new PrismaClient();
  try{
    const empId = process.argv[2] ? Number(process.argv[2]) : 1;
    const now = new Date();
    // use YYYY-MM-DD as date bucket (midnight)
    const dateStr = now.toISOString().slice(0,10);
    const dateObj = new Date(dateStr);
    const row = await prisma.attendance.create({
      data: {
        employee_id: empId,
        date: dateObj,
        clock_in: now,
        source: 'manual-script',
        notes: 'Inserted for smoke test'
      }
    });
    console.log('Inserted attendance:', JSON.stringify(row, null, 2));
  }catch(e){
    console.error('ERROR', e);
    process.exitCode = 2;
  }finally{
    await prisma.$disconnect();
  }
})();
