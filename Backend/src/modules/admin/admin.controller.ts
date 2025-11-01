import {
  Controller,
  Get,
  Post,
  Body,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
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
      const { action, adminId } = body || {};
      if (!action || typeof action !== 'string')
        throw new BadRequestException('Action is required');
      const res = await this.adminService.overrideBay(bayNo, action, adminId);
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

  // Reports summary endpoint
  @Get('reports/summary')
  async reportsSummary() {
    try {
      return await this.adminService.getReportsSummary();
    } catch (e: any) {
      Logger.error('Failed to get reports summary', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting reports summary',
      );
    }
  }

  // Recent sessions list for reports table
  @Get('reports/sessions')
  async reportsSessions() {
    try {
      return await this.adminService.getRecentSessions({ limit: 200 });
    } catch (e: any) {
      Logger.error('Failed to get recent sessions', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed getting recent sessions',
      );
    }
  }

  // Export report (returns CSV text in body)
  @Post('reports/export')
  async exportReport(@Body() body: any) {
    try {
      const csv = await this.adminService.exportReport(body || {});
      // return CSV string in JSON wrapper for simplicity (frontend will download)
      return { ok: true, csv };
    } catch (e: any) {
      Logger.error('Failed to export report', e, 'AdminController');
      throw new InternalServerErrorException(
        e && e.message ? e.message : 'Failed exporting report',
      );
    }
  }
}
