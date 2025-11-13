import { Injectable, Logger } from '@nestjs/common';
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

  // Compute status: only open assignments mark a bay as Occupied for dispatcher view.
  // Leave SpecialUse/Reserved as their original status so the UI can display them
  // distinctly (and the frontend may still offer Start Session for reserved bays).
  const originalStatus = String(b.status ?? 'Available');
  const computedStatus = assignment ? 'Occupied' : originalStatus;

      return {
        bay_id: b.bay_id,
        bay_number: b.bay_number,
        status: computedStatus,
        originalStatus: b.status,
        player_name: playerName,
        // expose player start time so clients can compute elapsed stopwatch time across reloads
        start_time: assignment?.player?.start_time ?? assignment?.assigned_time ?? null,
        player: assignment?.player ? { nickname: assignment.player.nickname, full_name: assignment.player.full_name, player_id: assignment.player.player_id, start_time: assignment.player.start_time } : null,
        end_time: endTime,
        total_balls: totalBalls,
        transactions_count: assignment?.transactions ? assignment.transactions.length : 0,
      };
    });

    const totalBays = bays.length;
    const maintenanceBays = bays.filter((x) => String(x.originalStatus) === 'Maintenance').length;
    const occupiedBays = bays.filter((x) => String(x.status) === 'Occupied').length;
    const availableBays = Math.max(0, totalBays - occupiedBays - maintenanceBays);

    // staff count: prefer counting today's attendances with a clock_in and no clock_out
    let staffOnDuty = 0;
    try {
      const site = await (this.prisma as any).siteConfig.findFirst();
      const tz = site?.timezone ?? 'UTC';
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: String(tz) }).format(now);
      const parts = String(dateStr).split('-').map((p) => Number(p));
      let dateBucket: Date | null = null;
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [y, m, d] = parts;
        dateBucket = new Date(Date.UTC(y, m - 1, d));
      } else {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        dateBucket = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }

      // Count attendance rows for today where staff clocked in and haven't clocked out yet (or clock_out is in the future)
      const nowUtc = new Date();
      staffOnDuty = await (this.prisma as any).attendance.count({ where: { date: dateBucket, clock_in: { not: null }, OR: [{ clock_out: null }, { clock_out: { gt: nowUtc } }] } });
      Logger.log(`Dispatcher overview computed staffOnDuty=${staffOnDuty} using attendance table for date=${dateBucket.toISOString()}`, 'DispatcherService');
    } catch (e) {
      // Fallback to total employees if attendance table isn't available or an error occurs
      try { staffOnDuty = await this.prisma.employee.count(); Logger.log(`Dispatcher overview falling back to employee count=${staffOnDuty} due to attendance error`, 'DispatcherService'); } catch { staffOnDuty = 0; }
    }

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

  // Return list of staff currently present (clocked in for today's site date)
  async getStaffOnDutyList() {
    const now = new Date();
    try {
      const site = await (this.prisma as any).siteConfig.findFirst();
      const tz = site?.timezone ?? 'UTC';
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: String(tz) }).format(now);
      const parts = String(dateStr).split('-').map((p) => Number(p));
      let dateBucket: Date | null = null;
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [y, m, d] = parts;
        dateBucket = new Date(Date.UTC(y, m - 1, d));
      } else {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        dateBucket = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }

      const nowUtc = new Date();
      const rows = await (this.prisma as any).attendance.findMany({
        where: { date: dateBucket, clock_in: { not: null }, OR: [{ clock_out: null }, { clock_out: { gt: nowUtc } }] },
        include: { employee: true },
        orderBy: { clock_in: 'asc' },
      });

      const mapped = (rows || []).map((r: any) => ({
        employee_id: r.employee_id,
        full_name: r.employee?.full_name ?? r.employee?.username ?? null,
        username: r.employee?.username ?? null,
        clock_in: r.clock_in,
        clock_out: r.clock_out ?? null,
        date: r.date,
        source: r.source ?? null,
      }));

      return { source: 'attendance', rows: mapped };
    } catch (e) {
      // Fallback: return employee list with present=false so UI can still render
      try {
        const emps = await this.prisma.employee.findMany({ select: { employee_id: true, full_name: true, username: true } });
        const mapped = (emps || []).map((e: any) => ({ employee_id: e.employee_id, full_name: e.full_name, username: e.username, present: false }));
        return { source: 'employees', rows: mapped };
      } catch (ee) {
        return { source: 'error', rows: [] };
      }
    }
  }
}
