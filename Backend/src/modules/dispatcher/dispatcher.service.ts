import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DispatcherService {
  constructor(private prisma: PrismaService) {}

  // Return a summarized overview for the dispatcher dashboard
  async getOverview() {
    const now = new Date();

    // Count bays and status
    const baysRaw = await this.prisma.bay.findMany({ select: { bay_id: true, bay_number: true, status: true } });

    // Active (open) assignments
    const openAssignments = await this.prisma.bayAssignment.findMany({
      where: { open_time: true },
      include: { player: true, transactions: true, dispatcher: true },
    });
    const assignmentByBay = new Map<number, any>();
    for (const a of openAssignments) assignmentByBay.set(a.bay_id, a);

    const bays = baysRaw.map((b) => {
      const assignment = assignmentByBay.get(b.bay_id) ?? null;
      const playerName = assignment?.player?.nickname ?? assignment?.player?.full_name ?? null;
      const endTime = assignment?.end_time ?? assignment?.player?.end_time ?? null;
      const totalBalls = assignment?.transactions ? assignment.transactions.reduce((s: number, t: any) => s + (Number(t.bucket_count) || 0), 0) : 0;
      const computedStatus = assignment ? 'Occupied' : String(b.status ?? 'Available');
      return {
        bay_id: b.bay_id,
        bay_number: b.bay_number,
        status: computedStatus,
        originalStatus: b.status,
        player_name: playerName,
        player: assignment?.player ? { nickname: assignment.player.nickname, full_name: assignment.player.full_name, player_id: assignment.player.player_id } : null,
        end_time: endTime,
        total_balls: totalBalls,
        transactions_count: assignment?.transactions ? assignment.transactions.length : 0,
      };
    });

    const totalBays = bays.length;
    const maintenanceBays = bays.filter((x) => String(x.originalStatus) === 'Maintenance').length;
    const occupiedBays = bays.filter((x) => String(x.status) === 'Occupied').length;
    const availableBays = Math.max(0, totalBays - occupiedBays - maintenanceBays);

    // staff count
    const staffOnDuty = await this.prisma.employee.count();

    // next tee time similar logic: earliest end_time for open assignments or Bay Ready if available
    let nextTeeTime: Date | string | null = null;
    if (availableBays > 0) nextTeeTime = 'Bay Ready';
    else {
      const nextEnding = await this.prisma.bayAssignment.findFirst({ where: { open_time: true, end_time: { gt: now } }, orderBy: { end_time: 'asc' }, select: { end_time: true } });
      if (nextEnding?.end_time) nextTeeTime = nextEnding.end_time;
    }

    return {
      totalBays,
      maintenanceBays,
      occupiedBays,
      availableBays,
      staffOnDuty,
      nextTeeTime,
      bays,
    };
  }

  // Return bay rows only (for grid rendering)
  async listBays() {
    const overview = await this.getOverview();
    return overview.bays || [];
  }
}
