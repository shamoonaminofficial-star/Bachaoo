import { IsBoolean, IsOptional } from 'class-validator';

/** Notification topic toggles for PATCH /users/me/notification-preferences. */
export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() dealAlerts?: boolean;
  @IsOptional() @IsBoolean() savingsSummary?: boolean;
  @IsOptional() @IsBoolean() membershipReminders?: boolean;
  @IsOptional() @IsBoolean() referralUpdates?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
}
