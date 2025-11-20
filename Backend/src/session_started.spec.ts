import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('session_started persistence', () => {
  jest.setTimeout(20000);

  test('creating BallTransaction persists player.start_time = delivered_time + 30s', async () => {
    // Create an employee to act as dispatcher/handler
    const emp = await prisma.employee.create({ data: { full_name: 'TEST_EMP', username: `test_emp_${Date.now()}`, password: 'x', role: 'Dispatcher' } });

    // Ensure a bay exists
    let bay = await prisma.bay.findFirst();
    if (!bay) bay = await prisma.bay.create({ data: { bay_number: '1', status: 'Available' } });

    // Create player and assignment
    const player = await prisma.player.create({ data: { nickname: 'TEST_PLAYER', creator: { connect: { employee_id: emp.employee_id } } } });
    const assignment = await prisma.bayAssignment.create({ data: { player: { connect: { player_id: player.player_id } }, bay: { connect: { bay_id: bay.bay_id } }, dispatcher: { connect: { employee_id: emp.employee_id } }, assigned_time: new Date(), open_time: true } });

    // Create transaction with delivered_time = now
    const delivered = new Date();
    const tx = await prisma.ballTransaction.create({ data: { assignment: { connect: { assignment_id: assignment.assignment_id } }, handler_id: emp.employee_id, bucket_count: 1, delivered_time: delivered } });

    // Reload player
    const p = await prisma.player.findUnique({ where: { player_id: player.player_id } });
    expect(p).toBeTruthy();
    expect(p?.start_time).not.toBeNull();

    const expectedMs = delivered.getTime() + 30000;
    const actualMs = p!.start_time!.getTime();
    const diff = Math.abs(actualMs - expectedMs);

    // assert within 2 seconds to account for small clock differences
    expect(diff).toBeLessThanOrEqual(2000);

    // cleanup
    await prisma.ballTransaction.delete({ where: { transaction_id: tx.transaction_id } }).catch(() => null);
    await prisma.bayAssignment.delete({ where: { assignment_id: assignment.assignment_id } }).catch(() => null);
    await prisma.player.delete({ where: { player_id: player.player_id } }).catch(() => null);
    await prisma.bay.delete({ where: { bay_id: bay.bay_id } }).catch(() => null);
    await prisma.employee.delete({ where: { employee_id: emp.employee_id } }).catch(() => null);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
