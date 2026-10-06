import { Module } from '@nestjs/common';
import { GatewaysModule } from '../payments/gateways/gateways.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [GatewaysModule, NotificationsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
