const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

(async function main(){
  const prisma = new PrismaClient();
  try {
    const outDir = path.join(__dirname, 'backups');
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { /* ignore */ }

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `attendance-backup-${stamp}.json`);

    console.log('[export_attendance_and_clear] Fetching attendance rows...');
    const rows = await prisma.attendance.findMany({ include: { employee: true } });
    console.log(`[export_attendance_and_clear] Fetched ${rows.length} rows`);

    const payload = {
      exportedAt: now.toISOString(),
      count: rows.length,
      rows,
    };

    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('[export_attendance_and_clear] Written backup to', outPath);

    // Delete all attendance rows (clear table)
    console.log('[export_attendance_and_clear] Deleting attendance rows...');
    const delRes = await prisma.attendance.deleteMany({});
    console.log('[export_attendance_and_clear] deleteMany result:', delRes);

    console.log('[export_attendance_and_clear] Completed successfully.');
  } catch (e) {
    console.error('[export_attendance_and_clear] ERROR', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    try { await prisma.$disconnect(); } catch (e) { /* ignore */ }
  }
})();
