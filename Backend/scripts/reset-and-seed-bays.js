#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
// optional numeric arg (first non-flag) or env TOTAL_BAYS
const firstNonFlag = args.find(a => !a.startsWith('-'));
const argTotal = firstNonFlag ? Number(firstNonFlag) : (process.env.TOTAL_BAYS ? Number(process.env.TOTAL_BAYS) : undefined);

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  console.log(`reset-and-seed-bays.js (apply=${APPLY}, force=${FORCE})`);

  try {
    const ops = await prisma.operationalConfig.findFirst({ select: { total_available_bays: true, operational_id: true } }).catch(() => null);
    const desiredTotal = Number.isFinite(argTotal) && argTotal > 0 ? Math.floor(argTotal) : (ops && Number.isFinite(Number(ops.total_available_bays)) ? Number(ops.total_available_bays) : 45);
    console.log('Desired total bays:', desiredTotal);

    // backup current tables to JSON files
    const outDir = path.resolve(__dirname);
    const ts = nowStamp();
    const bays = await prisma.bay.findMany({ orderBy: { bay_id: 'asc' } });
    const assignments = await prisma.bayAssignment.findMany({ orderBy: { assignment_id: 'asc' } });
    const baysFile = path.join(outDir, `bays-backup-${ts}.json`);
    const assignFile = path.join(outDir, `bayassignments-backup-${ts}.json`);
    fs.writeFileSync(baysFile, JSON.stringify(bays, null, 2), 'utf8');
    fs.writeFileSync(assignFile, JSON.stringify(assignments, null, 2), 'utf8');
    console.log(`Wrote backups: ${baysFile} (${bays.length} rows), ${assignFile} (${assignments.length} rows)`);

    // summary checks
    console.log(`Current bay rows: ${bays.length}`);
    console.log(`Current bay assignments: ${assignments.length}`);

    if (!APPLY) {
      console.log('\nDRY-RUN: No changes made. To reset the Bay table and reseed, re-run with --apply.');
      console.log('If there are bay assignments and you want to delete them as well, include --force.');
      console.log('\nExample:');
      console.log('  node .\\scripts\\reset-and-seed-bays.js --apply');
      console.log('  node .\\scripts\\reset-and-seed-bays.js 47 --apply    # use explicit total');
      console.log('  node .\\scripts\\reset-and-seed-bays.js --apply --force   # also delete bay assignments');
      return;
    }

    // If assignments exist and not forced, abort
    if (assignments.length > 0 && !FORCE) {
      console.error('\nAborting: There are bay assignments in the database. Re-run with --force to delete assignments as well (destructive).');
      process.exitCode = 2;
      return;
    }

    // If forced and assignments exist, delete dependent rows first then assignments
    if (assignments.length > 0 && FORCE) {
      console.log('Force delete requested: removing dependent BallTransaction rows first...');
      try {
        const assignmentIds = assignments.map(a => a.assignment_id);
        const deletedTx = await prisma.ballTransaction.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
        console.log(`Deleted ${deletedTx.count ?? deletedTx} BallTransaction rows referencing assignments.`);
      } catch (e) {
        console.warn('Failed to delete BallTransaction rows or none existed:', e && e.message ? e.message : e);
      }

      console.log('Deleting all bay assignments (force=true)...');
      try {
        await prisma.bayAssignment.deleteMany({});
        console.log('All bay assignments deleted.');
      } catch (e) {
        console.error('Failed deleting bay assignments:', e && e.message ? e.message : e);
        throw e;
      }
    }

    // Delete all bay rows
    console.log('Deleting all bay rows...');
    await prisma.bay.deleteMany({});
    console.log('All bay rows deleted.');

    // Create new bay rows 1..desiredTotal
    console.log(`Creating ${desiredTotal} bay rows (1..${desiredTotal}) as Available...`);
    for (let i = 1; i <= desiredTotal; i++) {
      try {
        await prisma.bay.create({ data: { bay_number: String(i), status: 'Available' } });
      } catch (e) {
        console.error('Error creating bay', i, e && e.message ? e.message : e);
      }
    }
    console.log('Seeding complete.');

  } catch (e) {
    console.error('Error in reset-and-seed-bays:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
