import { Module } from '@nestjs/common';
import { RedemptionsController } from './redemptions.controller';
import { RedemptionsService } from './redemptions.service';
import { VouchersModule } from '../vouchers/vouchers.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommissionsModule } from '../commissions/commissions.module';

/**
 * Phase 10: imports VouchersModule (bill-time voucher application) and
 * ReferralsModule (first-redemption qualifying hook). One-direction
 * dependencies — no cycles.
 * Phase 11: imports NotificationsModule for post-commit referral notifications.
 * Phase 12: imports CommissionsModule — commission accrues inside the confirm
 * transaction (CommissionsModule does not depend back on redemptions).
 */
@Module({
  imports: [VouchersModule, ReferralsModule, NotificationsModule, CommissionsModule],
  controllers: [RedemptionsController],
  providers: [RedemptionsService],
  exports: [RedemptionsService],
})
export class RedemptionsModule {}
