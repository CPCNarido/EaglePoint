import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import * as bcrypt from 'bcryptjs';
import { BadRequestException } from '@nestjs/common';

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
    const bays = baysRaw.map((b) => {
      const isOccupied = occupiedBayIds.has(b.bay_id);
      return { bay_id: b.bay_id, bay_number: b.bay_number, status: isOccupied ? 'Occupied' : String(b.status) };
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
    const occupiedBays = occupiedBayIds.size;
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
}
