import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class LoggingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Write a SystemLog entry (best-effort). If actorId is missing, the call is a no-op.
   * sessionType is optional human-friendly name (e.g. 'Timed' | 'Open').
   */
  async writeLog(
    actorId: number | undefined,
    role: Role | undefined,
    action: string,
    related?: string,
    approvedBy?: number,
    sessionType?: string,
  ) {
    try {
      if (!actorId) return;
      // Cast to any to avoid mismatches when Prisma client types are not yet regenerated
      await this.prisma.systemLog.create({
        // (we intentionally cast to any for best-effort logging)
        data: {
          employee_id: actorId,
          role: role as any,
          action,
          related_record: related ?? undefined,
          approved_by: approvedBy ?? undefined,
          session_type: sessionType ?? undefined,
        } as any,
      });
    } catch (e) {
      // swallow - logging is best-effort
      void e;
    }
  }
}
