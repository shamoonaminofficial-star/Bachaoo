import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

// Full modules (implemented in this package)
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { DealsModule } from './modules/deals/deals.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LocationsModule } from './modules/locations/locations.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { SearchModule } from './modules/search/search.module';

// Stub modules (owned by another worker; files at src/modules/<name>/<name>.module.ts)
import { BusinessesModule } from './modules/businesses/businesses.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { CashbackModule } from './modules/cashback/cashback.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CmsModule } from './modules/cms/cms.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { SettlementsModule } from './modules/settlements/settlements.module';

import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 120 requests/minute per IP. Tighter per-route limits
    // (auth, OTP, QR) are applied with @Throttle() on specific endpoints.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    // Cron jobs (deal auto-expiry, …).
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,

    // Full modules
    AuthModule,
    UsersModule,
    RolesModule,
    RedemptionsModule,
    DealsModule,
    MembershipsModule,
    PaymentsModule,
    LocationsModule,
    FavoritesModule,
    SearchModule,
    BusinessesModule,
    BranchesModule,
    CategoriesModule,

    // Stub modules (owned by another worker; files at src/modules/<name>/<name>.module.ts)
    VouchersModule,
    RewardsModule,
    WalletModule,
    CashbackModule,
    ReferralsModule,
    ReviewsModule,
    NotificationsModule,
    ReportsModule,
    AnalyticsModule,
    CmsModule,
    SupportModule,
    AdminModule,
    CommissionsModule,
    SettlementsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global JWT guard; public routes opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Phase 13: HTTP caching policy (public GETs cacheable 60s; the rest no-store).
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
  ],
})
export class AppModule {}
