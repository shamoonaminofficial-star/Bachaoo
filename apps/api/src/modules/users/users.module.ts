import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { MeController } from './me.controller';
import { UsersService } from './users.service';
import { MeService } from './me.service';
import { DashboardService } from './dashboard.service';
import { StorageModule } from '../../common/storage/storage.module';

/**
 * Users domain module.
 * MeController is registered before UsersController so the static
 * `users/me/*` routes match before the `users/:id` admin route.
 */
@Module({
  imports: [StorageModule],
  controllers: [MeController, UsersController],
  providers: [UsersService, MeService, DashboardService],
  exports: [UsersService, MeService, DashboardService],
})
export class UsersModule {}
