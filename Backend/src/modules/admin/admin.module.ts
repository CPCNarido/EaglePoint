import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ChatService } from '../chat/chat.service';

@Module({
  imports: [],
  providers: [AdminService, ChatService],
  controllers: [AdminController],
})
export class AdminModule {}
