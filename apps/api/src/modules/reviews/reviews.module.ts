import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { BusinessesModule } from '../businesses/businesses.module';

/**
 * Phase 11 — reviews. Imports BusinessesModule for the ownership assertion on
 * partner replies.
 */
@Module({
  imports: [BusinessesModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
