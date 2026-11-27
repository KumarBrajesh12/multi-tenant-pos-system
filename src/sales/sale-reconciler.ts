import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';
import { SalesRepository } from './sales.repository';

/**
 * Cleans up sales stuck in PENDING_PAYMENT (provider timed out, or the process died
 * between charging and saving the result). Asks the provider what happened; if it
 * never saw the charge, the sale is failed and its stock released.
 */
@Injectable()
export class SaleReconciler {
  private readonly logger = new Logger(SaleReconciler.name);
  private running = false;

  constructor(
    private readonly sales: SalesRepository,
    private readonly payments: PaymentsService,
    private readonly checkout: CheckoutService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Interval(30_000)
  async tick(): Promise<void> {
    if (!this.config.get('sales.reconcileEnabled', { infer: true }) || this.running) return;
    this.running = true;
    try {
      await this.reconcile();
    } catch (err) {
      this.logger.error('reconcile run failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  async reconcile(olderThanSeconds = this.config.get('sales.reconcileAfterSeconds', { infer: true })) {
    const saleIds = await this.sales.findStalePending(olderThanSeconds, 50);
    for (const saleId of saleIds) {
      const charge = await this.payments.findCharge(saleId);
      const outcome = charge ?? {
        status: 'FAILED' as const,
        failureCode: 'payment_timeout',
        failureMessage: 'No result from the payment provider',
      };
      await this.checkout.finalize(saleId, outcome);
      this.logger.log(`reconciled sale ${saleId} -> ${outcome.status}`);
    }
    return saleIds.length;
  }
}
