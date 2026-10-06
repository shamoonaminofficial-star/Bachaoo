import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ROLES } from '../../common/constants';
import { DashboardService } from './dashboard.service';
import { MeService } from './me.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

/**
 * Phase 7 — "me" endpoints for the signed-in customer.
 *
 * Registered BEFORE UsersController in UsersModule so these static routes
 * match before the `users/:id` admin route.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
@Roles(ROLES.CUSTOMER)
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly dashboard: DashboardService,
  ) {}

  /** Aggregated customer dashboard summary (Redis-cached 5 minutes). */
  @Get('dashboard')
  getDashboard(@CurrentUser('id') userId: string) {
    return this.dashboard.getDashboard(userId);
  }

  /** Own profile + completeness percentage. */
  @Get()
  getProfile(@CurrentUser('id') userId: string) {
    return this.me.getProfile(userId);
  }

  /** Update own profile (customer-editable fields only). */
  @Patch()
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(userId, dto);
  }

  /** Upload/replace own avatar (multipart field `avatar`). */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadAvatar(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.me.uploadAvatar(userId, file);
  }

  /** Get notification topic toggles (lazy-created with all-on defaults). */
  @Get('notification-preferences')
  getNotificationPreferences(@CurrentUser('id') userId: string) {
    return this.me.getNotificationPreferences(userId);
  }

  /** Update notification topic toggles. */
  @Patch('notification-preferences')
  updateNotificationPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.me.updateNotificationPreferences(userId, dto);
  }
}
