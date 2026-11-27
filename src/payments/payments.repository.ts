import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { ChargeResult } from './providers/payment-provider';

@Injectable()
export class PaymentsRepository {
  createPending(em: EntityManager, data: Partial<Payment>): Promise<Payment> {
    const repo = em.getRepository(Payment);
    return repo.save(repo.create({ ...data, status: PaymentStatus.PENDING }));
  }

  async recordResult(em: EntityManager, saleId: string, result: ChargeResult): Promise<void> {
    await em.update(
      Payment,
      { saleId },
      result.status === 'SUCCEEDED'
        ? {
            status: PaymentStatus.SUCCEEDED,
            providerReference: result.providerReference,
            processedAt: new Date(),
          }
        : {
            status: PaymentStatus.FAILED,
            providerReference: result.providerReference ?? null,
            failureCode: result.failureCode,
            failureMessage: result.failureMessage,
            processedAt: new Date(),
          },
    );
  }
}
