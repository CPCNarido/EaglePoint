import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AdminService } from '../admin/admin.service';
import { ChatService } from './chat.service';

/**
 * Socket.IO gateway for real-time chat.
 * - Accepts connections and associates them with an employee id (query.employeeId or auth token)
 * - Receives 'message:new' events from clients, persists via AdminService, and acks the sender
 * - Emits 'message:new' events to other connected clients after persistence
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('ChatGateway');

  @WebSocketServer()
  server: Server;

  constructor(
    private adminService: AdminService,
    private chatService: ChatService,
  ) {}

  handleConnection(client: Socket) {
    try {
      // employeeId may be supplied via query or via auth token in handshake.auth
      const empQ = client.handshake.query?.employeeId;
      let empId: number | null = null;
      if (empQ) empId = Number(empQ);
      // also allow handshake.auth.token which may be a Bearer token — we don't parse here

      // Join a room keyed by employee id if available so we can emit privately
      if (empId && Number.isFinite(empId)) {
        const room = `emp:${empId}`;
        client.join(room);
        // persist the employee id on the socket so we can read it on disconnect
        try { (client as any).data = (client as any).data || {}; (client as any).data.employeeId = empId; } catch (_e) { /* ignore */ }
        // notify other clients about this staff going online (presence broadcast)
        try {
          const payload = { employee_id: empId, online: true } as any;
          this.server.emit('presence:update', payload);
          this.server.emit('staff:online', payload);
        } catch (e) {
          this.logger.error('presence emit failed (connect)', e);
        }
        // record socket.io connection in ChatService so other server APIs can consult live presence
        try { this.chatService.registerSocketIoConnection(empId, client.id); } catch (_e) { void _e; }
        this.logger.log(
          `Socket connected for employee=${empId} socketId=${client.id}`,
        );
      } else {
        this.logger.log(
          `Socket connected (no employeeId) socketId=${client.id}`,
        );
      }
    } catch (e) {
      this.logger.error('handleConnection error', e);
    }
  }

  handleDisconnect(client: Socket) {
    try {
      // attempt to read employee id persisted on connect and broadcast offline presence
      try {
        const empId = Number((client as any)?.data?.employeeId ?? null) || null;
        if (empId && Number.isFinite(empId)) {
          const payload = { employee_id: empId, online: false } as any;
          try {
            this.server.emit('presence:update', payload);
            this.server.emit('staff:offline', payload);
          } catch (e) {
            this.logger.error('presence emit failed (disconnect)', e);
          }
          // remove socket.io connection record
          try { this.chatService.unregisterSocketIoConnection(empId, client.id); } catch (_e) { void _e; }
        }
      } catch (_e) { void _e; }
      this.logger.log(`Socket disconnected id=${client.id}`);
    } catch (e) {
      this.logger.error('handleDisconnect error', e);
    }
  }

  // Client emits { type: 'message:new', message: { chat_id?, employeeId?, content, tempId?, sender_id? } }
  @SubscribeMessage('message:new')
  async handleNewMessage(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const m = payload?.message ?? payload;
      if (!m || typeof m !== 'object')
        return { ok: false, error: 'invalid payload' };

      const senderId = Number(m?.sender_id ?? null) || null;
      const content = String(m?.content ?? '').trim();
      const tempId = m?.tempId ?? null;

      // Persist via AdminService according to message shape (chat_id vs employeeId)
      let persisted: any = null;
      const tIn = Date.now();
      if (m?.chat_id !== undefined && m?.chat_id !== null) {
        const chatId = Number(m.chat_id);
        persisted = await this.adminService.postChatMessage(
          chatId,
          content,
          senderId ?? undefined,
        );
      } else if (m?.employeeId || m?.employee_id) {
        const emp = Number(m.employeeId ?? m.employee_id);
        persisted = await this.adminService.postDirectMessage(
          emp,
          content,
          senderId ?? undefined,
        );
      } else {
        return { ok: false, error: 'no recipient' };
      }
      const tOut = Date.now();
      const durationMs = tOut - tIn;
      this.logger.log(
        `handleNewMessage: persisted tempId=${tempId} durationMs=${durationMs}`,
      );

      // Broadcast to connected socket.io clients: emit 'message:new' with persisted message
      const out = { type: 'message:new', message: persisted };
      try {
        // First, emit to chat room (if clients have joined chat:<chatId>) so viewers of the open conversation receive it.
        const chatRoom = `chat:${persisted.chat_id}`;
        try {
          this.server.to(chatRoom).emit('message:new', out);
        } catch (e) {
          this.logger.error(`SocketIO emit to ${chatRoom} failed`, e);
        }

        // Then, ensure recipients who aren't currently in the chat room still receive the message via their emp:<id> room.
        const recipients: number[] =
          await this.chatService.getRecipientEmployeeIds(persisted.chat_id);
        const adapter = (this.server as any).sockets?.adapter;
        const chatSet: Set<string> = adapter?.rooms?.get(chatRoom) ?? new Set();
        for (const rid of recipients) {
          try {
            const empRoom = `emp:${rid}`;
            const empSet: Set<string> =
              adapter?.rooms?.get(empRoom) ?? new Set();
            // If any of this employee's sockets are already in the chat room, skip emp-level emit to avoid duplicate delivery
            let alreadyInChat = false;
            for (const sid of empSet) {
              if (chatSet && chatSet.has(sid)) {
                alreadyInChat = true;
                break;
              }
            }
            if (!alreadyInChat) {
              this.server.to(empRoom).emit('message:new', out);
            }
          } catch (e) {
            this.logger.error(`SocketIO emit to emp:${rid} failed`, e);
          }
        }
      } catch (e) {
        this.logger.error('SocketIO emit failed', e);
      }

      // Acknowledge sender with persisted message and tempId mapping (include timing)
      return { ok: true, message: persisted, tempId, durationMs };
    } catch (e: any) {
      this.logger.error('handleNewMessage failed', e);
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  // Allow clients to join a chat room so they receive a single-room emit for that chat
  @SubscribeMessage('join:chat')
  handleJoinChat(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const chatId = Number(payload?.chat_id ?? payload);
      if (!Number.isFinite(chatId))
        return { ok: false, error: 'invalid chat id' };
      const room = `chat:${chatId}`;
      client.join(room);
      this.logger.log(`Socket ${client.id} joined ${room}`);
      return { ok: true };
    } catch (e) {
      this.logger.error('handleJoinChat failed', e);
      return { ok: false, error: 'join failed' };
    }
  }

  @SubscribeMessage('leave:chat')
  handleLeaveChat(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const chatId = Number(payload?.chat_id ?? payload);
      if (!Number.isFinite(chatId))
        return { ok: false, error: 'invalid chat id' };
      const room = `chat:${chatId}`;
      client.leave(room);
      this.logger.log(`Socket ${client.id} left ${room}`);
      return { ok: true };
    } catch (e) {
      this.logger.error('handleLeaveChat failed', e);
      return { ok: false, error: 'leave failed' };
    }
  }
}
