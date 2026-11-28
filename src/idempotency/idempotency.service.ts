import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { IdempotencyRecord, IdempotencyStatus } from './entities/idempotency-record.entity';

export interface IdempotencyScope {
  merchantId: string;
  storeId: string;
  userId: string;
  key: string;
  requestHash: string;
}

export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  // Returns the record id if we got the key, null if it's taken. With a concurrent request
  // on the same key, the INSERT waits on the unique index until the other tx finishes.
  async claim(em: EntityManager, scope: IdempotencyScope): Promise<string | null> {
    const rows: Array<{ id: string }> = await em.query(
      `INSERT INTO idempotency_records (merchant_id, store_id, user_id, idempotency_key, request_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS')
       ON CONFLICT (store_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [scope.merchantId, scope.storeId, scope.userId, scope.key, scope.requestHash],
    );
    return rows[0]?.id ?? null;
  }

  // different body -> 409, same body + done -> stored response, still running -> 409
  async resolveExisting(em: EntityManager, scope: IdempotencyScope): Promise<StoredResponse> {
    const record = await em.getRepository(IdempotencyRecord).findOne({
      where: { storeId: scope.storeId, idempotencyKey: scope.key },
    });
    if (!record) {
      throw this.inProgress();
    }

    if (record.requestHash !== scope.requestHash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used with a different request body',
      );
    }
    if (record.status !== IdempotencyStatus.COMPLETED) {
      throw this.inProgress();
    }
    return { statusCode: record.responseStatusCode!, body: record.responseBody };
  }

  async attachSale(em: EntityManager, recordId: string, saleId: string): Promise<void> {
    await em.update(IdempotencyRecord, { id: recordId }, { saleId });
  }

  async completeForSale(em: EntityManager, saleId: string, response: StoredResponse): Promise<void> {
    await em.update(
      IdempotencyRecord,
      { saleId },
      {
        status: IdempotencyStatus.COMPLETED,
        responseStatusCode: response.statusCode,
        responseBody: response.body as object,
      },
    );
  }

  private inProgress() {
    return new AppException(
      HttpStatus.CONFLICT,
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      'A request with this Idempotency-Key is still being processed, retry shortly',
    );
  }
}
