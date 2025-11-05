import { Controller, Get } from '@nestjs/common';
import { DispatcherService } from './dispatcher.service';

@Controller('dispatcher')
export class DispatcherController {
  constructor(private readonly service: DispatcherService) {}

  @Get('overview')
  async overview() {
    return this.service.getOverview();
  }

  @Get('bays')
  async bays() {
    return this.service.listBays();
  }
}
