const { PrismaClient } = require('@prisma/client');
(async function(){
  const prisma = new PrismaClient();
  try{
    const cnt = await prisma.attendance.count();
    console.log('attendance_count:', cnt);
    const rows = await prisma.attendance.findMany({ take: 10 });
    console.log('attendance_rows_sample:', JSON.stringify(rows, null, 2));
    const emps = await prisma.employee.findMany({ take: 10, select: { employee_id: true, username: true, full_name: true }});
    console.log('employees_sample:', JSON.stringify(emps, null, 2));
  }catch(e){
    console.error('ERROR', e.message || e);
    process.exitCode = 2;
  }finally{
    await prisma.$disconnect();
  }
})();
