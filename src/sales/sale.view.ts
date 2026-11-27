import { Payment } from '../payments/entities/payment.entity';
import { Sale } from './entities/sale.entity';

export const toPaymentView = (p: Payment) => ({
  id: p.id,
  status: p.status,
  method: p.method,
  provider: p.provider,
  amountCents: p.amountCents,
  currency: p.currency,
  providerReference: p.providerReference,
  failureCode: p.failureCode,
  failureMessage: p.failureMessage,
  processedAt: p.processedAt,
});

export const toSaleSummary = (s: Sale) => ({
  id: s.id,
  merchantId: s.merchantId,
  storeId: s.storeId,
  status: s.status,
  currency: s.currency,
  totalCents: s.totalCents,
  itemCount: s.itemCount,
  cashierUserId: s.cashierUserId,
  failureReason: s.failureReason,
  paymentStatus: s.payment?.status ?? null,
  createdAt: s.createdAt,
  completedAt: s.completedAt,
});

export const toSaleView = (s: Sale) => ({
  ...toSaleSummary(s),
  items: (s.items ?? []).map((i) => ({
    productId: i.productId,
    sku: i.productSku,
    name: i.productName,
    unitPriceCents: i.unitPriceCents,
    quantity: i.quantity,
    lineTotalCents: i.lineTotalCents,
  })),
  payment: s.payment ? toPaymentView(s.payment) : null,
});

export type SaleView = ReturnType<typeof toSaleView>;
