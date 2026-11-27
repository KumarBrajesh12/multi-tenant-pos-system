import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum MovementReason {
  RESTOCK = 'RESTOCK',
  ADJUSTMENT = 'ADJUSTMENT',
  DAMAGE = 'DAMAGE',
  RETURN = 'RETURN',
  SALE = 'SALE',
  SALE_REVERSAL = 'SALE_REVERSAL',
}

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'quantity_delta', type: 'integer' })
  quantityDelta: number;

  @Column({ name: 'quantity_after', type: 'integer' })
  quantityAfter: number;

  @Column({ type: 'varchar', length: 32 })
  reason: MovementReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
