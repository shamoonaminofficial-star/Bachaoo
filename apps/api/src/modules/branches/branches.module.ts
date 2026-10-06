import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BusinessBranchesController } from './business-branches.controller';
import { BranchesService } from './branches.service';
import { BusinessesModule } from '../businesses/businesses.module';

/**
 * Branches are always scoped to a business; ownership checks go through
 * BusinessesService (imported here — BusinessesModule does not import back,
 * so there is no circular dependency).
 */
@Module({
  imports: [BusinessesModule],
  controllers: [BranchesController, BusinessBranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
