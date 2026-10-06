import { Get, Post, Param, Query, Body, Controller, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ROLES } from '../../common/constants';
import { ReviewsService, CreateReviewInput } from './reviews.service';

class CreateReviewDto implements CreateReviewInput {
  @IsUUID()
  businessId!: string;

  @IsUUID()
  @IsOptional()
  dealId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  body?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}

class ReplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  body!: string;
}

/**
 * Phase 11 — reviews. Listing is public; posting requires CUSTOMER;
 * replies require business ownership/management. Moderation lives under
 * /admin/reviews/* (Phase 9).
 */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** Public: approved reviews + aggregate for a business. */
  @Public()
  @Get('business/:businessId')
  getBusinessReviews(@Param('businessId') businessId: string, @Query() query: { page?: number; pageSize?: number }) {
    return this.reviewsService.getBusinessReviews(businessId, query);
  }

  /** Post (or update) a review — gated on a confirmed redemption at the business. */
  @Roles(ROLES.CUSTOMER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createReview(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(userId, dto);
  }

  /** Partner reply to a review (one reply per review). */
  @Roles(ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER)
  @Post(':id/reply')
  @Audit('review.reply')
  replyToReview(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.reviewsService.replyToReview(user.id, user.roles, id, dto.body);
  }
}
