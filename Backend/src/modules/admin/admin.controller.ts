import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  Put,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { ChatService } from '../chat/chat.service';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { CreateStaffDto } from './dto/create-staff.dto';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService, private jwtService: JwtService, private chatService: ChatService) {}

  @Get('overview')
  async overview() {
    return this.adminService.getOverview();
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() req: Request & { user?: any }) {
    const userId = req?.user?.sub;
    if (!userId) return {};
    const profile = await this.adminService.getProfile(Number(userId));
    return profile ?? {};
  }

  @Get('staff')
  async listStaff() {
    return this.adminService.getStaff();
  }

  // Chat rooms listing
  @Get('chats')
  async listChats() {
    try {
      return await this.adminService.listChats();
    } catch (e: any) {
      throw new InternalServerErrorException(e?.message ?? 'Failed listing chats');
    }
  }

  // Lightweight previews for roster (last message per staff)
  @Get('chats/previews')
  async chatPreviews() {
    try {
      return await this.adminService.getChatPreviews();
    } catch (e: any) {
      Logger.error('Failed to get chat previews', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed getting chat previews');
    }
  }

  // Messages for a chat
  @Get('chats/:chatId/messages')
  async getChatMessages(@Param('chatId') chatIdStr: string) {
    try {
      const chatId = Number(chatIdStr);
      if (Number.isNaN(chatId)) throw new BadRequestException('Invalid chatId');
      return await this.adminService.getChatMessages(chatId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed listing messages');
    }
  }

  // Post a message to a chat (admin)
  @UseGuards(AuthGuard)
  @Post('chats/:chatId/messages')
  async postChatMessage(@Param('chatId') chatIdStr: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      const chatId = Number(chatIdStr);
      if (Number.isNaN(chatId)) throw new BadRequestException('Invalid chatId');
      const content = String(body?.content ?? '');
      if (!content) throw new BadRequestException('content is required');
      const senderId = req?.user?.sub ? Number(req.user.sub) : undefined;
      return await this.adminService.postChatMessage(chatId, content, senderId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed posting message');
    }
  }

  // Broadcast message to all users / all roles
  @UseGuards(AuthGuard)
  @Post('chats/broadcast')
  async broadcast(@Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      const content = String(body?.content ?? '');
      if (!content) throw new BadRequestException('content is required');
      const senderId = req?.user?.sub ? Number(req.user.sub) : undefined;
      return await this.adminService.broadcastMessage(content, senderId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed broadcasting message');
    }
  }

  // Send direct message to a specific employee (one-to-one)
  @UseGuards(AuthGuard)
  @Post('chats/direct/:employeeId/messages')
  async postDirectMessage(@Param('employeeId') employeeIdStr: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      const employeeId = Number(employeeIdStr);
      if (Number.isNaN(employeeId)) throw new BadRequestException('Invalid employeeId');
      const content = String(body?.content ?? '');
      if (!content) throw new BadRequestException('content is required');
      const senderId = req?.user?.sub ? Number(req.user.sub) : undefined;
      return await this.adminService.postDirectMessage(employeeId, content, senderId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed posting direct message');
    }
  }

  // Get direct messages between authenticated user and target employee
  @UseGuards(AuthGuard)
  @Get('chats/direct/:employeeId/messages')
  async getDirectMessages(@Param('employeeId') employeeIdStr: string, @Req() req: Request & { user?: any }) {
    try {
      const employeeId = Number(employeeIdStr);
      if (Number.isNaN(employeeId)) throw new BadRequestException('Invalid employeeId');
      const senderId = req?.user?.sub ? Number(req.user.sub) : undefined;
      if (!senderId) throw new BadRequestException('senderId missing');
      return await this.adminService.getDirectMessages(employeeId, senderId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed getting direct messages');
    }
  }

  // SSE stream for chat events (connect with EventSource). Accepts ?token= for environments where
  // Authorization header can't be set (EventSource). Falls back to req.user when present.
  @Get('chats/stream')
  async chatStream(@Req() req: Request & { user?: any }, @Res() res: any, @Query('token') token?: string) {
    try {
      Logger.log(`chatStream: incoming stream ip=${(req as any)?.socket?.remoteAddress} tokenPresent=${!!token} userPresent=${!!req?.user}`, 'AdminController');
      let userId = req?.user?.sub;
      if (!userId) {
        if (!token) {
          res.status(401).send('token required');
          return;
        }
        try {
          const payload = this.jwtService.verify<{ sub: number }>(String(token));
          userId = payload?.sub;
        } catch (e) {
          res.status(401).send('invalid token');
          return;
        }
      }
  // register SSE connection
  this.chatService.subscribe(res as any, Number(userId));
  // keep the handler open by returning a never-resolving promise so Nest
  // doesn't automatically finish the response and trigger `finish`.
  // This keeps the request handler active while the SSE connection is live.
  return new Promise(() => {});
    } catch (e: any) {
      Logger.error('Failed to open chat SSE stream', e, 'AdminController');
      try { res.status(500).send('failed'); } catch {}
    }
  }

  @Post('staff')
  async createStaff(@Body() dto: CreateStaffDto) {
    try {
      Logger.log('createStaff dto:', 'AdminController');
      Logger.log(JSON.stringify(dto), 'AdminController');
      if (!dto || !dto.password || typeof dto.password !== 'string') {
        throw new BadRequestException('Password must be provided');
      }
      const res = await this.adminService.createStaff(dto);
      Logger.log('createStaff success', 'AdminController');
      return res;
    } catch (e: any) {
      // If it's a BadRequestException, rethrow it so the client gets a 400
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to create staff', e, 'AdminController');
      // Expose error message temporarily for debugging
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed creating staff',
      );
    }
  }

  @Put('staff/:id')
  async updateStaff(
    @Param('id') idStr: string,
    @Body() dto: Partial<CreateStaffDto>,
  ) {
    try {
      const id = Number(idStr);
      if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
      const res = await this.adminService.updateStaff(id, dto);
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to update staff', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed updating staff',
      );
    }
  }

  @Delete('staff/:id')
  async deleteStaff(@Param('id') idStr: string) {
    try {
      const id = Number(idStr);
      if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
      return await this.adminService.deleteStaff(id);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to delete staff', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed deleting staff',
      );
    }
  }

  @Post('ping')
  ping(@Body() body: any) {
    return { ok: true, received: body };
  }

  @Post('bays/:bayNo/override')
  async overrideBay(@Param('bayNo') bayNo: string, @Body() body: any) {
    try {
      const { action, adminId } = body || {};
      if (!action || typeof action !== 'string')
        throw new BadRequestException('Action is required');
      const res = await this.adminService.overrideBay(bayNo, action, adminId);
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to override bay', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed to override bay',
      );
    }
  }

  // Generic override endpoint (fallback)
  @Post('override')
  async overrideGeneric(@Body() body: any) {
    try {
      const { bayNo, action, adminId } = body || {};
      if (!bayNo || !action)
        throw new BadRequestException('bayNo and action are required');
      const res = await this.adminService.overrideBay(
        String(bayNo),
        action,
        adminId,
      );
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to perform generic override', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed to perform override',
      );
    }
  }

  @Get('settings')
  async getSettings() {
    try {
      return await this.adminService.getSettings();
    } catch (e: any) {
      Logger.error('Failed to get settings', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting settings',
      );
    }
  }

  // Debug: return current SSE clients snapshot (employeeId -> connections)
  @Get('debug/sse-snapshot')
  async sseSnapshot() {
    try {
      return { ok: true, clients: this.chatService.getClientSnapshot() };
    } catch (e: any) {
      Logger.error('Failed to get SSE snapshot', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed retrieving SSE snapshot');
    }
  }

  @Post('settings')
  async postSettings(@Body() body: any) {
    try {
      return await this.adminService.updateSettings(body || {});
    } catch (e: any) {
      Logger.error('Failed to update settings', e, 'AdminController');
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed updating settings',
      );
    }
  }

  // Reports summary endpoint
  @Get('reports/summary')
  async reportsSummary() {
    try {
      return await this.adminService.getReportsSummary();
    } catch (e: any) {
      Logger.error('Failed to get reports summary', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting reports summary',
      );
    }
  }

  // Recent sessions list for reports table
  @Get('reports/sessions')
  async reportsSessions() {
    try {
      return await this.adminService.getRecentSessions({ limit: 200 });
    } catch (e: any) {
      Logger.error('Failed to get recent sessions', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting recent sessions',
      );
    }
  }

  @UseGuards(AuthGuard)
  @Get('audit')
  async auditLogs(@Query() query: any) {
    try {
      const limit = Number(query?.limit ?? 200);
      const startDate = query?.startDate ? String(query.startDate) : undefined;
      const endDate = query?.endDate ? String(query.endDate) : undefined;
      const userId = query?.userId ? Number(query.userId) : undefined;
      return await this.adminService.getAuditLogs({ limit, startDate, endDate, userId });
    } catch (e: any) {
      Logger.error('Failed to get audit logs', e, 'AdminController');
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed getting audit logs');
    }
  }

  // Export report (returns CSV text in body)
  @Post('reports/export')
  async exportReport(@Body() body: any) {
    try {
      const csv = await this.adminService.exportReport(body || {});
      // return CSV string in JSON wrapper for simplicity (frontend will download)
      return { ok: true, csv };
    } catch (e: any) {
      Logger.error('Failed to export report', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed exporting report',
      );
    }
  }
}
