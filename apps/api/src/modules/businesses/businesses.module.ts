import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { PartnerDashboardService } from './partner-dashboard.service';
import { PartnerAnalyticsService } from './partner-analytics.service';
import { StaffService } from './staff.service';

/**
 * Businesses domain module.
 * Register in the root module when the real implementation lands.
 */
@Module({
  controllers: [BusinessesController],
  providers: [BusinessesService, PartnerDashboardService, PartnerAnalyticsService, StaffService],
  exports: [BusinessesService, PartnerDashboardService, PartnerAnalyticsService, StaffService],
})
export class BusinessesModule {}
