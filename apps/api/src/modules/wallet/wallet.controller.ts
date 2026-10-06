/* eslint-disable @typescript-eslint/no-unused-vars -- stub: params define the route contract, wiring lands later */

import { Get, Query, Controller } from '@nestjs/common';
import { ApiResponse, PaginatedResponse } from '@bachatly/types';
import { WalletService } from './wallet.service';

/**
 * wallet routes (STUB — route contract only).
 * Guards/auth are inherited globally; no per-controller guard wiring.
 */
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /** TODO: caller's wallet balance (paisa). */
  @Get()
  async getBalance(): Promise<ApiResponse<{ balance: number; currency: string }>> {
    throw new Error("Not implemented — TODO: caller wallet balance (paisa)");
  }

  /** TODO: append-only wallet ledger. */
  @Get('transactions')
  async getTransactions(@Query() query: { page?: number; pageSize?: number }): Promise<PaginatedResponse<{ id: string; amount: number; type: string; createdAt: string }>> {
    throw new Error('Not implemented — TODO: append-only wallet ledger');
  }
}
