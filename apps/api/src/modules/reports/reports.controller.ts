import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { ReportsService } from './reports.service';
import { ExportQueryDto, ReportQueryDto } from './dto/report.dto';

/**
 * Phase 12 — platform reports + CSV exports.
 *
 * All reports are admin/finance scoped. Exports are rate-limited (2/min),
 * audited, and capped at 10,000 rows. XLSX is not supported — no spreadsheet
 * library is installed, so `format=xlsx` returns 501 honestly.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('membership-sales')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  membershipSales(@Query() query: ReportQueryDto) {
    return this.reportsService.membershipSales(query);
  }

  @Get('redemptions')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  redemptionReport(@Query() query: ReportQueryDto) {
    return this.reportsService.redemptionReport(query);
  }

  @Get('savings')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  savingsReport(@Query() query: ReportQueryDto) {
    return this.reportsService.savingsReport(query);
  }

  @Get('commissions')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  commissionReport(@Query() query: ReportQueryDto) {
    return this.reportsService.commissionReport(query);
  }

  @Get('settlements')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  settlementReport(@Query() query: ReportQueryDto & { status?: string }) {
    return this.reportsService.settlementReport(query);
  }

  @Get('businesses')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  businessReport(@Query() query: ReportQueryDto) {
    return this.reportsService.businessReport(query);
  }

  @Get('users')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  userReport(@Query() query: ReportQueryDto) {
    return this.reportsService.userReport(query);
  }

  /** Export a report as a CSV download. Audited + rate-limited (2/min). */
  @Get(':type/export')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('report.export')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async exportReport(@Param('type') type: string, @Query() query: ExportQueryDto): Promise<StreamableFile> {
    const { filename, csv } = await this.reportsService.exportReport(type, query);
    // BOM so Excel opens UTF-8 correctly.
    return new StreamableFile(Buffer.from('﻿' + csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
