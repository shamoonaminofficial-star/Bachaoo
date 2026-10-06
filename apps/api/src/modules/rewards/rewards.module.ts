import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Phase 11 — imports NotificationsModule for reward-redemption notifications
 * (best-effort).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
