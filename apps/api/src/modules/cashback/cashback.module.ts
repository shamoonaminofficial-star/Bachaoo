import { Module } from '@nestjs/common';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Phase 11 — imports NotificationsModule for cashback approval/withdrawal
 * notifications (best-effort).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CashbackController],
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
