import { PaymentMethod } from '../entities/payment.entity';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  // our sale id, so the provider side can be matched to the sale later
  reference: string;
  // forwarded to the provider so a retried charge can't be taken twice
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  token?: string;
}

export type ChargeResult =
  | { status: 'SUCCEEDED'; providerReference: string }
  | { status: 'FAILED'; providerReference?: string; failureCode: string; failureMessage: string };

// bind a different implementation to PAYMENT_PROVIDER to use a real gateway
export interface PaymentProvider {
  readonly name: string;

  charge(request: ChargeRequest): Promise<ChargeResult>;

  // look up a charge we lost track of (timeout / crash). null = provider never saw it
  findCharge(reference: string): Promise<ChargeResult | null>;
}
