import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GatewayIntent,
  PaymentGateway,
  WebhookEvent,
} from './payment-gateway.interface';

export interface BankAccount {
  bankName: string;
  accountTitle: string;
  iban: string;
  /** Optional display note, e.g. branch. */
  note?: string;
  isActive?: boolean;
}

/**
 * Manual bank-transfer gateway — fully working, no external calls.
 *
 * Flow:
 *  1. createIntent() returns the configured bank accounts + the exact amount
 *     (paisa, server-side) and the payment reference the customer must use.
 *  2. The customer pays via their banking app and uploads the receipt
 *     (POST /memberships/manual-receipt/:paymentId).
 *  3. An admin verifies the transfer out-of-band (bank statement) and
 *     approves/rejects the payment (POST /payments/:id/approve|reject).
 *
 * Manual payments never receive server webhooks.
 */
@Injectable()
export class ManualGateway implements PaymentGateway {
  readonly name = 'MANUAL' as const;
  private readonly logger = new Logger(ManualGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Also serves BANK_TRANSFER — same flow, same accounts. */
  get aliases(): Array<'BANK_TRANSFER'> {
    return ['BANK_TRANSFER'];
  }

  async createIntent(payment: {
    id: string;
    amount: number;
    currency: string;
    userId: string;
  }): Promise<GatewayIntent> {
    const accounts = await this.getBankAccounts();
    return {
      kind: 'MANUAL_INSTRUCTIONS',
      clientData: {
        paymentId: payment.id,
        amountPaisa: payment.amount,
        currency: payment.currency,
        reference: `BCH-${payment.id.slice(0, 8).toUpperCase()}`,
        accounts,
        instructions:
          'Transfer the exact amount to one of the accounts above, then upload your payment receipt. Your membership activates after admin verification (usually within a few hours).',
      },
    };
  }

  async getBankAccounts(): Promise<BankAccount[]> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'bank_accounts' },
    });
    const raw = (setting?.value as unknown) ?? [];
    if (!Array.isArray(raw)) return [];
    return (raw as BankAccount[]).filter((a) => a && a.isActive !== false);
  }

  async verifyWebhook(): Promise<WebhookEvent> {
    // Manual transfers have no server-to-server callbacks.
    throw new BadRequestException({
      code: 'MANUAL_NO_WEBHOOK',
      message: 'Manual bank transfers do not send webhooks. Upload a receipt instead.',
    });
  }
}
