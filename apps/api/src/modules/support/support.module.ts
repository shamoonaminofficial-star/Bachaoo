import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Phase 11 — support tickets. Imports NotificationsModule so staff replies can
 * notify the ticket owner (best-effort).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
