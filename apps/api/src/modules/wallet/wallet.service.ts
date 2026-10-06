/* eslint-disable @typescript-eslint/no-unused-vars -- stub: params define the route contract, wiring lands later */

import { Injectable } from '@nestjs/common';
import { ApiResponse, PaginatedResponse } from '@bachatly/types';

/**
 * Wallet domain logic (STUB).
 * Financial paths: use integer paisa and keep ledger writes inside transactions.
 */
@Injectable()
export class WalletService {
  /** TODO: caller's wallet balance (paisa). */
  async getBalance(): Promise<ApiResponse<{ balance: number; currency: string }>> {
    throw new Error("Not implemented — TODO: caller wallet balance (paisa)");
  }

  /** TODO: append-only wallet ledger. */
  async getTransactions(query: { page?: number; pageSize?: number }): Promise<PaginatedResponse<{ id: string; amount: number; type: string; createdAt: string }>> {
    throw new Error('Not implemented — TODO: append-only wallet ledger');
  }
}
