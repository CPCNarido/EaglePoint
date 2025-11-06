#!/usr/bin/env node
/*
  Script: force-delete-bays.js
  Purpose: Force-delete bay rows and any dependent assignments and ball transactions.

  Usage:
    node scripts/force-delete-bays.js 47 48
    node scripts/force-delete-bays.js --yes 47 48   # skip confirmation

  Notes:
  - This is destructive. It will delete BallTransaction rows, BayAssignment rows and Bay rows
    for the specified bay IDs.
  - Run from repository root. Ensure you've run `npx prisma generate` so the Prisma client exists.
*/

const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

async function confirmPrompt(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--yes' && a !== '-y');
  const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');
  if (!args || args.length === 0) {
    console.error('Usage: node scripts/force-delete-bays.js [--yes] <bayId> [<bayId> ...]');
    process.exit(1);
  }

  const bayIds = args.map((s) => Number(s)).filter((n) => Number.isFinite(n));
  if (bayIds.length === 0) {
    console.error('No valid bay IDs provided.');
    process.exit(1);
  }

  console.log('Bay IDs to delete:', bayIds.join(', '));
  if (!skipConfirm) {
    const ok = await confirmPrompt('This will DELETE assignments and transactions for the above bay IDs. Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted by user.');
      process.exit(0);
    }
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    // Find assignments for these bays
    const assignments = await prisma.bayAssignment.findMany({ where: { bay_id: { in: bayIds } }, select: { assignment_id: true } });
    const assignmentIds = assignments.map((a) => a.assignment_id);

    console.log('Found assignments:', assignmentIds.length);

    await prisma.$transaction(async (tx) => {
      if (assignmentIds.length) {
        const delTx = await tx.ballTransaction.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
        console.log(`Deleted ${delTx.count || delTx} ballTransaction rows`);

        const delAssignments = await tx.bayAssignment.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
        console.log(`Deleted ${delAssignments.count || delAssignments} bayAssignment rows`);
      } else {
        console.log('No assignments found for the given bay IDs.');
      }

      // Finally delete the bays themselves
      const delBays = await tx.bay.deleteMany({ where: { bay_id: { in: bayIds } } });
      console.log(`Deleted ${delBays.count || delBays} bay rows`);
    });

    console.log('Force-delete completed successfully.');
  } catch (e) {
    console.error('Error during deletion:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
