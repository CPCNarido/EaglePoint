import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger('ChatService');
  // map employeeId -> set of SSE Response objects
  private clients: Map<number, Set<Response>> = new Map();
  // optional WebSocket clients map (employeeId -> Set<WebSocket>)
  private wsClients: Map<number, Set<any>> = new Map();
  private wsServerStarted = false;

  constructor(private prisma: PrismaService) {}

  // Attempt to initialize a lightweight WebSocket server (best-effort).
  // Uses dynamic import so the dependency is optional at runtime.
  private async ensureWsServer() {
    if (this.wsServerStarted) return;
    this.wsServerStarted = true;
    try {
      // dynamic import so dependency is optional
      const wsModule = await import('ws').catch(() => null);
      if (!wsModule) {
        this.logger.log('WebSocket support not available (ws module not installed)');
        return;
      }
      const WSServer = wsModule?.Server ?? wsModule?.WebSocketServer ?? wsModule?.default?.Server ?? wsModule;
      if (!WSServer) {
        this.logger.log('ws Server export not found; skipping WebSocket startup');
        return;
      }

      const port = Number(process.env.WS_PORT ?? 4001) || 4001;
      const wss = new WSServer({ port });
      this.logger.log(`WebSocket server started on port ${port}`);

      wss.on('connection', (socket: any, req: any) => {
        try {
          // read employeeId from querystring: ?employeeId=123
          const url = req?.url || '';
          this.logger.log(`WS connection incoming: url=${url}`);
          // log handshake headers for debugging (best-effort)
          try { this.logger.log(`WS handshake headers: ${JSON.stringify(req?.headers || {})}`); } catch (e) { /* ignore circular */ }
          const m = url.match(/[?&]employeeId=(\d+)/);
          const empId = m ? Number(m[1]) : null;
          if (empId && Number.isFinite(empId)) {
            if (!this.wsClients.has(empId)) this.wsClients.set(empId, new Set());
            this.wsClients.get(empId)!.add(socket);
            this.logger.log(`WS: connection registered for employee ${empId} (connections=${this.wsClients.get(empId)!.size})`);
          }

          socket.on('message', (data: any) => {
            try {
              const msg = typeof data === 'string' ? JSON.parse(data) : data;
              // If clients send a 'message:new' payload, forward to notifyNewMessage so other transports can relay.
              if (msg && msg.type === 'message:new' && msg.message) {
                try { this.notifyNewMessage(msg.message); } catch (e) { void e; }
              }
            } catch (e) { /* ignore malformed messages */ }
          });

          socket.on('error', (err: any) => {
            try { this.logger.error(`WS socket error for emp=${empId} err=${err?.message ?? err}`, err); } catch (e) { /* ignore */ }
          });

          const cleanup = () => {
            try {
              if (empId && this.wsClients.has(empId)) {
                this.wsClients.get(empId)!.delete(socket);
                if (this.wsClients.get(empId)!.size === 0) this.wsClients.delete(empId);
              }
            } catch (e) { void e; }
          };
          socket.on('close', cleanup);
          socket.on('error', cleanup);
        } catch (e) {
          this.logger.error('WS connection handling failed', e as any);
        }
      });
    } catch (e) {
      this.logger.error('Failed to start WebSocket server', e as any);
    }
  }

  subscribe(res: Response, employeeId: number) {
    try {
      this.logger.log(`chat.subscribe: incoming subscribe for employeeId=${employeeId}`);
      try { this.logger.log(`chat.subscribe: remoteAddress=${(res as any)?.socket?.remoteAddress}`); } catch {}
      // set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // disable buffering on some proxies
      res.setHeader('X-Accel-Buffering', 'no');
      try { res.flushHeaders?.(); } catch {}

      const key = Number(employeeId);
      if (!this.clients.has(key)) this.clients.set(key, new Set());
      const set = this.clients.get(key)!;
      set.add(res);
      this.logger.log(`SSE: registered connection for employee ${key} (connections=${set.size}) writableEnded=${(res as any).writableEnded} finished=${(res as any).finished}`);

      // send a welcome event so clients know the stream is alive
      try {
        res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, employeeId: key })}\n\n`);
      } catch (e) {
        this.logger.error('chat.subscribe: failed to write connected event', e as any);
        void e;
      }

      // cleanup on close
      const onClose = () => {
        try {
          this.logger.log(`chat.subscribe.onClose: employee=${key} writableEnded=${(res as any).writableEnded} finished=${(res as any).finished}`);
          const s = this.clients.get(key);
          if (s) {
            s.delete(res);
            this.logger.log(`SSE: connection closed for employee ${key} (connections=${s.size})`);
            if (s.size === 0) this.clients.delete(key);
          }
        } catch (e) { this.logger.error('chat.subscribe.onClose error', e as any); }
      };

      // req is not available here; rely on res.once('close')
      res.once('close', onClose);
      res.once('finish', onClose);
    } catch (e) {
      this.logger.error('Failed to subscribe SSE', e as any);
      try { res.end(); } catch {}
    }
  }

  async notifyNewMessage(msg: any) {
    try {
      // msg should contain message_id, chat_id, sender_id, content, sent_at
      const chatId = Number(msg?.chat_id);
      if (!Number.isFinite(chatId)) return;

      // Determine recipients:
      // - if chat room is group => participants in chatParticipant
      // - if private chat => participants
      // - if no participants (e.g., All Roles), fall back to all employees
      const room = await this.prisma.chatRoom.findUnique({ where: { chat_id: chatId } });
      let recipientIds: number[] = [];
      if (room) {
        const parts = await this.prisma.chatParticipant.findMany({ where: { chat_id: chatId }, select: { employee_id: true } });
        recipientIds = parts.map((p: any) => Number(p.employee_id)).filter((n) => Number.isFinite(n));
      }

      if (!recipientIds || recipientIds.length === 0) {
        // fallback: broadcast to all employees
        const all = await this.prisma.employee.findMany({ select: { employee_id: true } });
        recipientIds = all.map((a: any) => Number(a.employee_id)).filter((n) => Number.isFinite(n));
      }

      // prepare payload
      const payload = {
        type: 'message:new',
        message: {
          message_id: msg.message_id,
          chat_id: msg.chat_id,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name ?? null,
          content: msg.content,
          sent_at: msg.sent_at,
        },
      };

      const sentTo: number[] = [];
      for (const rid of recipientIds) {
        const set = this.clients.get(Number(rid));
        if (!set || set.size === 0) continue;
        for (const res of Array.from(set)) {
          try {
            this.logger.log(`notifyNewMessage: attempting write to employee=${rid} writableEnded=${(res as any).writableEnded} finished=${(res as any).finished}`);
            // write SSE event
            res.write(`event: message:new\ndata: ${JSON.stringify(payload)}\n\n`);
            sentTo.push(rid);
            this.logger.log(`notifyNewMessage: write ok for employee=${rid}`);
          } catch (e) {
            this.logger.error(`notifyNewMessage: write failed for employee=${rid}`, e as any);
            try { res.end(); } catch (e2) { this.logger.error('notifyNewMessage: failed to end response', e2 as any); }
          }
        }
      }

      // Ensure WebSocket server is started and also broadcast to WS clients (best-effort)
      try {
        await this.ensureWsServer();
        for (const rid of recipientIds) {
          const set = this.wsClients.get(Number(rid));
          if (!set || set.size === 0) continue;
          for (const ws of Array.from(set)) {
            try {
              if (ws && ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'message:new', message: payload.message }));
              }
            } catch (e) { this.logger.error('notifyNewMessage: ws send failed', e as any); }
          }
        }
      } catch (e) { /* best-effort */ }

      this.logger.log(`notifyNewMessage: message ${msg.message_id} sent to ${sentTo.length} client(s)`);
    } catch (e) {
      this.logger.error('notifyNewMessage failed', e as any);
    }
  }

  // Determine recipient employee IDs for a chat room. Public helper for other transports (e.g., Socket.IO).
  async getRecipientEmployeeIds(chatId: number): Promise<number[]> {
    try {
      const cid = Number(chatId);
      if (!Number.isFinite(cid)) return [];
      const room = await this.prisma.chatRoom.findUnique({ where: { chat_id: cid } });
      let recipientIds: number[] = [];
      if (room) {
        const parts = await this.prisma.chatParticipant.findMany({ where: { chat_id: cid }, select: { employee_id: true } });
        recipientIds = parts.map((p: any) => Number(p.employee_id)).filter((n) => Number.isFinite(n));
      }
      if (!recipientIds || recipientIds.length === 0) {
        const all = await this.prisma.employee.findMany({ select: { employee_id: true } });
        recipientIds = all.map((a: any) => Number(a.employee_id)).filter((n) => Number.isFinite(n));
      }
      return recipientIds;
    } catch (e) {
      this.logger.error('getRecipientEmployeeIds failed', e as any);
      return [];
    }
  }

  // For diagnostics
  getClientSnapshot() {
    const out: Array<{ employeeId: number; connections: number }> = [];
    for (const [k, s] of this.clients.entries()) {
      out.push({ employeeId: Number(k), connections: s.size });
    }
    return out;
  }
}
