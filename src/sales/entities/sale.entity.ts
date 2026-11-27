import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../../database/transformers';
import { Payment } from '../../payments/entities/payment.entity';
import { SaleItem } from './sale-item.entity';

export enum SaleStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  COMPLETED = 'COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId: string;

  @Column({ name: 'cashier_user_id', type: 'uuid' })
  cashierUserId: string;

  @Column({ type: 'varchar', length: 32 })
  status: SaleStatus;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'total_cents', type: 'bigint', transformer: bigintToNumber })
  totalCents: number;

  @Column({ name: 'item_count', type: 'integer' })
  itemCount: number;

  @Column({ name: 'idempotency_key', length: 255 })
  idempotencyKey: string;

  @Column({ name: 'failure_reason', type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale)
  items?: SaleItem[];

  @OneToOne(() => Payment, (payment) => payment.sale)
  payment?: Payment | null;
}
