import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { RewardsModule } from '../rewards/rewards.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Phase 10 — referrals. Imports RewardsModule for ledgered point credits on
 * qualification (one-direction dependency, no cycle).
 * Phase 11 — NotificationsModule for qualification notifications.
 */
@Module({
  imports: [RewardsModule, NotificationsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
