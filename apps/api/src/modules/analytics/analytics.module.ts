import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { BusinessesModule } from '../businesses/businesses.module';

/**
 * Analytics domain module.
 * Imports BusinessesModule for the canonical per-business analytics
 * (PartnerAnalyticsService) — one implementation, no duplication.
 */
@Module({
  imports: [BusinessesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
