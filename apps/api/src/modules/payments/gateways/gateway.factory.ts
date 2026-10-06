import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { GatewayName, PaymentGateway } from './payment-gateway.interface';

/** Injection token for the array of registered gateway implementations. */
export const GATEWAYS = Symbol('PAYMENT_GATEWAYS');

/**
 * Resolves a gateway implementation by name.
 *
 * MANUAL and BANK_TRANSFER share the ManualGateway (bank transfer is the same
 * flow). Adding a gateway = implement PaymentGateway + register it in
 * PaymentsModule's GATEWAYS provider. Nothing else changes.
 */
@Injectable()
export class GatewayFactory {
  private readonly logger = new Logger(GatewayFactory.name);

  constructor(@Inject(GATEWAYS) private readonly gateways: PaymentGateway[]) {}

  resolve(name: string): PaymentGateway {
    const upper = String(name).toUpperCase() as GatewayName;
    // ManualGateway also serves BANK_TRANSFER via its aliases.
    const found = this.gateways.find(
      (g) =>
        g.name === upper ||
        (typeof (g as { aliases?: string[] }).aliases !== 'undefined' &&
          ((g as { aliases?: string[] }).aliases ?? []).includes(upper)),
    );
    if (!found) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_GATEWAY',
        message: `Unsupported payment gateway: ${name}. Supported: ${this.supported().join(', ')}.`,
      });
    }
    return found;
  }

  supported(): string[] {
    const names = new Set<string>();
    for (const g of this.gateways) {
      names.add(g.name);
      const aliases = (g as { aliases?: string[] }).aliases;
      if (Array.isArray(aliases)) for (const a of aliases) names.add(a);
    }
    return [...names];
  }
}
