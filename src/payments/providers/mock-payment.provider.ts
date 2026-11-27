import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppConfig } from '../../config/configuration';
import { ChargeRequest, ChargeResult, PaymentProvider } from './payment-provider';

/**
 * Fake gateway. The outcome is picked with the payment token, like test cards:
 *   tok_declined            -> FAILED (card_declined)
 *   tok_insufficient_funds  -> FAILED (insufficient_funds)
 *   tok_timeout             -> never answers in time (sale stays PENDING_PAYMENT)
 *   anything else / none    -> SUCCEEDED
 *
 * Like a real gateway it is idempotent per idempotencyKey. State is in memory only.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly byIdempotencyKey = new Map<string, ChargeResult>();
  private readonly byReference = new Map<string, ChargeResult>();
  private readonly latencyMs: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.latencyMs = config.get('payments.mockLatencyMs', { infer: true });
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const previous = this.byIdempotencyKey.get(req.idempotencyKey);
    if (previous) return previous;

    if (req.token === 'tok_timeout') {
      await sleep(60_000);
    } else if (this.latencyMs > 0) {
      await sleep(this.latencyMs);
    }

    const result = this.decide(req);
    this.byIdempotencyKey.set(req.idempotencyKey, result);
    this.byReference.set(req.reference, result);
    this.logger.debug(`charge ${req.reference} ${req.amountCents} ${req.currency} -> ${result.status}`);
    return result;
  }

  async findCharge(reference: string): Promise<ChargeResult | null> {
    return this.byReference.get(reference) ?? null;
  }

  private decide(req: ChargeRequest): ChargeResult {
    const providerReference = `mock_ch_${randomUUID()}`;
    switch (req.token) {
      case 'tok_declined':
        return { status: 'FAILED', providerReference, failureCode: 'card_declined', failureMessage: 'The card was declined' };
      case 'tok_insufficient_funds':
        return {
          status: 'FAILED',
          providerReference,
          failureCode: 'insufficient_funds',
          failureMessage: 'Insufficient funds',
        };
      default:
        return { status: 'SUCCEEDED', providerReference };
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref());
