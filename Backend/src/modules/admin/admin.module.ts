import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
