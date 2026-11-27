import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
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
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Tries to claim the key inside the caller's transaction.
   *
   * The unique index on (store_id, idempotency_key) does the real work: if another
   * request with the same key is still running, this INSERT waits for its transaction
   * to finish, then either succeeds (other one rolled back) or hits the conflict.
   *
   * Returns the record id when we own the key, or null if it already exists.
   */
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

  /**
   * What to do with a key that was already used:
   * - different body          -> 409, the key can't be reused for another sale
   * - same body, finished     -> return the stored response
   * - same body, still running -> 409, client should retry a bit later
   */
  async resolveExisting(scope: IdempotencyScope): Promise<StoredResponse> {
    const record = await this.db.getRepository(IdempotencyRecord).findOne({
      where: { storeId: scope.storeId, idempotencyKey: scope.key },
    });
    if (!record) {
      // only possible if the record was cleaned up in between - treat as in progress
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
