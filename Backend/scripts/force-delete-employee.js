#!/usr/bin/env node
/*
  Script: force-delete-employee.js
  Purpose: Force-delete an employee and remove or nullify dependent records
           so the delete never fails due to foreign key constraints.

  WARNING: This is destructive. Use only when you intend to remove the
  employee and associated historical data. Prefer reassigning dependents
  in production.

  Usage:
    node scripts/force-delete-employee.js --id 123 --force
    node scripts/force-delete-employee.js 123 --yes

  The script requires confirmation unless you pass `--force` or `--yes`.
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
  const rawArgs = process.argv.slice(2);
  const skipConfirm = rawArgs.includes('--force') || rawArgs.includes('--yes') || rawArgs.includes('-y');

  // Accept either `--id 123` or positional `123`
  let idArg = null;
  const idIndex = rawArgs.indexOf('--id');
  if (idIndex !== -1 && rawArgs.length > idIndex + 1) idArg = rawArgs[idIndex + 1];
  if (!idArg) {
    // try positional
    const pos = rawArgs.find((a) => !a.startsWith('--') && !a.startsWith('-'));
    if (pos) idArg = pos;
  }

  const employeeId = Number(idArg);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    console.error('Usage: node scripts/force-delete-employee.js --id <EMPLOYEE_ID> [--force]');
    process.exit(1);
  }

  console.log(`Preparing to force-delete employee id=${employeeId}`);
  if (!skipConfirm) {
    const ok = await confirmPrompt('This will IRREVERSIBLY DELETE or NULL dependent records and the employee. Continue? (y/N) ');
    if (!ok) { console.log('Aborted by user.'); process.exit(0); }
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    // Find assignments referencing this employee as dispatcher or serviceman
    const assignments = await prisma.bayAssignment.findMany({ where: { OR: [{ dispatcher_id: employeeId }, { serviceman_id: employeeId }] }, select: { assignment_id: true } });
    const assignmentIds = assignments.map((a) => a.assignment_id);

    console.log('Found assignments to remove:', assignmentIds.length);

    await prisma.$transaction(async (tx) => {
      // Delete chat participants
      const delChatParts = await tx.chatParticipant.deleteMany({ where: { employee_id: employeeId } });
      console.log(`Deleted chatParticipant rows: ${delChatParts.count || delChatParts}`);

      // Delete chat messages where this employee is sender or recipient
      const delChatMsgs = await tx.chatMessage.deleteMany({ where: { OR: [{ sender_id: employeeId }, { recipient_id: employeeId }] } });
      console.log(`Deleted chatMessage rows: ${delChatMsgs.count || delChatMsgs}`);

      // Notification acknowledgements
      const delNotifAck = await tx.notificationAcknowledgement.deleteMany({ where: { employee_id: employeeId } });
      console.log(`Deleted notificationAcknowledgement rows: ${delNotifAck.count || delNotifAck}`);

      // Notifications created by employee
      const delNotifs = await tx.notification.deleteMany({ where: { created_by: employeeId } });
      console.log(`Deleted notification rows: ${delNotifs.count || delNotifs}`);

      // Ball transactions: by handler or by assignment membership
      if (assignmentIds.length) {
        const delTxByAssignment = await tx.ballTransaction.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
        console.log(`Deleted ballTransaction rows by assignment: ${delTxByAssignment.count || delTxByAssignment}`);
      }
      const delTxByHandler = await tx.ballTransaction.deleteMany({ where: { handler_id: employeeId } });
      console.log(`Deleted ballTransaction rows by handler: ${delTxByHandler.count || delTxByHandler}`);

      // Serviceman queues
      const delQueue = await tx.servicemanQueue.deleteMany({ where: { serviceman_id: employeeId } });
      console.log(`Deleted servicemanQueue rows: ${delQueue.count || delQueue}`);

      // Null out optional updated_by fields so we don't block on these relations
      const updBays = await tx.bay.updateMany({ where: { updated_by: employeeId }, data: { updated_by: null } });
      console.log(`Updated bay rows (cleared updated_by): ${updBays.count || updBays}`);
      const updInv = await tx.ballBucketInventory.updateMany({ where: { updated_by: employeeId }, data: { updated_by: null } });
      console.log(`Updated ballBucketInventory rows (cleared updated_by): ${updInv.count || updInv}`);

      // Delete assignments (dispatcher/serviceman)
      const delAssignments = await tx.bayAssignment.deleteMany({ where: { OR: [{ dispatcher_id: employeeId }, { serviceman_id: employeeId }, { assignment_id: { in: assignmentIds } }] } });
      console.log(`Deleted bayAssignment rows: ${delAssignments.count || delAssignments}`);

      // Attendance records
      const delAttendance = await tx.attendance.deleteMany({ where: { employee_id: employeeId } });
      console.log(`Deleted attendance rows: ${delAttendance.count || delAttendance}`);

      // Players created by employee
      const delPlayers = await tx.player.deleteMany({ where: { created_by: employeeId } });
      console.log(`Deleted player rows: ${delPlayers.count || delPlayers}`);

      // System logs where employee was actor or approver
      const delSysLogs = await tx.systemLog.deleteMany({ where: { OR: [{ employee_id: employeeId }, { approved_by: employeeId }] } });
      console.log(`Deleted systemLog rows: ${delSysLogs.count || delSysLogs}`);

      // Finally delete the employee row
      const delEmp = await tx.employee.deleteMany({ where: { employee_id: employeeId } });
      console.log(`Deleted employee rows: ${delEmp.count || delEmp}`);
    });

    console.log('Force-delete completed successfully.');
  } catch (e) {
    console.error('Error during force-delete:', e);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
