import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger('ChatService');
  // map employeeId -> set of SSE Response objects
  private clients: Map<number, Set<Response>> = new Map();

  constructor(private prisma: PrismaService) {}

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

      this.logger.log(`notifyNewMessage: message ${msg.message_id} sent to ${sentTo.length} client(s)`);
    } catch (e) {
      this.logger.error('notifyNewMessage failed', e as any);
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
