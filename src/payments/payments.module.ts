import { Module } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';

@Module({
  providers: [
    PaymentsService,
    PaymentsRepository,
    // only one provider for now; PAYMENT_PROVIDER env is validated to "mock"
    { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
  ],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
