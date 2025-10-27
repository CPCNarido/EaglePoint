// Idempotent script to ensure bays 1..45 exist in the DB
// If a bay exists as 'B#' this script will rename it to '#' for compatibility.
// PowerShell-safe: run from repo root or Backend folder with:
//   cd Backend
//   node .\scripts\create-bays.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    console.log('Ensuring bays 1..45 exist (rename B# -> # if needed)...');
    for (let i = 1; i <= 45; i++) {
      const numeric = String(i);
      const bPref = 'B' + i;
      try {
        const existsNumeric = await prisma.bay.findFirst({ where: { bay_number: numeric } });
        if (existsNumeric) {
          console.log('Exists', numeric);
          continue;
        }
        const existsB = await prisma.bay.findFirst({ where: { bay_number: bPref } });
        if (existsB) {
          // primary key is bay_id in schema
          await prisma.bay.update({ where: { bay_id: existsB.bay_id }, data: { bay_number: numeric } });
          console.log('Renamed', bPref, '->', numeric);
          continue;
        }
        await prisma.bay.create({ data: { bay_number: numeric, status: 'Available' } });
        console.log('Created', numeric);
      } catch (e) {
        console.error('Error for', numeric, e && e.message ? e.message : e);
      }
    }
    console.log('Done.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    console.log('Ensuring bays B1..B45 exist...');
    for (let i = 1; i <= 45; i++) {
      const bayNum = 'B' + i;
      try {
        const existing = await prisma.bay.findFirst({ where: { bay_number: bayNum } });
        if (!existing) {
          await prisma.bay.create({ data: { bay_number: bayNum, status: 'Available' } });
          console.log('Created', bayNum);
        } else {
          console.log('Exists', bayNum);
        }
      } catch (e) {
        console.error('Error for', bayNum, e && e.message ? e.message : e);
      }
    }
    console.log('Done.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
})();
