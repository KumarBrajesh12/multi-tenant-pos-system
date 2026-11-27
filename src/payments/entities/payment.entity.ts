import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../../database/transformers';
import { Sale } from '../../sales/entities/sale.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  CASH = 'CASH',
  WALLET = 'WALLET',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @Column({ length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 32 })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 32 })
  status: PaymentStatus;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintToNumber })
  amountCents: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 255, nullable: true })
  providerReference: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  @Column({ name: 'failure_message', type: 'varchar', length: 255, nullable: true })
  failureMessage: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Sale, (sale) => sale.payment, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'sale_id' })
  sale?: Sale;
}
