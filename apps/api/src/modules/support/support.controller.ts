import { Get, Post, Query, Body, Param, Controller, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { SupportService, TICKET_CATEGORIES } from './support.service';

class CreateTicketDto {
  @IsString() @MinLength(5) @MaxLength(200)
  subject!: string;

  @IsString() @IsOptional()
  category?: string;

  @IsString() @MinLength(10) @MaxLength(5000)
  message!: string;

  @IsArray() @IsString({ each: true }) @IsOptional()
  attachments?: string[];

  @IsUUID() @IsOptional()
  businessId?: string;
}

class AddMessageDto {
  @IsString() @MinLength(1) @MaxLength(5000)
  message!: string;

  @IsArray() @IsString({ each: true }) @IsOptional()
  attachments?: string[];
}

/**
 * Phase 11 — support tickets for customers and partners.
 * Admin triage lives under /admin/support/* (Phase 9).
 */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /** Public FAQ served from CMS entries (also powers in-app auto-suggestions). */
  @Public()
  @Get('faq')
  getFaq() {
    return this.supportService.getFaq();
  }

  @Get('tickets')
  listTickets(@CurrentUser() user: JwtUser, @Query() query: { page?: number; pageSize?: number; status?: string }) {
    return this.supportService.listTickets(user.id, user.roles, query);
  }

  @Get('tickets/:id')
  getTicket(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supportService.getTicket(user.id, user.roles, id);
  }

  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  @Audit('support.ticket-create')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  createTicket(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(userId, dto);
  }

  @Post('tickets/:id/messages')
  @Audit('support.ticket-message')
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  addMessage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AddMessageDto) {
    return this.supportService.addMessage(user.id, user.roles, id, dto);
  }

  @Post('tickets/:id/close')
  @Audit('support.ticket-close')
  closeTicket(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supportService.closeTicket(user.id, user.roles, id);
  }
}

export { TICKET_CATEGORIES };
