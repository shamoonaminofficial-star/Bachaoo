import { Module } from '@nestjs/common';
import { GATEWAYS, GatewayFactory } from './gateway.factory';
import { ManualGateway } from './manual.gateway';
import { JazzCashGateway } from './jazzcash.gateway';
import { EasypaisaGateway } from './easypaisa.gateway';
import { StripeGateway } from './stripe.gateway';

/**
 * Standalone module so both PaymentsModule and MembershipsModule can use the
 * GatewayFactory without a circular dependency.
 */
@Module({
  providers: [
    ManualGateway,
    JazzCashGateway,
    EasypaisaGateway,
    StripeGateway,
    {
      provide: GATEWAYS,
      useFactory: (
        manual: ManualGateway,
        jazzcash: JazzCashGateway,
        easypaisa: EasypaisaGateway,
        stripe: StripeGateway,
      ) => [manual, jazzcash, easypaisa, stripe],
      inject: [ManualGateway, JazzCashGateway, EasypaisaGateway, StripeGateway],
    },
    GatewayFactory,
  ],
  exports: [GatewayFactory, ManualGateway],
})
export class GatewaysModule {}
