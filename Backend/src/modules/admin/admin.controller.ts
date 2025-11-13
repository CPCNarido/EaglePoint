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
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { ChatService } from '../chat/chat.service';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

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

  // Attendance endpoints
  // Clock-in / Clock-out endpoint: requires auth (token) so we can attribute actor if needed
  @UseGuards(AuthGuard)
  @Post('attendance/clock')
  async clockAttendance(@Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      // allow employeeId in body; actor may be the same as token user
      const actor = req?.user?.sub ? Number(req.user.sub) : undefined;
      const res = await this.adminService.clockAttendance(body || {});
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to clock attendance', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed to clock attendance');
    }
  }

  // Query attendance rows
  @UseGuards(AuthGuard)
  @Get('attendance')
  async getAttendance(@Query() query: any) {
    try {
      const date = query?.date ? String(query.date) : undefined;
      const employeeId = query?.employeeId ? Number(query.employeeId) : undefined;
      return await this.adminService.getAttendance({ date, employeeId });
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to get attendance', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed getting attendance');
    }
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
      Logger.log(`admin.overrideBay called for bay=${bayNo} body=${JSON.stringify(body)}`, 'AdminController');
      const { action, adminId } = body || {};
      // accept optional name fields for reservations: name, nickname, playerName
      const reserveName = body?.name ?? body?.nickname ?? body?.playerName ?? null;
      if (!action || typeof action !== 'string')
        throw new BadRequestException('Action is required');
      const res = await this.adminService.overrideBay(bayNo, action, adminId, reserveName);
      Logger.log(`admin.overrideBay result for bay=${bayNo} action=${action} result=${JSON.stringify(res)}`, 'AdminController');
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

  // Upload a seal PNG and persist its URL into settings (sealUrl). Accepts
  // multipart/form-data with field name `file`.
  @UseGuards(AuthGuard)
  @Post('settings/seal')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // store uploads in ./uploads relative to project root
          cb(null, process.cwd() + '/uploads');
        },
        filename: (req, file, cb) => {
          const name = `seal-${Date.now()}${extname(file.originalname)}`;
          cb(null, name);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        return cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB default limit
    }),
  )
  async uploadSeal(@UploadedFile() file: any, @Req() req: Request) {
    try {
      if (!file) throw new BadRequestException('File is required');
      // Build a public URL for the uploaded file. Rely on request host/proto.
      const proto = (req as any).protocol || 'http';
      const host = req.get('host') || `localhost:${process.env.PORT ?? 3000}`;
      const url = `${proto}://${host}/uploads/${file.filename}`;

  // Persist the URL and also store the raw filesystem path to the uploaded file.
  // The raw path can be useful for local dev and for workflows that want the
  // actual file location. Note: storing absolute filesystem paths is
  // environment-specific — production deployments should prefer an
  // accessible HTTP URL (sealUrl).
  const serverWebPath = `/uploads/${file.filename}`;
  // Persist the repo-relative uploads path so the frontend can load via
  // ../../../Backend/uploads/<filename> as requested (no absolute IP or FS path).
  const serverRepoRelative = `../../../Backend/uploads/${file.filename}`;
  // Log what will be persisted so operators can see the stored paths in logs
  Logger.log(`Persisting seal paths -> web: ${serverWebPath}, repoRelative: ${serverRepoRelative}`, 'AdminController');
  await this.adminService.updateSettings({ sealUrl: url, sealPath: serverRepoRelative });

  // Return only the persisted repo-relative path so callers can immediately
  // use the DB-stored value (e.g. frontend can read `path` and update
  // its local settings preview). We intentionally omit the public URL to
  // simplify the contract and avoid relying on host/protocol values.
  return { ok: true, path: serverRepoRelative };
    } catch (e: any) {
      Logger.error('Failed uploading seal', e, 'AdminController');
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException(e?.message ?? 'Failed uploading seal');
    }
  }

  // Reports summary endpoint (supports optional query filters: timeRange, sessionType, bay)
  @Get('reports/summary')
  async reportsSummary(@Query() query: any) {
    try {
      const opts = { timeRange: String(query?.timeRange ?? ''), sessionType: String(query?.sessionType ?? ''), bay: query?.bay };
      return await this.adminService.getReportsSummary(opts);
    } catch (e: any) {
      Logger.error('Failed to get reports summary', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting reports summary',
      );
    }
  }

  // Recent sessions list for reports table (supports filters via query)
  @Get('reports/sessions')
  async reportsSessions(@Query() query: any) {
    try {
      const limit = Number(query?.limit ?? 200);
      const opts: any = { limit };
      if (query?.timeRange) opts.timeRange = String(query.timeRange);
      if (query?.sessionType) opts.sessionType = String(query.sessionType);
      if (query?.bay) opts.bay = query.bay;
      return await this.adminService.getRecentSessions(opts);
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

  // Update session/player details (player nickname and assigned serviceman)
  @UseGuards(AuthGuard)
  @Patch('reports/sessions/:id')
  async patchSession(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      const adminId = req?.user?.sub ? Number(req.user.sub) : undefined;
      return await this.adminService.updateSession(String(id), body || {}, adminId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to patch session', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed patching session');
    }
  }

  // Patch attendance record (admin only)
  @UseGuards(AuthGuard)
  @Patch('attendance/:id')
  async patchAttendance(@Param('id') idStr: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    try {
      const id = Number(idStr);
      if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
      const adminId = req?.user?.sub ? Number(req.user.sub) : undefined;
      return await this.adminService.patchAttendance(id, body || {}, adminId);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to patch attendance', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed patching attendance');
    }
  }

  // Export report (returns CSV text in body)
  @Post('reports/export')
  async exportReport(@Body() body: any, @Res() res: any, @Query('file') file?: string, @Query('format') format?: string) {
    try {
      const csv = await this.adminService.exportReport(body || {});
      const reportName = `report-${String(body?.reportType ?? 'report')}`;

      // If PDF requested and file-mode, generate a PDF server-side and stream it
      if ((String(file) === '1' || String(file) === 'true') && String(format).toLowerCase() === 'pdf') {
        try {
          // lazy import PDFKit to avoid requiring it unless needed
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const PDFDocument = require('pdfkit');
          const doc = new PDFDocument({ autoFirstPage: false });
          const chunks: Buffer[] = [];
          // capture data
          // @ts-ignore
          doc.on('data', (chunk) => chunks.push(chunk));
          // when finished, send the buffer
          doc.on('end', () => {
            try {
              const pdfBuf = Buffer.concat(chunks);
              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', `attachment; filename="${reportName}.pdf"`);
              res.send(pdfBuf);
            } catch (e) {
              Logger.error('Failed to send PDF buffer', e, 'AdminController');
              try { res.status(500).send('failed generating pdf'); } catch {}
            }
          });

          // Build a simple PDF: title and CSV as preformatted text
          doc.addPage({ size: 'A4', margin: 40 });
          doc.fontSize(18).text(String(body?.reportName ?? reportName), { underline: true });
          doc.moveDown();
          doc.fontSize(10).font('Courier').text(String(csv || ''), { lineBreak: true });
          doc.end();
          return;
        } catch (e) {
          Logger.error('Failed generating PDF', e, 'AdminController');
          // fall through to CSV/JSON fallback
        }
      }

      // CSV path (existing behavior)
      if (String(file) === '1' || String(file) === 'true') {
        try {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${reportName}.csv"`);
          res.send(csv);
          return;
        } catch (e) {
          Logger.error('Failed sending CSV file', e, 'AdminController');
          // fallback to JSON
        }
      }

      // return CSV string in JSON wrapper for simplicity (frontend will download)
      return { ok: true, csv };
    } catch (e: any) {
      Logger.error('Failed to export report', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed exporting report',
      );
    }
  }

  // Timeseries endpoint for charting: returns daily counts for the requested range
  @Get('reports/timeseries')
  async reportsTimeSeries(@Query() query: any) {
    try {
      const opts = { timeRange: String(query?.timeRange ?? '') };
      return await this.adminService.getTimeSeries(opts);
    } catch (e: any) {
      Logger.error('Failed to get timeseries', e, 'AdminController');
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed getting timeseries');
    }
  }

  // Bay usage aggregated endpoint for charting
  @Get('reports/bay-usage')
  async reportsBayUsage(@Query() query: any) {
    try {
      const opts = { timeRange: String(query?.timeRange ?? '') };
      return await this.adminService.getBayUsage(opts);
    } catch (e: any) {
      Logger.error('Failed to get bay usage', e, 'AdminController');
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed getting bay usage');
    }
  }

  // Start a new session on a bay (timed if end_time provided, otherwise Open)
  @Post('bays/:bayNo/start')
  async startBaySession(@Param('bayNo') bayNo: string, @Body() body: any) {
    try {
      Logger.log(`admin.startBaySession called for bay=${bayNo} body=${JSON.stringify(body)}`, 'AdminController');
      // body may contain: nickname, full_name, end_time (ISO), price_per_hour, servicemanId, dispatcherId
      const res = await this.adminService.startSession(String(bayNo), body || {});
      Logger.log(`admin.startBaySession result for bay=${bayNo} result=${JSON.stringify(res)}`, 'AdminController');
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to start session', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed to start session');
    }
  }

  // Debug: return bay overview entry and last N assignments for a bay
  @Get('debug/bay/:bayNo')
  async debugBay(@Param('bayNo') bayNo: string, @Query('last') last?: string) {
    try {
      Logger.log(`admin.debugBay called for bay=${bayNo} last=${String(last ?? '')}`, 'AdminController');
      const n = last ? Number(last) : 10;
      const res = await this.adminService.getBayDebug(String(bayNo), Number(n || 10));
      Logger.log(`admin.debugBay result for bay=${bayNo} result=${JSON.stringify(res?.overviewEntry ?? { ok: false })}`, 'AdminController');
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to get bay debug', e, 'AdminController');
      throw new InternalServerErrorException(e?.message ?? 'Failed to get bay debug');
    }
  }
}
