/**
 * export_and_purge_attendance.js
 *
 * Usage: run on the server where `DATABASE_URL` is defined (Prisma).
 *  - Exports attendance rows to `backups/attendance/YYYY-MM-DD_HH-mm-ss.{json,csv}`
 *  - Deletes exported rows (safe: deletes by id only)
 *
 * Recommended schedule: daily at 00:00 PDT (see README below for cron / pm2 / systemd examples)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureDir(dir) {
  return fs.promises.mkdir(dir, { recursive: true });
}

function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => {
    const v = r[k];
    if (v === null || v === undefined) return '';
    // escape double quotes, wrap in quotes when needed
    const s = String(v).replace(/"/g, '""');
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s}"`;
    return s;
  }).join(','));
  return [header, ...lines].join('\n');
}

async function run() {
  console.log(new Date().toISOString(), 'Starting attendance export/purge');
  const outDir = path.join(__dirname, '..', 'backups', 'attendance');
  await ensureDir(outDir);

  // Choose what to export/delete. Options:
  // - All rows: export everything then delete all rows -> destructive
  // - Rows older than X days: safer
  // - Rows up to previous day (export yesterday's rows)
  // Here we export all rows currently present (adjust as needed).

  // If you prefer to only purge rows older than N days, change where clause accordingly.
  try {
    const rows = await prisma.attendance.findMany({});
    if (!rows || rows.length === 0) {
      console.log('No attendance rows to export. Exiting.');
      return;
    }

    // Write JSON
    const ts = new Date();
    const nameTime = ts.toISOString().replace(/[:]/g, '-').replace(/T/, '_').replace(/Z$/, '');
    const jsonPath = path.join(outDir, `attendance_${nameTime}.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log('Wrote JSON backup:', jsonPath);

    // Write CSV
    const csv = toCsv(rows.map(r => {
      // flatten Date objects
      const out = {};
      for (const k of Object.keys(r)) {
        const v = r[k];
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    }));
    const csvPath = path.join(outDir, `attendance_${nameTime}.csv`);
    await fs.promises.writeFile(csvPath, csv, 'utf8');
    console.log('Wrote CSV backup:', csvPath);

    // Delete exported rows by id
    const ids = rows.map(r => r.id).filter(x => x !== undefined && x !== null);
    if (ids.length) {
      // Use deleteMany with id in array
      const del = await prisma.attendance.deleteMany({ where: { id: { in: ids } } });
      console.log('Deleted rows count:', del.count);
    } else {
      console.log('No valid ids found to delete. Nothing deleted.');
    }

    console.log(new Date().toISOString(), 'Export/purge completed successfully');
  } catch (err) {
    console.error('Error during export/purge:', err);
    process.exitCode = 2;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
}

// allow running directly
if (require.main === module) run();

module.exports = { run };
