import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { ChargeRequest, ChargeResult, PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';

// UNKNOWN = we don't know if the customer was charged (timeout, network error)
export type ChargeOutcome = ChargeResult | { status: 'UNKNOWN'; reason: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly timeoutMs: number;

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    config: ConfigService<AppConfig, true>,
  ) {
    this.timeoutMs = config.get('payments.timeoutMs', { infer: true });
  }

  get providerName(): string {
    return this.provider.name;
  }

  // Never throws: provider errors and timeouts become UNKNOWN so the caller
  // can leave the sale pending instead of guessing.
  async charge(request: ChargeRequest): Promise<ChargeOutcome> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<ChargeOutcome>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: 'UNKNOWN', reason: `provider did not answer within ${this.timeoutMs}ms` }),
        this.timeoutMs,
      );
    });

    try {
      return await Promise.race([this.provider.charge(request), timeout]);
    } catch (err) {
      this.logger.warn(`charge for ${request.reference} failed: ${(err as Error).message}`);
      return { status: 'UNKNOWN', reason: 'provider error' };
    } finally {
      clearTimeout(timer);
    }
  }

  async findCharge(reference: string): Promise<ChargeResult | null> {
    return this.provider.findCharge(reference);
  }
}
