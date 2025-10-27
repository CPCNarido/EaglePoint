import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Determine active assignments (players occupying bays)
    const activeAssignments = await this.prisma.bayAssignment.findMany({ where: { open_time: true }, select: { bay_id: true } });
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
    const baysRaw = await this.prisma.bay.findMany({ select: { bay_id: true, bay_number: true, status: true } });
    // Treat bays with a SpecialUse status (reserved) as occupied for dashboard counts
    const bays = baysRaw.map((b) => {
      const originalStatus = String(b.status);
      const isOccupied = occupiedBayIds.has(b.bay_id) || originalStatus === 'SpecialUse';
      const computedStatus = isOccupied ? 'Occupied' : originalStatus;
      return { bay_id: b.bay_id, bay_number: b.bay_number, status: computedStatus, originalStatus };
    });

    // Revenue today: sum price_per_hour * hours for players whose start_time is today
    const playersToday = await this.prisma.player.findMany({ where: { start_time: { gte: startOfDay, lte: now } }, select: { start_time: true, end_time: true, price_per_hour: true } });
    let revenue = 0;
    for (const p of playersToday) {
      try {
        const start = p.start_time;
        const end = p.end_time ?? now;
        const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
        revenue += Number(p.price_per_hour) * hours;
      } catch (e) {}
    }

    const totalBays = bays.length;
  const maintenanceBays = bays.filter((b) => b.status === 'Maintenance').length;
  // Count occupied bays from the mapped list — this now includes SpecialUse (reserved) as Occupied
  const occupiedBays = bays.filter((b) => b.status === 'Occupied').length;
  const availableBays = Math.max(0, totalBays - occupiedBays - maintenanceBays);

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

  // Return basic staff list (id, full_name, username, role)
  async getStaff() {
    const staff = await this.prisma.employee.findMany({ select: { employee_id: true, full_name: true, username: true, role: true } });
    return staff.map((s) => ({ id: s.employee_id, full_name: s.full_name, username: s.username, role: s.role }));
  }

  async createStaff(dto: CreateStaffDto) {
    // Basic validation to avoid passing undefined into bcrypt
    if (!dto || !dto.full_name || !dto.password) {
      throw new BadRequestException('full_name and password are required');
    }

    // Debug: append incoming dto to a file to help diagnose unparsed/malformed payloads
    try {
      const fs = require('fs');
      fs.appendFileSync('scripts/create-staff-received.log', JSON.stringify(dto) + '\n');
    } catch (e) {}

    const hashed = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.employee.create({ data: { full_name: dto.full_name, username: dto.username ?? null, password: hashed, role: dto.role } });
    return { id: created.employee_id, full_name: created.full_name, username: created.username, role: created.role };
  }

  async updateStaff(id: number, dto: Partial<CreateStaffDto>) {
    if (!id) throw new BadRequestException('Invalid id');
    const data: any = {};
    if (dto.full_name) data.full_name = dto.full_name;
    if (dto.username !== undefined) data.username = dto.username ?? null;
    if (dto.role) data.role = dto.role;
    if (dto.password) {
      // hash new password
      data.password = await bcrypt.hash(dto.password as string, 10);
    }

    const updated = await this.prisma.employee.update({ where: { employee_id: id }, data });
    return { id: updated.employee_id, full_name: updated.full_name, username: updated.username, role: updated.role };
  }

  async deleteStaff(id: number) {
    if (!id) throw new BadRequestException('Invalid id');
    await this.prisma.employee.delete({ where: { employee_id: id } });
    return { ok: true };
  }

  // Return application settings as a key -> value map
  async getSettings() {
  const rows = await (this.prisma as any).systemSetting.findMany({ select: { key: true, value: true } });
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
      }

      const pricing = await (this.prisma as any).pricingConfig.findFirst();
      if (pricing) {
        out.timedSessionRate = String(pricing.timed_session_rate ?? '0');
        out.openTimeRate = String(pricing.open_time_rate ?? '0');
      }

      const ops = await (this.prisma as any).operationalConfig.findFirst();
      if (ops) {
        out.totalAvailableBays = String(ops.total_available_bays ?? 0);
        out.standardTeeIntervalMinutes = String(ops.standard_tee_interval_minutes ?? 0);
        out.ballBucketWarningThreshold = String(ops.ball_bucket_warning_threshold ?? 0);
      }
    } catch (e) {
      // ignore if the tables don't exist yet (migration not run)
    }
    return out;
  }

  // Update multiple settings. Payload is a map of key->value strings.
  async updateSettings(payload: Record<string, any>) {
    if (!payload || typeof payload !== 'object') throw new BadRequestException('Invalid payload');
  // If SiteConfig / PricingConfig / OperationalConfig keys are present, persist them into their typed tables
  const siteKeys = ['siteName', 'currencySymbol', 'enableReservations'];
  const pricingKeys = ['timedSessionRate', 'openTimeRate'];
    const operationalKeys = ['totalAvailableBays', 'standardTeeIntervalMinutes', 'ballBucketWarningThreshold'];

    try {
      const hasSiteKeys = Object.keys(payload).some((k) => siteKeys.includes(k));
      if (hasSiteKeys) {
        const site = await (this.prisma as any).siteConfig.findFirst();
  const siteData: any = {};
  if (payload.siteName !== undefined) siteData.site_name = String(payload.siteName ?? '');
  if (payload.currencySymbol !== undefined) siteData.currency_symbol = String(payload.currencySymbol ?? '');
  if (payload.enableReservations !== undefined) siteData.enable_reservations = (payload.enableReservations === true || String(payload.enableReservations) === 'true');

        if (site) {
          await (this.prisma as any).siteConfig.update({ where: { site_id: site.site_id }, data: siteData });
        } else {
          await (this.prisma as any).siteConfig.create({ data: siteData });
        }
      }

      const hasPricingKeys = Object.keys(payload).some((k) => pricingKeys.includes(k));
      if (hasPricingKeys) {
        const pricing = await (this.prisma as any).pricingConfig.findFirst();
  const pricingData: any = {};
  if (payload.timedSessionRate !== undefined) pricingData.timed_session_rate = String(payload.timedSessionRate ?? '0');
  if (payload.openTimeRate !== undefined) pricingData.open_time_rate = String(payload.openTimeRate ?? '0');

        if (pricing) {
          await (this.prisma as any).pricingConfig.update({ where: { pricing_id: pricing.pricing_id }, data: pricingData });
        } else {
          await (this.prisma as any).pricingConfig.create({ data: pricingData });
        }
      }

      const hasOperationalKeys = Object.keys(payload).some((k) => operationalKeys.includes(k));
      if (hasOperationalKeys) {
        const ops = await (this.prisma as any).operationalConfig.findFirst();
        const opsData: any = {};
        if (payload.totalAvailableBays !== undefined) opsData.total_available_bays = Number(payload.totalAvailableBays ?? 0);
        if (payload.standardTeeIntervalMinutes !== undefined) opsData.standard_tee_interval_minutes = Number(payload.standardTeeIntervalMinutes ?? 0);
        if (payload.ballBucketWarningThreshold !== undefined) opsData.ball_bucket_warning_threshold = Number(payload.ballBucketWarningThreshold ?? 0);

        if (ops) {
          await (this.prisma as any).operationalConfig.update({ where: { operational_id: ops.operational_id }, data: opsData });
        } else {
          await (this.prisma as any).operationalConfig.create({ data: opsData });
        }
      }
    } catch (e) {
      // surface helpful message for migrations / db issues
      throw new BadRequestException('Failed to persist typed settings - has migrations been applied?');
    }

    // Persist remaining keys into the SystemSetting key/value store
    const keys = Object.keys(payload).filter((k) => !siteKeys.includes(k) && !pricingKeys.includes(k) && !operationalKeys.includes(k));
    for (const key of keys) {
      const value = String(payload[key] ?? '');
      await (this.prisma as any).systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    return { ok: true };
  }

  /**
   * Perform an admin override on a bay. Supported actions:
   * - 'End Session' : closes the active bay assignment (if any) and marks bay Available
   * - 'Lock Bay for Maintenance' : sets bay.status = Maintenance
   * - 'Reserved' : sets bay.status = SpecialUse
   *
   * adminId (optional) may be provided to record who performed the override.
   */
  async overrideBay(bayNo: string, action: string, adminId?: number) {
    if (!bayNo) throw new BadRequestException('bayNo is required');
    if (!action) throw new BadRequestException('action is required');

    // find bay by bay_number (bay_number is stored as string in schema)
    const bay = await this.prisma.bay.findFirst({ where: { bay_number: String(bayNo) } });
    if (!bay) {
      throw new BadRequestException('Bay not found');
    }

    const a = action.toLowerCase();
    // record result object
    const result: any = { ok: true, bay: { id: bay.bay_id, bay_number: bay.bay_number }, action };

    if (a.includes('end session')) {
      // close any open assignment for this bay
      const assignment = await this.prisma.bayAssignment.findFirst({ where: { bay_id: bay.bay_id, open_time: true }, orderBy: { assigned_time: 'desc' } });
      if (assignment) {
        await this.prisma.bayAssignment.update({ where: { assignment_id: assignment.assignment_id }, data: { open_time: false, end_time: new Date() } });
        // mark bay available
        await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Available' } });
        result.assignment_id = assignment.assignment_id;
        result.message = 'Session ended';
      } else {
        // nothing to end — still mark bay available
        await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Available' } });
        result.message = 'No active session; bay marked available';
      }
    } else if (a.includes('maintenance')) {
      await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'Maintenance', updated_at: new Date(), updated_by: adminId ?? undefined } });
      result.message = 'Bay locked for maintenance';
    } else if (a.includes('reserved')) {
      await this.prisma.bay.update({ where: { bay_id: bay.bay_id }, data: { status: 'SpecialUse', updated_at: new Date(), updated_by: adminId ?? undefined } });
      result.message = 'Bay reserved';
    } else {
      throw new BadRequestException('Unknown action');
    }

    // create a system log entry if we have an admin id
    try {
      if (adminId) {
        await this.prisma.systemLog.create({ data: { employee_id: adminId, role: Role.Admin, action: `Override: ${action}`, related_record: `bay:${bay.bay_id}` } });
      }
    } catch (e) {
      // don't fail the whole operation if logging fails
    }

    return result;
  }
}
