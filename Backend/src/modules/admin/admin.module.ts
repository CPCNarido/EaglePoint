import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';

@Module({
  imports: [],
  providers: [AdminService, ChatService, ChatGateway],
  controllers: [AdminController],
})
export class AdminModule {}
