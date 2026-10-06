import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminActivityService } from './admin-activity.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminHealthService } from './admin-health.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import {
  AdminPaginationDto,
  AuditLogQueryDto,
  BatchBusinessesDto,
  BatchDealsDto,
  ModerateReviewDto,
  TicketQueryDto,
  UpdateTicketDto,
} from './dto/admin.dto';

/**
 * Phase 9 — admin control panel.
 * Every route is ADMIN/SUPER_ADMIN only. Reads are throttled lightly;
 * mutating routes are audited and rate-limited.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@Roles(...ADMIN_ROLES)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly overview: AdminOverviewService,
    private readonly activity: AdminActivityService,
    private readonly moderation: AdminModerationService,
    private readonly health: AdminHealthService,
  ) {}

  // ------------------------------------------------------------- overview

  /** Platform KPIs (users, businesses, deals, memberships, revenue, queues). Redis-cached 5 min. */
  @Get('overview')
  getOverview() {
    return this.overview.getOverview();
  }

  /** Backward-compatible alias for the Phase 1 stub route. */
  @Get('dashboard')
  getDashboardAlias() {
    return this.overview.getOverview();
  }

  /** Recent platform activity feed (latest 30 across redemptions, memberships, deals, ...). */
  @Get('activity')
  getActivity(@Query('limit') limit = '30') {
    return this.activity.getActivity(parseInt(limit, 10) || 30);
  }

  /** System health: DB latency, Redis ping, storage backend, env. */
  @Get('health')
  getHealth() {
    return this.health.getHealth();
  }

  /** Immutable audit trail, newest first. */
  @Get('audit-logs')
  getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.getAuditLogs(query);
  }

  // -------------------------------------------------------------- batch ops

  /** Bulk business actions (suspend requires a reason). Per-item results. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Audit('admin.businessesBatch')
  @Post('businesses/batch')
  @HttpCode(HttpStatus.OK)
  batchBusinesses(@CurrentUser('id') adminId: string, @Body() dto: BatchBusinessesDto) {
    return this.moderation.batchBusinesses(adminId, dto);
  }

  /** Bulk deal actions (reject requires a reason). Per-item results. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Audit('admin.dealsBatch')
  @Post('deals/batch')
  @HttpCode(HttpStatus.OK)
  batchDeals(@CurrentUser() admin: JwtUser, @Body() dto: BatchDealsDto) {
    return this.moderation.batchDeals(admin.id, admin.roles, dto);
  }

  // ------------------------------------------------------------- moderation

  /** Review moderation queue (PENDING reviews, newest first). */
  @Get('reviews/pending')
  pendingReviews(@Query() query: AdminPaginationDto) {
    return this.moderation.pendingReviews(query.page, query.pageSize);
  }

  /** Approve or reject a review (reject requires a reason). */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Audit('admin.reviewModerate')
  @Post('reviews/:id/moderate')
  @HttpCode(HttpStatus.OK)
  moderateReview(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.moderation.moderateReview(adminId, id, dto);
  }

  // ----------------------------------------------------------- support triage

  /** Support tickets with status/search filters. */
  @Get('support/tickets')
  listTickets(@Query() query: TicketQueryDto) {
    return this.moderation.listTickets(query);
  }

  /** Single ticket with its message thread. */
  @Get('support/tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.moderation.getTicket(id);
  }

  /** Triage: change status/priority, assign, add an internal note. */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Audit('admin.ticketUpdate')
  @Patch('support/tickets/:id')
  @HttpCode(HttpStatus.OK)
  updateTicket(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.moderation.updateTicket(adminId, id, dto);
  }

  // ----------------------------------------------------------- fraud alerts

  /** Fraud signals (Phase 6 SUSPICIOUS_QR_RATE events, capped 200 / 7d). */
  @Get('fraud-alerts')
  fraudAlerts(@Query('limit') limit = '50') {
    return this.moderation.fraudAlerts(parseInt(limit, 10) || 50);
  }

  /** Clear the alert feed after review (the ack is recorded in the audit log). */
  @Audit('admin.fraudAlertsAck')
  @Post('fraud-alerts/ack')
  @HttpCode(HttpStatus.OK)
  ackFraudAlerts() {
    return this.moderation.ackFraudAlerts();
  }
}
