import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminActivityService } from './admin-activity.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminHealthService } from './admin-health.service';
import { BusinessesModule } from '../businesses/businesses.module';
import { DealsModule } from '../deals/deals.module';
import { ReviewsModule } from '../reviews/reviews.module';

/**
 * Admin control panel module (Phase 9).
 * Batch moderation reuses BusinessesService and DealsService, so those
 * modules are imported (forwardRef guards against future cycles).
 */
@Module({
  imports: [forwardRef(() => BusinessesModule), forwardRef(() => DealsModule), forwardRef(() => ReviewsModule)],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminOverviewService,
    AdminActivityService,
    AdminModerationService,
    AdminHealthService,
  ],
  exports: [AdminService, AdminOverviewService],
})
export class AdminModule {}
