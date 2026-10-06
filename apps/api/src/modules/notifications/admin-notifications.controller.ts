import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import { NotificationDispatchService, DispatchChannel } from './dispatch.service';
import { PrismaService } from '../../prisma/prisma.service';

class BroadcastDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  title!: string;

  @IsString() @IsNotEmpty() @MaxLength(2000)
  body!: string;

  @IsIn(['all', 'customers', 'partners'])
  audience!: 'all' | 'customers' | 'partners';

  @IsArray()
  @IsIn(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'], { each: true })
  @IsOptional()
  channels?: DispatchChannel[];
}

/**
 * Phase 11 — admin announcement broadcasts. Rate-limited, audited, chunked.
 */
@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@Roles(...ADMIN_ROLES)
export class AdminNotificationsController {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('broadcast')
  @Audit('notification.broadcast')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  broadcast(@CurrentUser('id') adminId: string, @Body() dto: BroadcastDto) {
    return this.dispatch.broadcast({
      title: dto.title,
      body: dto.body,
      audience: dto.audience,
      channels: dto.channels && dto.channels.length > 0 ? dto.channels : ['IN_APP'],
      createdBy: adminId,
    });
  }

  @Get('campaigns')
  campaigns() {
    return this.prisma.notificationCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
