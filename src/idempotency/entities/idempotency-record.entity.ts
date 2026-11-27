import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum IdempotencyStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('idempotency_records')
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'idempotency_key', length: 255 })
  idempotencyKey: string;

  // sha256 of the normalized request body
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ type: 'varchar', length: 16 })
  status: IdempotencyStatus;

  @Column({ name: 'response_status_code', type: 'integer', nullable: true })
  responseStatusCode: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: unknown;

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
