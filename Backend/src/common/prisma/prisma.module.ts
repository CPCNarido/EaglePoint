import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LoggingService } from '../logging/logging.service';

@Global()
@Module({
  providers: [PrismaService, LoggingService],
  exports: [PrismaService, LoggingService],
})
export class PrismaModule {}
