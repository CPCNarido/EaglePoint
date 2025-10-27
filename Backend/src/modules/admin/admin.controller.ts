import { Controller, Get, Post, Body, InternalServerErrorException, Logger, BadRequestException, Put, Param, Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateStaffDto } from './dto/create-staff.dto';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('overview')
  async overview() {
    return this.adminService.getOverview();
  }

  @Get('staff')
  async listStaff() {
    return this.adminService.getStaff();
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
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed creating staff');
    }
  }

  @Put('staff/:id')
  async updateStaff(@Param('id') idStr: string, @Body() dto: Partial<CreateStaffDto>) {
    try {
      const id = Number(idStr);
      if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
      const res = await this.adminService.updateStaff(id, dto);
      return res;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.error('Failed to update staff', e, 'AdminController');
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed updating staff');
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
      throw new InternalServerErrorException(e && e.message ? e.message : 'Failed deleting staff');
    }
  }

  @Post('ping')
  async ping(@Body() body: any) {
    return { ok: true, received: body };
  }
}
