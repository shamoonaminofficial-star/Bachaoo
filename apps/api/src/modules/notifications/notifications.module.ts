import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatchService } from './dispatch.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Phase 11 — notifications: inbox (NotificationsService) + platform dispatcher
 * (NotificationDispatchService). Imports AuthModule for the email/SMS/WhatsApp
 * channel adapters. Exported so other modules can fire best-effort events.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, NotificationDispatchService],
  exports: [NotificationsService, NotificationDispatchService],
})
export class NotificationsModule {}
