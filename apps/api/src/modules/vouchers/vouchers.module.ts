import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { BusinessesModule } from '../businesses/businesses.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Phase 10 — vouchers. Imports BusinessesModule for partner business-ownership
 * checks on campaign creation (one-direction dependency, no cycle).
 * Phase 11 — NotificationsModule for claim notifications (best-effort).
 */
@Module({
  imports: [BusinessesModule, NotificationsModule],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
