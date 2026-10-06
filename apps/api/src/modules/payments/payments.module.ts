import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { GatewaysModule } from './gateways/gateways.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Gateway registration lives in GatewaysModule: adding a gateway = implement
 * PaymentGateway and register it in the GATEWAYS provider there.
 */
@Module({
  imports: [MembershipsModule, GatewaysModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
