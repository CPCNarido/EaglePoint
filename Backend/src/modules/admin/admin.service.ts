import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoggingService } from '../../common/logging/logging.service';
import { ChatService } from '../chat/chat.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import * as fs from 'fs';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private loggingService: LoggingService, private chatService: ChatService) {}

  // Return the public profile for a given employee id
  async getProfile(userId: number) {
    if (!userId) return null;
    const u = await this.prisma.employee.findUnique({
      where: { employee_id: userId },
      select: { employee_id: true, full_name: true, username: true, role: true },
    });
    if (!u) return null;
    return { employee_id: u.employee_id, full_name: u.full_name, username: u.username, role: u.role };
  }

  // Chat-related helpers
  async listChats() {
    // return simple room list
    const rooms = await this.prisma.chatRoom.findMany({ select: { chat_id: true, name: true, is_group: true } });
    return rooms.map((r: any) => ({ chat_id: r.chat_id, name: r.name, is_group: r.is_group }));
  }

  async getChatMessages(chatId: number) {
    if (!chatId && chatId !== 0) throw new BadRequestException('Invalid chat id');
    const msgs = await this.prisma.chatMessage.findMany({
      where: { chat_id: chatId },
      include: { sender: true },
      orderBy: { sent_at: 'asc' },
      take: 1000,
    });
    return msgs.map((m: any) => ({
      message_id: m.message_id,
      chat_id: m.chat_id,
      sender_id: m.sender_id ?? m.sender?.employee_id ?? null,
      sender_name: m.sender?.full_name ?? m.sender?.username ?? null,
      content: m.content,
      sent_at: m.sent_at,
    }));
  }

  async postChatMessage(chatId: number, content: string, senderId?: number) {
    if (!content || content.trim().length === 0) throw new BadRequestException('content is required');
    if (!senderId) throw new BadRequestException('senderId is required');
    // ensure room exists (if chatId=0 is pseudo All Roles, try find/create)
    let roomId = chatId;
    if (chatId === 0) {
      const existing = await this.prisma.chatRoom.findFirst({ where: { name: 'All Roles' } });
      if (!existing) {
        const created = await this.prisma.chatRoom.create({ data: { name: 'All Roles', is_group: true } });
        roomId = created.chat_id;
      } else roomId = existing.chat_id;
    }

    const created = await this.prisma.chatMessage.create({ data: { chat_id: roomId, sender_id: senderId, content } });
    // Optionally write a system log (best-effort)
    try {
      await this.loggingService.writeLog(senderId ?? undefined, Role.Admin, `ChatMessage: chat:${roomId}`, `msg:${created.message_id}`);
    } catch (e) { void e; }
    // Broadcast to connected clients (best-effort)
    try { await this.chatService.notifyNewMessage(created); } catch (e) { void e; }
  return { message_id: created.message_id, chat_id: created.chat_id, sender_id: created.sender_id, content: created.content, sent_at: created.sent_at };
  }

  async broadcastMessage(content: string, senderId?: number) {
    if (!content || content.trim().length === 0) throw new BadRequestException('content is required');
    if (!senderId) throw new BadRequestException('senderId is required');
    // find or create an 'All Roles' room and post a message
    let room = await this.prisma.chatRoom.findFirst({ where: { name: 'All Roles' } });
    if (!room) {
      room = await this.prisma.chatRoom.create({ data: { name: 'All Roles', is_group: true } });
    }
  const created = await this.prisma.chatMessage.create({ data: { chat_id: room.chat_id, sender_id: senderId, content } });
  try { await this.loggingService.writeLog(senderId ?? undefined, Role.Admin, `Broadcast: ${content?.slice(0, 80)}`, `broadcast:${created.message_id}`); } catch (e) { void e; }
  try { await this.chatService.notifyNewMessage(created); } catch (e) { void e; }
  return { ok: true, message_id: created.message_id, chat_id: room.chat_id, sender_id: created.sender_id };
  }

  // One-to-one direct message: find existing private chat (is_group = false) between the two
  // participants or create one, then post the message.
  async postDirectMessage(targetEmployeeId: number, content: string, senderId?: number) {
    if (!targetEmployeeId) throw new BadRequestException('targetEmployeeId is required');
    if (!content || content.trim().length === 0) throw new BadRequestException('content is required');
    if (!senderId) throw new BadRequestException('senderId is required');

    // ensure both employees exist
    const [a, b] = await Promise.all([
      this.prisma.employee.findUnique({ where: { employee_id: senderId } }),
      this.prisma.employee.findUnique({ where: { employee_id: targetEmployeeId } }),
    ]);
    if (!a || !b) throw new BadRequestException('Employee not found');

    // Search for existing private chat (is_group=false) that has both participants
    const candidateRooms = await this.prisma.chatRoom.findMany({ where: { is_group: false }, include: { participants: true } });
    let room = candidateRooms.find((r: any) => {
      const parts = (r.participants || []).map((p: any) => Number(p.employee_id));
      return parts.length === 2 && parts.includes(senderId) && parts.includes(targetEmployeeId);
    });

    if (!room) {
      // create a private chat room and add participants
      const createdRoom = await this.prisma.chatRoom.create({ data: { name: null, is_group: false } });
      await this.prisma.chatParticipant.createMany({ data: [{ chat_id: createdRoom.chat_id, employee_id: senderId }, { chat_id: createdRoom.chat_id, employee_id: targetEmployeeId }] });
      const newRoom = await this.prisma.chatRoom.findUnique({ where: { chat_id: createdRoom.chat_id }, include: { participants: true } });
      if (!newRoom) throw new BadRequestException('Failed creating chat room');
      room = newRoom as any;
    }

    if (!room) throw new BadRequestException('Failed creating/find chat room');

  const created = await this.prisma.chatMessage.create({ data: { chat_id: room.chat_id, sender_id: senderId, content } });
  try { await this.loggingService.writeLog(senderId ?? undefined, Role.Admin, `DirectMessage: ${content?.slice(0, 80)}`, `dm:${created.message_id}`); } catch (e) { void e; }
  try { await this.chatService.notifyNewMessage(created); } catch (e) { void e; }
  return { message_id: created.message_id, chat_id: room.chat_id, sender_id: created.sender_id, content: created.content, sent_at: created.sent_at };
  }

  async getDirectMessages(targetEmployeeId: number, senderId: number) {
    if (!targetEmployeeId) throw new BadRequestException('targetEmployeeId is required');
    if (!senderId) throw new BadRequestException('senderId is required');

    const candidateRooms = await this.prisma.chatRoom.findMany({ where: { is_group: false }, include: { participants: true } });
    const room = candidateRooms.find((r: any) => {
      const parts = (r.participants || []).map((p: any) => Number(p.employee_id));
      return parts.length === 2 && parts.includes(senderId) && parts.includes(targetEmployeeId);
    });
    if (!room) return [];
    const msgs = await this.prisma.chatMessage.findMany({ where: { chat_id: room.chat_id }, include: { sender: true }, orderBy: { sent_at: 'asc' } });
  return msgs.map((m: any) => ({ message_id: m.message_id, chat_id: m.chat_id, sender_id: m.sender_id ?? m.sender?.employee_id ?? null, sender_name: m.sender?.full_name ?? m.sender?.username ?? null, content: m.content, sent_at: m.sent_at }));
  }

  // Return lightweight previews for roster: last message involving each staff member (sender or recipient)
  async getChatPreviews() {
    // load staff (exclude serviceman to match frontend filter)
    const staff = await this.prisma.employee.findMany({ select: { employee_id: true, full_name: true, role: true } });
    const ids = staff.map((s) => s.employee_id);
    if (!ids.length) return [];

    // fetch recent messages where staff were sender or recipient
    const msgs = await this.prisma.chatMessage.findMany({
      where: { OR: [{ sender_id: { in: ids } }, { recipient_id: { in: ids } }] },
      orderBy: { sent_at: 'desc' },
      take: 1000,
      include: { sender: true },
    });

    const map: Record<number, { content: string; sent_at: Date | string | null }> = {};
    for (const m of msgs) {
      // determine which staff this message should be associated with: prefer sender if sender is a staff member, otherwise recipient
      const sid = ids.includes(m.sender_id) ? m.sender_id : (ids.includes(m.recipient_id ?? -1) ? m.recipient_id : null);
      if (!sid) continue;
      if (!map[sid]) map[sid] = { content: String(m.content ?? ''), sent_at: m.sent_at ?? null };
    }

    // build output combining staff metadata and preview
    const out: any[] = staff.map((s) => ({ employee_id: s.employee_id, full_name: s.full_name, role: s.role, preview: map[s.employee_id]?.content ?? null, preview_at: map[s.employee_id]?.sent_at ?? null }));

    // Also include group chat previews (e.g. All Roles). Find group chat rooms and attach their latest message preview
    try {
      const groups = await this.prisma.chatRoom.findMany({ where: { is_group: true }, select: { chat_id: true, name: true } });
      for (const g of groups) {
        const m = await this.prisma.chatMessage.findFirst({ where: { chat_id: g.chat_id }, orderBy: { sent_at: 'desc' } });
        out.push({ chat_id: g.chat_id, name: g.name ?? null, preview: m ? String(m.content ?? '') : null, preview_at: m?.sent_at ?? null });
      }
    } catch (e) {
      // best-effort; if group chat lookup fails, ignore
      void e;
    }

    return out;
  }



  // Basic reports summary — returns aggregate metrics used by Reports & Analytics UI
  async getReportsSummary(opts: { timeRange?: string; sessionType?: string; bay?: any } = {}) {
    const now = new Date();
    // determine startDate based on timeRange
    let startDate = new Date(0);
    const tr = String(opts.timeRange ?? '').toLowerCase();
    if (!tr || tr === '' || tr.includes('last 10')) {
      // last 10 days
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9);
    } else if (tr.includes('month')) {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (tr.includes('year')) {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    } else {
      // default: start of today
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

  // total sessions (players created) within range
  const totalSessions = await this.prisma.player.count({ where: { start_time: { gte: startDate, lte: now } } });

    // total buckets dispensed (sum of ballTransaction.bucket_count)
    const buckets = await this.prisma.ballTransaction
      .aggregate({ _sum: { bucket_count: true } })
      .catch(() => ({ _sum: { bucket_count: null } }));
    const totalBuckets =
      (buckets && buckets._sum && Number(buckets._sum.bucket_count || 0)) || 0;

    // average session duration (only for sessions with end_time)
    // Some databases may have end_time non-nullable; to be robust we'll select all players
    // and compute durations only for rows that have an end_time value.
    const playersForDur = await this.prisma.player.findMany({
      where: { start_time: { gte: startDate, lte: now } },
      select: { start_time: true, end_time: true },
    });
    const sessionsWithEnd = playersForDur.filter((p) => p.end_time != null);
    let totalMs = 0;
    for (const s of sessionsWithEnd) {
      try {
        // s.end_time is filtered to be non-null, assert to satisfy TypeScript
        totalMs +=
          new Date(s.end_time!).getTime() - new Date(s.start_time).getTime();
      } catch (e) {
        void e;
      }
    }
    const avgMs = sessionsWithEnd.length
      ? Math.round(totalMs / sessionsWithEnd.length)
      : 0;

  // total play duration (hours for all completed sessions)
  const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;

  // bay utilization rate: occupied bays / total bays (current snapshot)
  const bays = await this.prisma.bay.findMany({ select: { bay_id: true, status: true } });
    const totalBays = bays.length;
    const occupied = bays.filter(
      (b) => String(b.status) !== 'Available',
    ).length;
    const bayUtilization = totalBays
      ? Math.round((occupied / totalBays) * 100)
      : 0;

    return {
      totalSessions,
      totalBuckets,
      avgSessionDurationMs: avgMs,
      avgSessionDurationHuman: this.humanDuration(avgMs),
      totalPlayDurationHours: totalHours,
      bayUtilizationRate: bayUtilization,
    };
  }

  // Export report as CSV (simple implementation). Accepts body with `reportType` and optional filters.
  async exportReport(payload: Record<string, any>) {
    const reportType = String(payload.reportType ?? 'full');
    // For "full" report, export players with key fields and assignment info
    if (
      reportType === 'full' ||
      reportType === 'full_pack' ||
      reportType === 'default'
    ) {
      const players = await this.prisma.player.findMany({
        include: { assignments: true },
        orderBy: { player_id: 'asc' },
        take: 1000,
      });
      // CSV header
      const cols = [
        'session_id',
        'player_name',
        'bay_no',
        'start_time',
        'end_time',
        'duration_minutes',
        'price_per_hour',
      ];
      const rows: string[] = [];
      rows.push(cols.join(','));
      for (const p of players) {
        const assignment =
          p.assignments && p.assignments.length ? p.assignments[0] : null;
        const start = p.start_time ? new Date(p.start_time).toISOString() : '';
        const end = p.end_time ? new Date(p.end_time).toISOString() : '';
        let duration = '';
        try {
          if (p.start_time && p.end_time) {
            const mins = Math.round(
              (new Date(p.end_time).getTime() -
                new Date(p.start_time).getTime()) /
                (1000 * 60),
            );
            duration = String(mins);
          }
        } catch (e) {
          void e;
        }
        const row = [
          String(p.receipt_number ?? `P${p.player_id}`),
          String(p.nickname ?? ''),
          String(assignment?.bay_id ?? ''),
          start,
          end,
          duration,
          String(p.price_per_hour ?? ''),
        ];
        rows.push(
          row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
        );
      }
      // Log export (best-effort)
      try {
        const adminActor = await this.prisma.employee.findFirst({
          where: { role: 'Admin' },
        });
        await this.loggingService.writeLog(
          adminActor?.employee_id,
          adminActor?.role as any,
          `ExportReport: ${reportType}`,
          `report:${reportType}`,
        );
      } catch (e) {
        void e;
      }

      return rows.join('\n');
    }
    if (reportType === 'overview') {
      // produce a small CSV with key summary metrics
      const summary = await this.getReportsSummary({ timeRange: String(payload.timeRange ?? '') });
      const cols = ['metric', 'value'];
      const outRows = [cols.join(',')];
      outRows.push(`totalSessions,${summary.totalSessions}`);
      outRows.push(`totalBuckets,${summary.totalBuckets}`);
      outRows.push(`avgSessionDurationMs,${summary.avgSessionDurationMs}`);
      outRows.push(`totalPlayDurationHours,${summary.totalPlayDurationHours}`);
      outRows.push(`bayUtilizationRate,${summary.bayUtilizationRate}`);
      return outRows.join('\n');
    }
    return '';
  }

  private humanDuration(ms: number) {
    if (!ms || ms <= 0) return '0m';
    const totalMins = Math.round(ms / (1000 * 60));
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }

  async getOverview() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Determine active assignments (players occupying bays)
    const activeAssignments = await this.prisma.bayAssignment.findMany({
      where: { open_time: true },
      select: { bay_id: true },
    });
    const occupiedBayIds = new Set(activeAssignments.map((a) => a.bay_id));

    // Staff on duty: fallback to total employees count
    const staffCount = await this.prisma.employee.count();

    // Next tee time logic:
    // - If there are available bays, show 'Bay Ready'
    // - If all bays are occupied, return the earliest scheduled end_time for an active assignment (the next bay to be freed)
    // - Fallback to the next player's scheduled start_time when available
    const nextPlayer = await this.prisma.player.findFirst({
      where: { start_time: { gte: now } },
      orderBy: { start_time: 'asc' },
      select: { start_time: true },
    });

    // Bay statuses: return list of bay_id, bay_number and computed status
    const baysRaw = await this.prisma.bay.findMany({
      select: { bay_id: true, bay_number: true, status: true, note: true },
    });

    // Fetch active assignments so we can enrich bay rows with assignment/player/transactions
    const openAssignments = await this.prisma.bayAssignment.findMany({
      where: { open_time: true },
      include: { player: true, transactions: true },
    });
    const assignmentByBay = new Map<number, any>();
    for (const a of openAssignments) assignmentByBay.set(a.bay_id, a);

    // Treat bays with a SpecialUse status (reserved) as occupied for dashboard counts
    const bays = baysRaw.map((b) => {
      const originalStatus = String(b.status);
      const isOccupied =
        occupiedBayIds.has(b.bay_id) || originalStatus === 'SpecialUse';
      const computedStatus = isOccupied ? 'Occupied' : originalStatus;

      const assignment = assignmentByBay.get(b.bay_id) ?? null;
      // derive some helpful fields the frontend expects (best-effort)
      // If there is an open assignment, prefer that player's nickname. Otherwise
      // surface bay.note (used for reservation names) so the frontend can
      // display the reserved-for name even before a Player/Assignment exists.
      const playerName = assignment?.player?.nickname ?? assignment?.player?.full_name ?? b.note ?? null;
      const endTime = assignment?.end_time ?? assignment?.player?.end_time ?? null;
      const totalBalls = assignment?.transactions ? assignment.transactions.reduce((s: number, t: any) => s + (Number(t.bucket_count) || 0), 0) : null;

      return {
        bay_id: b.bay_id,
        bay_number: b.bay_number,
        status: computedStatus,
        originalStatus,
        // assignment-derived fields (optional)
        player_name: playerName,
        // expose start_time so clients can compute elapsed stopwatch time across reloads
        start_time: assignment?.player?.start_time ?? assignment?.assigned_time ?? null,
        // expose typed session_type when available so clients can render session-type legends
        session_type: assignment?.session_type ?? null,
        // If no live assignment but bay.note is present, expose a synthetic player object
        player: assignment?.player ? { nickname: assignment.player.nickname, full_name: assignment.player.full_name, player_id: assignment.player.player_id, start_time: assignment.player.start_time } : (b.note ? { nickname: b.note } : null),
        end_time: endTime,
        assignment_end_time: assignment?.end_time ?? null,
        total_balls: totalBalls,
        bucket_count: totalBalls,
        transactions_count: assignment?.transactions ? assignment.transactions.length : 0,
      };
    });

    // Revenue today: sum price_per_hour * hours for players whose start_time is today
    const playersToday = await this.prisma.player.findMany({
      where: { start_time: { gte: startOfDay, lte: now } },
      select: { start_time: true, end_time: true, price_per_hour: true },
    });
    let revenue = 0;
    for (const p of playersToday) {
      try {
        const start = p.start_time;
        const end = p.end_time ?? now;
        const hours = Math.max(
          0,
          (end.getTime() - start.getTime()) / (1000 * 60 * 60),
        );
        revenue += Number(p.price_per_hour) * hours;
      } catch (e) {
        void e;
      }
    }

    const totalBays = bays.length;
    const maintenanceBays = bays.filter(
      (b) => b.status === 'Maintenance',
    ).length;
    // Count occupied bays from the mapped list — this now includes SpecialUse (reserved) as Occupied
    const occupiedBays = bays.filter((b) => b.status === 'Occupied').length;
    const availableBays = Math.max(
      0,
      totalBays - occupiedBays - maintenanceBays,
    );

    // Determine nextTeeTime according to rules
    let nextTeeTime: Date | string | null = null;
    if (availableBays > 0) {
      nextTeeTime = 'Bay Ready';
    } else {
      const nextEnding = await this.prisma.bayAssignment.findFirst({
        where: { open_time: true, end_time: { gt: now } },
        orderBy: { end_time: 'asc' },
        select: { end_time: true },
      });
      if (nextEnding?.end_time) {
        nextTeeTime = nextEnding.end_time;
      } else {
        nextTeeTime = nextPlayer?.start_time ?? null;
      }
    }

    return {
      totalRevenueToday: Math.round(revenue * 100) / 100,
      // active players are the number of occupied bays
      activePlayers: occupiedBays,
      staffOnDuty: staffCount,
      nextTeeTime,
      bays,
      totalBays,
      maintenanceBays,
      occupiedBays,
      availableBays,
    };
  }

  // Return recent sessions with assignment and aggregated info for frontend tables/charts
  async getRecentSessions(opts: { limit?: number; timeRange?: string; sessionType?: string; bay?: any; page?: number; perPage?: number } = {}) {
    const limit = Number(opts.limit ?? 200);
    // apply optional filters: timeRange, sessionType, bay
    let startDate: Date | undefined = undefined;
    if (opts && (opts as any).timeRange) {
      const tr = String((opts as any).timeRange || '').toLowerCase();
      const now = new Date();
      if (tr.includes('last 10') || tr === '') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9);
      else if (tr.includes('month')) startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      else if (tr.includes('year')) startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    const where: any = {};
    if (startDate) where.start_time = { gte: startDate };
    if ((opts as any).sessionType && String((opts as any).sessionType).toLowerCase() === 'timed') where.end_time = { not: null };
    if ((opts as any).sessionType && String((opts as any).sessionType).toLowerCase() === 'open') where.end_time = null;
    // bay filter: filter by assignment bay number or bay id
    const includeAssignments = {
      include: {
        bay: true,
        dispatcher: true,
        serviceman: true,
        transactions: true,
      },
      orderBy: { assigned_time: 'desc' },
      take: 1,
    } as any;

    if ((opts as any).bay) {
      // attempt to find bay id by number
      const bayVal = (opts as any).bay;
      try {
        const bayRow = await this.prisma.bay.findFirst({ where: { OR: [{ bay_number: String(bayVal) }, { bay_id: Number(bayVal) }] } });
        if (bayRow) {
          where.assignments = { some: { bay_id: bayRow.bay_id } };
        }
      } catch (e) { void e; }
    }

    // support pagination
    const page = Number((opts as any).page ?? 0);
    const perPage = Number((opts as any).perPage ?? limit);
    const skip = page && page > 0 ? (page - 1) * perPage : 0;

    const total = await this.prisma.player.count({ where }).catch(() => 0);

    const players = await this.prisma.player.findMany({
      where,
      orderBy: { start_time: 'desc' },
      take: perPage,
      skip,
      include: { assignments: includeAssignments },
    });

    // Map to a lean representation used by the frontend
    const mapped = players.map((p) => {
      const assignment =
        p.assignments && p.assignments.length
          ? p.assignments[0]
          : (null as any);
      // compute duration minutes
      let durationMins = null as number | null;
      try {
        if (p.start_time && p.end_time) {
          durationMins = Math.round(
            (new Date(p.end_time).getTime() -
              new Date(p.start_time).getTime()) /
              (1000 * 60),
          );
        }
      } catch (e) {
        void e;
      }

      // total buckets for this assignment
      let totalBuckets = 0;
      if (
        assignment &&
        assignment.transactions &&
        assignment.transactions.length
      ) {
        totalBuckets = assignment.transactions.reduce(
          (s: number, t: any) => s + (Number(t.bucket_count) || 0),
          0,
        );
      }

      return {
        player_id: p.player_id,
        session_id: p.receipt_number ?? `P${p.player_id}`,
        player_name: p.nickname ?? null,
        bay_no: assignment?.bay?.bay_number ?? null,
        bay_id: assignment?.bay?.bay_id ?? null,
        start_time: p.start_time,
        end_time: p.end_time ?? null,
        duration_minutes: durationMins,
        price_per_hour: Number(p.price_per_hour ?? 0),
        total_buckets: totalBuckets,
        cashier_dispatcher: assignment?.dispatcher?.full_name ?? null,
        session_type: p.end_time ? 'Timed' : 'Open',
      };
    });

    if (page && page > 0) return { total, rows: mapped } as any;
    return mapped;
  }

  // Return daily timeseries for sessions (simple aggregation)
  async getTimeSeries(opts: { timeRange?: string } = {}) {
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tr = String(opts.timeRange ?? '').toLowerCase();
    if (!tr || tr.includes('last 10')) startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9);
    else if (tr.includes('month')) startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    else if (tr.includes('year')) startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const players = await this.prisma.player.findMany({ where: { start_time: { gte: startDate, lte: now } }, select: { start_time: true } });
    const map: Record<string, number> = {};
    const labels: string[] = [];
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      const key = new Date(d).toISOString().slice(0, 10);
      map[key] = 0;
      labels.push(key.slice(5));
    }
    for (const p of players) {
      const k = new Date(p.start_time).toISOString().slice(0, 10);
      if (map[k] !== undefined) map[k] = (map[k] || 0) + 1;
    }
    const values = Object.keys(map).map((k) => map[k]);
    return { labels, values };
  }

  // Return simple bay usage aggregated (top N bays by minutes)
  async getBayUsage(opts: { timeRange?: string } = {}) {
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tr = String(opts.timeRange ?? '').toLowerCase();
    if (!tr || tr.includes('last 10')) startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9);
    else if (tr.includes('month')) startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    else if (tr.includes('year')) startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const sessions = await this.getRecentSessions({ limit: 1000, timeRange: opts.timeRange });
    const usage: Record<string, number> = {};
    const rows = Array.isArray(sessions) ? sessions : (sessions as any).rows || [];
    for (const s of rows) {
      if (!s.bay_no) continue;
      usage[String(s.bay_no)] = (usage[String(s.bay_no)] || 0) + (Number(s.duration_minutes) || 0);
    }
    const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { entries };
  }

  // Debug helper: return bay row, dispatcher overview entry for bay, and last N assignments
  async getBayDebug(bayNo: string, last: number = 10) {
    if (!bayNo) throw new BadRequestException('bayNo is required');
    // find bay by bay_number or id
    let bay = await this.prisma.bay.findFirst({ where: { bay_number: String(bayNo) } });
    if (!bay) {
      const maybeId = Number(bayNo);
      if (!Number.isNaN(maybeId)) {
        bay = await this.prisma.bay.findUnique({ where: { bay_id: maybeId } as any });
      }
    }
    if (!bay) throw new BadRequestException('Bay not found');

    // fetch overview and find bay entry if present
    let overviewEntry: any = null;
    try {
      const full = await this.getOverview();
      overviewEntry = (full?.bays || []).find((b: any) => Number(b.bay_id) === Number(bay.bay_id) || String(b.bay_number) === String(bay.bay_number)) ?? null;
    } catch (e) {
      overviewEntry = null;
    }

    const assignments = await this.prisma.bayAssignment.findMany({
      where: { bay_id: bay.bay_id },
      include: { player: true, dispatcher: true, serviceman: true, transactions: true },
      orderBy: { assigned_time: 'desc' },
      take: Number(last) || 10,
    });

    return { ok: true, bay, overviewEntry, assignments };
  }

  // Return basic staff list (id, full_name, username, role)
  async getStaff() {
    const staff = await this.prisma.employee.findMany({
      select: {
        employee_id: true,
        full_name: true,
        username: true,
        role: true,
      },
    });

    // Compute a lightweight presence indicator:
    // - online if the staff sent a chat message within the last 5 minutes
    // - OR if they are referenced on an open bay assignment (dispatcher or serviceman)
    try {
      const ids = staff.map((s) => s.employee_id).filter(Boolean);
      const onlineSet = new Set<number>();

      if (ids.length) {
        const recentThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
        try {
          const recentMsgs = await this.prisma.chatMessage.findMany({
            where: { sender_id: { in: ids }, sent_at: { gte: recentThreshold } },
            select: { sender_id: true },
          });
          for (const m of recentMsgs) if (m.sender_id) onlineSet.add(m.sender_id);
        } catch (e) {
          // best-effort; ignore errors querying messages
          void e;
        }

        try {
          const openAssignments = await this.prisma.bayAssignment.findMany({
            where: { open_time: true },
            select: { dispatcher_id: true, serviceman_id: true },
          });
          for (const a of openAssignments) {
            if (a.dispatcher_id) onlineSet.add(a.dispatcher_id);
            if (a.serviceman_id) onlineSet.add(a.serviceman_id);
          }
        } catch (e) {
          void e;
        }
      }

      return staff.map((s) => ({
        employee_id: s.employee_id,
        id: s.employee_id,
        full_name: s.full_name,
        username: s.username,
        role: s.role,
        online: onlineSet.has(s.employee_id),
      }));
    } catch (e) {
      // If presence calculation fails for any reason, fall back to a safe basic mapping
      return staff.map((s) => ({
        employee_id: s.employee_id,
        id: s.employee_id,
        full_name: s.full_name,
        username: s.username,
        role: s.role,
        online: false,
      }));
    }
  }

  // Return recent system logs (audit entries)
  async getAuditLogs(opts: { limit?: number; startDate?: string; endDate?: string; userId?: number } = {}) {
    const limit = Number(opts.limit ?? 200);
    const where: any = {};
    if (opts.userId) where.employee_id = Number(opts.userId);
    if (opts.startDate || opts.endDate) {
      where.timestamp = {} as any;
      if (opts.startDate) where.timestamp.gte = new Date(opts.startDate as any);
      if (opts.endDate) where.timestamp.lte = new Date(opts.endDate as any);
    }
    // compute total count matching filters (for pagination / UI)
    const total = await this.prisma.systemLog.count({ where }).catch(() => 0);
    const rows = await this.prisma.systemLog.findMany({
      where,
      include: { employee: true, approvedBy: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    const mapped = rows.map((r: any) => ({
      log_id: r.log_id,
      timestamp: r.timestamp,
      action: r.action,
      session_type: r.session_type ?? null,
      employee_id: r.employee_id,
      employee_name: r.employee?.full_name ?? r.employee?.username ?? null,
      related_record: r.related_record,
      approved_by: r.approved_by,
    }));

    return { total, rows: mapped };
  }

  async createStaff(dto: CreateStaffDto) {
    // Basic validation to avoid passing undefined into bcrypt
    if (!dto || !dto.full_name || !dto.password) {
      throw new BadRequestException('full_name and password are required');
    }

    // Debug: append incoming dto to a file to help diagnose unparsed/malformed payloads
    try {
      fs.appendFileSync(
        'scripts/create-staff-received.log',
        JSON.stringify(dto) + '\n',
      );
    } catch (e) {
      void e;
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.employee.create({
      data: {
        full_name: dto.full_name,
        username: dto.username ?? null,
        password: hashed,
        role: dto.role,
      },
    });

    // Best-effort logging: attribute to an existing Admin if present
    try {
      const adminActor = await this.prisma.employee.findFirst({
        where: { role: 'Admin' },
      });
      await this.loggingService.writeLog(
        adminActor?.employee_id,
        adminActor?.role as any,
        `CreateStaff: ${created.full_name} (${created.username})`,
        `employee:${created.employee_id}`,
      );
    } catch (e) {
      void e;
    }

    return {
      id: created.employee_id,
      full_name: created.full_name,
      username: created.username,
      role: created.role,
    };
  }

  async updateStaff(id: number, dto: Partial<CreateStaffDto>) {
    if (!id) throw new BadRequestException('Invalid id');
    const data: any = {};
    if (dto.full_name) data.full_name = dto.full_name;
    if (dto.username !== undefined) data.username = dto.username ?? null;
    if (dto.role) data.role = dto.role;
    if (dto.password) {
      // hash new password
      data.password = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.employee.update({
      where: { employee_id: id },
      data,
    });
    // Best-effort logging
    try {
      const adminActor = await this.prisma.employee.findFirst({
        where: { role: 'Admin' },
      });
      await this.loggingService.writeLog(
        adminActor?.employee_id,
        adminActor?.role as any,
        `UpdateStaff: ${updated.full_name} (id:${updated.employee_id})`,
        `employee:${updated.employee_id}`,
      );
    } catch (e) {
      void e;
    }

    return {
      id: updated.employee_id,
      full_name: updated.full_name,
      username: updated.username,
      role: updated.role,
    };
  }

  async deleteStaff(id: number) {
    if (!id) throw new BadRequestException('Invalid id');
    // Best-effort cleanup of dependent rows that would otherwise block deletion.
    // 1) Remove any ServicemanQueue entries referencing this employee (non-null FK)
    // 2) Nullify serviceman references on BayAssignment (nullable FK)
    try {
      await this.prisma.$transaction([
        this.prisma.servicemanQueue.deleteMany({ where: { serviceman_id: id } }),
        this.prisma.bayAssignment.updateMany({ where: { serviceman_id: id }, data: { serviceman_id: null } }),
      ]);
    } catch (e) {
      // ignore best-effort cleanup errors — we'll attempt delete and surface meaningful errors below
      void e;
    }

    try {
      await this.prisma.employee.delete({ where: { employee_id: id } });
    } catch (e: any) {
      // Surface a clearer message when foreign key constraints remain.
      if (e && e.code === 'P2003') {
        const constraint = e.meta?.constraint ?? 'unknown_constraint';
        throw new BadRequestException(`Cannot delete employee; dependent records exist (constraint: ${constraint}). Reassign or remove related records before retrying.`);
      }
      throw e;
    }

    // Best-effort logging
    try {
      const adminActor = await this.prisma.employee.findFirst({
        where: { role: 'Admin' },
      });
      await this.loggingService.writeLog(
        adminActor?.employee_id,
        adminActor?.role as any,
        `DeleteStaff: id:${id}`,
        `employee:${id}`,
      );
    } catch (e) {
      void e;
    }

    return { ok: true };
  }

  // Ensure the Bay table matches the given totalAvailableBays.
  // - Promotes bay_number values like 'B1' -> '1' when possible.
  // - Creates missing numeric bay rows (1..total) as Available.
  // - Attempts to delete numeric bay rows above total when they have no assignments and are Available.
  // This operation is best-effort and will skip deletions that would violate FK constraints or remove active/maintained bays.
  private async syncBaysToTotal(total: number, force = false) {
    if (!total || total <= 0) return { ok: false, reason: 'invalid total' };
    try {
      // Load all bays (atomic snapshot)
      let bays = await this.prisma.bay.findMany({ orderBy: { bay_id: 'asc' } });

      // helper to normalize bay_number like 'B12' -> '12', numeric strings stay numeric
      const normalize = (s: any) => {
        if (s === null || s === undefined) return null;
        const str = String(s).trim();
        const m = str.match(/^\d+$/);
        if (m) return str;
        const m2 = str.match(/^B(\d+)$/i);
        if (m2) return m2[1];
        return null;
      };

      const actions: any[] = [];
      const blocked: any[] = [];

      // 1) Promote promotable 'B#' entries when the numeric target is missing
      for (const b of bays) {
        const m = String(b.bay_number).match(/^B(\d+)$/i);
        if (m) {
          const target = m[1];
          const exists = bays.find((x) => String(x.bay_number) === target);
          if (!exists) {
            try {
              await this.prisma.bay.update({ where: { bay_id: b.bay_id }, data: { bay_number: target } });
              actions.push({ type: 'promote', bay_id: b.bay_id, from: b.bay_number, to: target });
            } catch (e) {
              actions.push({ type: 'promote', bay_id: b.bay_id, from: b.bay_number, to: target, ok: false, error: (e && e.message) || e });
            }
          }
        }
      }

      // Refresh bays after promotions
      bays = await this.prisma.bay.findMany({ orderBy: { bay_id: 'asc' } });

      // Build numeric map: key -> array of bay rows whose bay_number normalizes to that key
      const numericMap = new Map<string, any[]>();
      const others: any[] = [];
      for (const b of bays) {
        const n = normalize(b.bay_number);
        if (n) {
          if (!numericMap.has(n)) numericMap.set(n, []);
          numericMap.get(n)!.push(b);
        } else {
          others.push(b);
        }
      }

      // 2) Ensure exactly one row exists for each 1..total
      for (let i = 1; i <= total; i++) {
        const key = String(i);
        const list = numericMap.get(key) || [];
        if (list.length === 0) {
          // create missing
          try {
            const created = await this.prisma.bay.create({ data: { bay_number: key, status: 'Available' } });
            actions.push({ type: 'create', bay_number: key, createdId: created.bay_id });
            // add to map to reflect current state
            numericMap.set(key, [{ ...created }]);
          } catch (e) {
            actions.push({ type: 'create', bay_number: key, ok: false, error: (e && e.message) || e });
          }
        } else if (list.length > 1) {
          // deduplicate: keep one, attempt to delete extras that are safe (no assignments, status Available)
          // prefer to keep the lowest bay_id
          list.sort((a: any, b: any) => a.bay_id - b.bay_id);
          const keeper = list[0];
          const extras = list.slice(1);
          numericMap.set(key, [keeper]);
          for (const ex of extras) {
            try {
              const asgCount = await this.prisma.bayAssignment.count({ where: { bay_id: ex.bay_id } });
              if (asgCount === 0 && String(ex.status) === 'Available') {
                await this.prisma.bay.delete({ where: { bay_id: ex.bay_id } });
                actions.push({ type: 'delete-extra-duplicate', bay_id: ex.bay_id, bay_number: ex.bay_number });
              } else if (force) {
                // Force delete: remove dependent transactions, assignments, then bay
                try {
                  const assignments = await this.prisma.bayAssignment.findMany({ where: { bay_id: ex.bay_id }, select: { assignment_id: true } });
                  const assignmentIds = assignments.map((a: any) => a.assignment_id);
                  if (assignmentIds.length) {
                    await this.prisma.ballTransaction.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
                    // Best-effort log each deleted transaction set
                    try {
                      const adminActor = await this.prisma.employee.findFirst({ where: { role: 'Admin' } });
                      await this.loggingService.writeLog(adminActor?.employee_id, adminActor?.role as any, `ForceDeleteTransactions`, `bay:${ex.bay_id}`, undefined, 'Unknown');
                    } catch (e) { void e; }
                  }
                  await this.prisma.bayAssignment.deleteMany({ where: { bay_id: ex.bay_id } });
                  try {
                    const adminActor = await this.prisma.employee.findFirst({ where: { role: 'Admin' } });
                    await this.loggingService.writeLog(adminActor?.employee_id, adminActor?.role as any, `ForceDeleteAssignments`, `bay:${ex.bay_id}`, undefined, 'Unknown');
                  } catch (e) { void e; }
                  await this.prisma.bay.delete({ where: { bay_id: ex.bay_id } });
                  actions.push({ type: 'force-delete-extra-duplicate', bay_id: ex.bay_id, bay_number: ex.bay_number, deletedAssignments: assignmentIds.length });
                } catch (innerErr) {
                  blocked.push({ reason: 'duplicate-force-delete-error', bay_id: ex.bay_id, bay_number: ex.bay_number, error: (innerErr && innerErr.message) || innerErr });
                }
              } else {
                blocked.push({ reason: 'duplicate-not-deletable', bay_id: ex.bay_id, bay_number: ex.bay_number, assignments: asgCount, status: ex.status });
              }
            } catch (e) {
              blocked.push({ reason: 'duplicate-delete-error', bay_id: ex.bay_id, bay_number: ex.bay_number, error: (e && e.message) || e });
            }
          }
        }
      }

      // 3) Any bay rows not in 1..total (others and numeric keys > total) should be removed if safe
      // Collect candidates: others + numeric entries with key > total
      const toCheck: any[] = [];
      for (const b of others) toCheck.push(b);
      for (const [k, arr] of numericMap.entries()) {
        const n = Number(k);
        if (!Number.isFinite(n) || n > total) {
          for (const r of arr) toCheck.push(r);
          // mark for removal from map so final count computation is accurate
          numericMap.delete(k);
        }
      }

      for (const c of toCheck) {
        try {
          const asgCount = await this.prisma.bayAssignment.count({ where: { bay_id: c.bay_id } });
          if (asgCount === 0 && String(c.status) === 'Available') {
            await this.prisma.bay.delete({ where: { bay_id: c.bay_id } });
            actions.push({ type: 'delete-out-of-range', bay_id: c.bay_id, bay_number: c.bay_number });
          } else if (force) {
            try {
              const assignments = await this.prisma.bayAssignment.findMany({ where: { bay_id: c.bay_id }, select: { assignment_id: true } });
              const assignmentIds = assignments.map((a: any) => a.assignment_id);
              if (assignmentIds.length) {
                await this.prisma.ballTransaction.deleteMany({ where: { assignment_id: { in: assignmentIds } } });
                try {
                  const adminActor = await this.prisma.employee.findFirst({ where: { role: 'Admin' } });
                  await this.loggingService.writeLog(adminActor?.employee_id, adminActor?.role as any, `ForceDeleteTransactions`, `bay:${c.bay_id}`, undefined, 'Unknown');
                } catch (e) { void e; }
              }
              await this.prisma.bayAssignment.deleteMany({ where: { bay_id: c.bay_id } });
              try {
                const adminActor = await this.prisma.employee.findFirst({ where: { role: 'Admin' } });
                await this.loggingService.writeLog(adminActor?.employee_id, adminActor?.role as any, `ForceDeleteAssignments`, `bay:${c.bay_id}`, undefined, 'Unknown');
              } catch (e) { void e; }
              await this.prisma.bay.delete({ where: { bay_id: c.bay_id } });
              actions.push({ type: 'force-delete-out-of-range', bay_id: c.bay_id, bay_number: c.bay_number, deletedAssignments: assignmentIds.length });
            } catch (innerErr) {
              blocked.push({ reason: 'out-of-range-force-delete-error', bay_id: c.bay_id, bay_number: c.bay_number, error: (innerErr && innerErr.message) || innerErr });
            }
          } else {
            blocked.push({ reason: 'out-of-range-not-deletable', bay_id: c.bay_id, bay_number: c.bay_number, assignments: asgCount, status: c.status });
          }
        } catch (e) {
          blocked.push({ reason: 'out-of-range-delete-error', bay_id: c.bay_id, bay_number: c.bay_number, error: (e && e.message) || e });
        }
      }

      // Final verification: count numericMap keys that are 1..total
      const finalBays = await this.prisma.bay.findMany({ orderBy: { bay_id: 'asc' } });
      const finalNumeric = finalBays.filter((b) => {
        const n = normalize(b.bay_number);
        if (!n) return false;
        const num = Number(n);
        return Number.isFinite(num) && num >= 1 && num <= total;
      });

      const finalCount = finalNumeric.length;

      return { ok: true, desired: total, finalCount, actions, blocked };
    } catch (e) {
      return { ok: false, error: (e && e.message) || e };
    }
  }

  // Return application settings as a key -> value map
  async getSettings() {
    const rows = await (this.prisma as any).systemSetting.findMany({
      select: { key: true, value: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;

    // Also attempt to read the typed SiteConfig, PricingConfig, and OperationalConfig (if present) and merge known fields
    try {
      const site = await (this.prisma as any).siteConfig.findFirst();
      if (site) {
        out.siteName = site.site_name;
        out.currencySymbol = site.currency_symbol;
        // return a boolean for enableReservations to make it easier for callers
        out.enableReservations = String(site.enable_reservations === true);
        // include typed seal path if present (server-relative path like /uploads/xxx)
        if (site.seal_path) out.sealPath = site.seal_path;
      }

      const pricing = await (this.prisma as any).pricingConfig.findFirst();
      if (pricing) {
        out.timedSessionRate = String(pricing.timed_session_rate ?? '0');
        out.openTimeRate = String(pricing.open_time_rate ?? '0');
      }

      const ops = await (this.prisma as any).operationalConfig.findFirst();
      if (ops) {
        out.totalAvailableBays = String(ops.total_available_bays ?? 0);
        out.standardTeeIntervalMinutes = String(
          ops.standard_tee_interval_minutes ?? 0,
        );
        out.ballBucketWarningThreshold = String(
          ops.ball_bucket_warning_threshold ?? 0,
        );
      }
    } catch (e) {
      void e;
      // ignore if the tables don't exist yet (migration not run)
    }
    return out;
  }

  // Update multiple settings. Payload is a map of key->value strings.
  async updateSettings(payload: Record<string, any>) {
    if (!payload || typeof payload !== 'object') throw new BadRequestException('Invalid payload');

  const siteKeys = ['siteName', 'currencySymbol', 'enableReservations', 'sealPath'];
    const pricingKeys = ['timedSessionRate', 'openTimeRate'];
    const operationalKeys = ['totalAvailableBays', 'standardTeeIntervalMinutes', 'ballBucketWarningThreshold'];

    try {
      // Site config
      const hasSiteKeys = Object.keys(payload).some((k) => siteKeys.includes(k));
      if (hasSiteKeys) {
        const site = await (this.prisma as any).siteConfig.findFirst();
        const siteData: any = {};
        if (payload.siteName !== undefined) siteData.site_name = String(payload.siteName ?? '');
        if (payload.currencySymbol !== undefined) siteData.currency_symbol = String(payload.currencySymbol ?? '');
        if (payload.enableReservations !== undefined) siteData.enable_reservations = payload.enableReservations === true || String(payload.enableReservations) === 'true';
        if (payload.sealPath !== undefined) siteData.seal_path = String(payload.sealPath ?? '');
        if (site) await (this.prisma as any).siteConfig.update({ where: { site_id: site.site_id }, data: siteData });
        else await (this.prisma as any).siteConfig.create({ data: siteData });
      }

      // Pricing config
      const hasPricingKeys = Object.keys(payload).some((k) => pricingKeys.includes(k));
      if (hasPricingKeys) {
        const pricing = await (this.prisma as any).pricingConfig.findFirst();
        const pricingData: any = {};
        if (payload.timedSessionRate !== undefined) pricingData.timed_session_rate = String(payload.timedSessionRate ?? '0');
        if (payload.openTimeRate !== undefined) pricingData.open_time_rate = String(payload.openTimeRate ?? '0');
        if (pricing) await (this.prisma as any).pricingConfig.update({ where: { pricing_id: pricing.pricing_id }, data: pricingData });
        else await (this.prisma as any).pricingConfig.create({ data: pricingData });
      }

      // Operational config
      let syncSummary: any = null;
      const hasOperationalKeys = Object.keys(payload).some((k) => operationalKeys.includes(k));
      if (hasOperationalKeys) {
        const ops = await (this.prisma as any).operationalConfig.findFirst();
        const opsData: any = {};
        if (payload.totalAvailableBays !== undefined) opsData.total_available_bays = Number(payload.totalAvailableBays ?? 0);
        if (payload.standardTeeIntervalMinutes !== undefined) opsData.standard_tee_interval_minutes = Number(payload.standardTeeIntervalMinutes ?? 0);
        if (payload.ballBucketWarningThreshold !== undefined) opsData.ball_bucket_warning_threshold = Number(payload.ballBucketWarningThreshold ?? 0);
        if (ops) await (this.prisma as any).operationalConfig.update({ where: { operational_id: ops.operational_id }, data: opsData });
        else await (this.prisma as any).operationalConfig.create({ data: opsData });

        // After persisting OperationalConfig, attempt a best-effort sync. Honor destructive force only if explicitly confirmed.
        try {
          const finalOps = await (this.prisma as any).operationalConfig.findFirst();
          const desired = Number(finalOps?.total_available_bays ?? 0);
          if (Number.isFinite(desired) && desired > 0) {
            const forceRequested = payload.force === true || String(payload.force) === 'true';
            const confirmed = String(payload.force_confirmation ?? '').trim() === 'I UNDERSTAND';
            const forceFlag = forceRequested && confirmed;
            try {
              syncSummary = await this.syncBaysToTotal(desired, forceFlag);
            } catch (e) { syncSummary = { ok: false, error: String(e) }; }
          }
        } catch (e) { void e; }
      }

      // Persist remaining keys into the SystemSetting key/value store
      const keys = Object.keys(payload).filter((k) => !siteKeys.includes(k) && !pricingKeys.includes(k) && !operationalKeys.includes(k));
      for (const key of keys) {
        const value = String(payload[key] ?? '');
        await (this.prisma as any).systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }

      // Best-effort logging for settings update
      try {
        const adminActor = await this.prisma.employee.findFirst({ where: { role: 'Admin' } });
        await this.loggingService.writeLog(adminActor?.employee_id, adminActor?.role as any, `UpdateSettings: ${Object.keys(payload).join(',')}`, 'settings');
      } catch (e) { void e; }

      return { ok: true, syncSummary };
    } catch (e) {
      void e;
      throw new BadRequestException('Failed to persist typed settings - has migrations been applied?');
    }
  }

  /**
   * Perform an admin override on a bay. Supported actions:
   * - 'End Session' : closes the active bay assignment (if any) and marks bay Available
   * - 'Lock Bay for Maintenance' : sets bay.status = Maintenance
   * - 'Reserved' : sets bay.status = SpecialUse
   *
   * adminId (optional) may be provided to record who performed the override.
   */
  async overrideBay(bayNo: string, action: string, adminId?: number, reserveName?: string) {
    if (!bayNo) throw new BadRequestException('bayNo is required');
    if (!action) throw new BadRequestException('action is required');

    // find bay by bay_number (bay_number is stored as string in schema)
    let bay = await this.prisma.bay.findFirst({
      where: { bay_number: String(bayNo) },
    });
    // If not found by bay_number, and bayNo looks like a numeric id, try lookup by bay_id
    if (!bay) {
      const maybeId = Number(bayNo);
      if (!Number.isNaN(maybeId)) {
        try {
          bay = await this.prisma.bay.findUnique({ where: { bay_id: maybeId } as any });
        } catch (e) {
          void e;
        }
      }
    }
    if (!bay) {
      throw new BadRequestException('Bay not found');
    }

    const a = action.toLowerCase();
    // record result object
    const result: any = {
      ok: true,
      bay: { id: bay.bay_id, bay_number: bay.bay_number },
      action,
    };

  // accept either 'end session' or short 'end' from various clients
  if (a.includes('end') || a.includes('end session')) {
      // close any open assignments for this bay (handle possible DB inconsistency with multiple open rows)
      const openAssignments = await this.prisma.bayAssignment.findMany({
        where: { bay_id: bay.bay_id, open_time: true },
        orderBy: { assigned_time: 'desc' },
      });

      if (openAssignments && openAssignments.length > 0) {
        const ids = openAssignments.map((r) => r.assignment_id);
        const playerIds = openAssignments.map((r) => r.player_id).filter((p) => p !== null && p !== undefined);
        // set open_time=false and end_time=now for all open assignments
        await this.prisma.bayAssignment.updateMany({
          where: { assignment_id: { in: ids } },
          data: { open_time: false, end_time: new Date(), session_type: 'Timed' },
        });

        // update Player.end_time for associated players so recorded time is persisted
        if (playerIds && playerIds.length > 0) {
          try {
            await this.prisma.player.updateMany({ where: { player_id: { in: playerIds } }, data: { end_time: new Date() } });
          } catch (e) {
            // best-effort: log and continue
            try { await this.loggingService.writeLog(undefined as any, Role.Admin, `FailedUpdatePlayerEndTime: players:${playerIds.join(',')}`, `bay:${bay.bay_id}`); } catch {};
          }
        }

        // mark bay available
        await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Available' } });

        result.assignment_ids = ids;
        result.message = `Closed ${ids.length} active session(s)`;

        // log the session ends
        try {
          await this.loggingService.writeLog(adminId ?? undefined, Role.Admin, `EndSession: assignments:${ids.join(',')}`, `bay:${bay.bay_id}`);
        } catch (e) { void e; }
      } else {
        // nothing to end — still mark bay available
        await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Available' } });
        result.message = 'No active session; bay marked available';
      }
    } else if (a.includes('maintenance')) {
      await this.prisma.bay.update({
        where: { bay_id: bay.bay_id },
        data: {
          status: 'Maintenance',
          updated_at: new Date(),
          updated_by: adminId ?? undefined,
        },
      });
      result.message = 'Bay locked for maintenance';
    } else if (a.includes('reserved')) {
      // Persist the reservation and optional reserved name into bay.note so
      // frontend can show the reserved-for name even before a Player record exists.
      const data: any = {
        status: 'SpecialUse',
        updated_at: new Date(),
        updated_by: adminId ?? undefined,
      };
      if (reserveName && String(reserveName).trim().length > 0) data.note = String(reserveName).trim();
      await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data });
      result.message = 'Bay reserved';
    } else {
      throw new BadRequestException('Unknown action');
    }

    // create a system log entry if we have an admin id
    try {
      if (adminId) {
        await this.loggingService.writeLog(adminId, Role.Admin, `Override: ${action}`, `bay:${bay.bay_id}`);
      }
    } catch (e) {
      void e;
    }

    // After performing the override, attempt to run a best-effort non-force sync so UI reflects settings
    let syncSummary: any = null;
    try {
      const ops = await (this.prisma as any).operationalConfig.findFirst();
      const desired = Number(ops?.total_available_bays ?? 0);
      if (Number.isFinite(desired) && desired > 0) {
          try {
            syncSummary = await this.syncBaysToTotal(desired, false);
            try {
              await this.loggingService.writeLog(undefined as any, Role.Admin, `SyncBaysToTotal: ${desired}`, `sync:${desired}`);
            } catch (e) {
              void e;
            }
          } catch (e) {
          syncSummary = { ok: false, error: String(e) };
        }
      }
    } catch (e) {
      void e;
    }

    return { ok: true, syncSummary };
  }

  /**
   * Update a session/player record by an identifier.
   * id may be a receipt_number, a literal 'P<playerId>' string, or numeric player_id.
   * body may contain: player_name (nickname) and serviceman_id (or servicemanId)
   */
  async updateSession(id: string, body: any = {}, adminId?: number) {
    if (!id) throw new BadRequestException('Invalid session id');

    // Attempt to resolve player by receipt_number or P<id> or numeric id
    let player: any = null;
    try {
      // If id looks like P<number>
      const m = /^P(\d+)$/i.exec(String(id));
      if (m) {
        const pid = Number(m[1]);
        player = await this.prisma.player.findUnique({ where: { player_id: pid } as any }).catch(() => null);
      }
      if (!player) {
        // try numeric id
        const n = Number(id);
        if (!Number.isNaN(n)) {
          player = await this.prisma.player.findUnique({ where: { player_id: n } as any }).catch(() => null);
        }
      }
      if (!player) {
        // try receipt_number match
        player = await this.prisma.player.findFirst({ where: { receipt_number: String(id) } }).catch(() => null);
      }
    } catch (e) {
      void e;
    }

    if (!player) throw new BadRequestException('Session/player not found');

    const updates: any = {};
    if (body?.player_name !== undefined) {
      updates.nickname = body.player_name ?? null;
    }
    if (Object.keys(updates).length > 0) {
      try {
        await this.prisma.player.update({ where: { player_id: player.player_id }, data: updates });
      } catch (e: any) {
        Logger.error('Failed updating player', e, 'AdminService');
        throw new BadRequestException('Failed updating player');
      }
    }

    // Update active bay assignment serviceman if provided
    const svcId = body?.serviceman_id ?? body?.servicemanId ?? null;
    if (svcId !== undefined && svcId !== null) {
      try {
        // find active assignment for this player
        const assignment = await this.prisma.bayAssignment.findFirst({ where: { player_id: player.player_id, open_time: true } }).catch(() => null);
        if (!assignment) throw new BadRequestException('Active assignment not found for player');
        // If svcId is falsy, nullify serviceman; else connect
        const data: any = {};
        if (!svcId) data.serviceman_id = null;
        else data.serviceman = { connect: { employee_id: Number(svcId) } };
        // Use update to set serviceman relation
        await this.prisma.bayAssignment.update({ where: { assignment_id: assignment.assignment_id }, data });
      } catch (e: any) {
        Logger.error('Failed updating assignment serviceman', e, 'AdminService');
        throw new BadRequestException('Failed updating serviceman assignment');
      }
    }

    // Best-effort logging
    try {
      await this.loggingService.writeLog(adminId ?? undefined, Role.Admin, `UpdateSession: player:${player.player_id}`, `player:${player.player_id}`);
    } catch (e) { void e; }

    return { ok: true };
  }

  // Start a session on a bay by creating a Player and BayAssignment and marking bay Occupied.
  async startSession(bayNo: string, payload: any) {
    if (!bayNo) throw new BadRequestException('bayNo is required');
    const body = payload || {};
    Logger.log(`AdminService.startSession called for bay=${bayNo} payload=${JSON.stringify(body)}`, 'AdminService');

    // find bay by bay_number or id
    let bay = await this.prisma.bay.findFirst({ where: { bay_number: String(bayNo) } });
    if (!bay) {
      const maybeId = Number(bayNo);
      if (!Number.isNaN(maybeId)) {
        bay = await this.prisma.bay.findUnique({ where: { bay_id: maybeId } as any });
      }
    }
    if (!bay) throw new BadRequestException('Bay not found');

    // ensure bay is not already occupied (open assignment)
    const existing = await this.prisma.bayAssignment.findFirst({ where: { bay_id: bay.bay_id, open_time: true } });
    if (existing) throw new BadRequestException('Bay already has an active session');

  // Build player data
  // Backwards-compat: some callers send `full_name` but the Player model only stores `nickname`.
  // Normalize by preferring explicit nickname, falling back to full_name when present.
  // If caller didn't provide a name but the bay has a reservation note (bay.note),
  // use that as the player nickname so reserved names persist into the created Player.
  const reserveNote = (bay && typeof bay.note === 'string') ? String(bay.note).trim() : '';
  const nickname = String(body?.nickname ?? body?.name ?? body?.full_name ?? reserveNote ?? '').trim() || null;
  const full_name = null; // not stored on Player (kept for compatibility variable but not persisted)
    const start_time = new Date();
  // If no end_time supplied, leave it null to represent an open session (schema now allows nullable end_time)
  const end_time = body?.end_time ? new Date(String(body.end_time)) : null;

    // Determine creator: prefer provided dispatcherId, otherwise pick an existing Dispatcher or Admin account
    let createdBy: number | undefined = undefined;
    try {
      if (body?.dispatcherId) {
        const disp = await this.prisma.employee.findUnique({ where: { employee_id: Number(body.dispatcherId) as any } as any }).catch(() => null);
        if (disp) createdBy = disp.employee_id;
      }
      if (!createdBy) {
        const disp = await this.prisma.employee.findFirst({ where: { role: 'Dispatcher' } }).catch(() => null);
        if (disp) createdBy = disp.employee_id;
      }
      if (!createdBy) {
        const admin = await this.prisma.employee.findFirst({ where: { role: 'Admin' } }).catch(() => null);
        if (admin) createdBy = admin.employee_id;
      }
    } catch (e) {
      void e;
    }

    if (!createdBy) throw new BadRequestException('No dispatcher or admin account available to attribute created_by for new player');

    // Determine price_per_hour: prefer explicit body value, otherwise fall back to pricing config
    // For open sessions (no end_time) we store zero price to avoid pricing open play
    let pricePerHour: string | undefined = undefined;
    try {
      if (body?.price_per_hour !== undefined && body?.price_per_hour !== null) {
        pricePerHour = String(body.price_per_hour);
      } else {
        const pricing = await (this.prisma as any).pricingConfig.findFirst().catch(() => null);
        const isTimed = Boolean(body?.end_time);
        if (!isTimed) {
          // open sessions are not priced
          pricePerHour = '0.00';
        } else if (pricing) {
          // pricing fields are Decimal; stringify safely
          pricePerHour = String(pricing.timed_session_rate ?? pricing.open_time_rate ?? '0');
        } else {
          pricePerHour = '0.00';
        }
      }
    } catch (e) {
      pricePerHour = '0.00';
    }

  // Create player record (player.end_time may be null for open sessions)
  const player = await this.prisma.player.create({ data: { nickname: nickname ?? undefined, start_time, end_time: end_time ?? null, price_per_hour: pricePerHour ?? '0.00', created_by: createdBy } as any });

    // Create assignment
    // Ensure we have a dispatcher id to attach to the assignment (fallback to createdBy if not supplied)
    const assignmentDispatcherId = body?.dispatcherId ?? createdBy;

    // Determine if this is an open (stopwatch) session or a timed session.
    // If the caller provided an explicit end_time, treat as Timed; otherwise Open.
    const isOpenSession = !body?.end_time;

    const assignmentData: any = {
      // attach player by relation connect so Prisma uses the nested relation input
      player: { connect: { player_id: player.player_id } },
      assigned_time: new Date(),
      open_time: Boolean(isOpenSession),
      end_time: end_time ?? null,
      // typed session designation so historical records show whether it was Open/Timed/Reserved
      session_type: isOpenSession ? 'Open' : 'Timed',
      // connect relations explicitly to satisfy Prisma's strict create input
      bay: { connect: { bay_id: bay.bay_id } },
      dispatcher: { connect: { employee_id: assignmentDispatcherId } },
    } as any;
    if (body?.servicemanId) assignmentData.serviceman = { connect: { employee_id: body.servicemanId } };

    const assignment = await this.prisma.bayAssignment.create({ data: assignmentData });

    // mark bay occupied
    try {
      await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Occupied' } });
    } catch (e) { void e; }

    // best-effort logging
    try {
      await this.loggingService.writeLog(undefined as any, Role.Admin, `StartSession: assignment:${assignment.assignment_id}`, `bay:${bay.bay_id}`);
    } catch (e) { void e; }

  // Return a compact player object using the stored nickname (no full_name column exists)
  const out = { ok: true, player: { player_id: player.player_id, nickname: player.nickname ?? null }, assignment_id: assignment.assignment_id };
    Logger.log(`AdminService.startSession created assignment=${assignment.assignment_id} player=${player.player_id}`, 'AdminService');
    return out;
  }
}
