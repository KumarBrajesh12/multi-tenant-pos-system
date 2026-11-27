import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { ChargeRequest, PaymentProvider } from './providers/payment-provider';

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<never, true>;

const request = (overrides: Partial<ChargeRequest> = {}): ChargeRequest => ({
  reference: 'sale-1',
  idempotencyKey: 'store-1:key-1',
  amountCents: 1000,
  currency: 'USD',
  method: PaymentMethod.CARD,
  ...overrides,
});

// the "provider throws" case logs a warning on purpose
beforeAll(() => Logger.overrideLogger(false));

describe('PaymentsService', () => {
  const fakeProvider = (charge: PaymentProvider['charge']): PaymentProvider => ({
    name: 'fake',
    charge,
    findCharge: async () => null,
  });

  it('passes the provider result through', async () => {
    const service = new PaymentsService(
      fakeProvider(async () => ({ status: 'SUCCEEDED', providerReference: 'ch_1' })),
      config({ 'payments.timeoutMs': 1000 }),
    );
    await expect(service.charge(request())).resolves.toEqual({ status: 'SUCCEEDED', providerReference: 'ch_1' });
  });

  it('returns UNKNOWN when the provider is too slow', async () => {
    const service = new PaymentsService(
      fakeProvider(() => new Promise(() => undefined)),
      config({ 'payments.timeoutMs': 20 }),
    );
    await expect(service.charge(request())).resolves.toMatchObject({ status: 'UNKNOWN' });
  });

  it('returns UNKNOWN when the provider throws', async () => {
    const service = new PaymentsService(
      fakeProvider(async () => {
        throw new Error('connection reset');
      }),
      config({ 'payments.timeoutMs': 1000 }),
    );
    await expect(service.charge(request())).resolves.toMatchObject({ status: 'UNKNOWN' });
  });
});

describe('MockPaymentProvider', () => {
  const provider = () => new MockPaymentProvider(config({ 'payments.mockLatencyMs': 0 }));

  it('succeeds by default and fails for test tokens', async () => {
    const p = provider();
    await expect(p.charge(request())).resolves.toMatchObject({ status: 'SUCCEEDED' });
    await expect(p.charge(request({ idempotencyKey: 'k2', token: 'tok_declined' }))).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'card_declined',
    });
  });

  it('returns the same result for the same idempotency key', async () => {
    const p = provider();
    const first = await p.charge(request());
    const second = await p.charge(request());
    expect(second).toBe(first);
  });

  it('can look up a charge by reference', async () => {
    const p = provider();
    const result = await p.charge(request({ reference: 'sale-42' }));
    await expect(p.findCharge('sale-42')).resolves.toBe(result);
    await expect(p.findCharge('unknown')).resolves.toBeNull();
  });
});
