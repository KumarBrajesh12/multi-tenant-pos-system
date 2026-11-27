import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { bigintToNumber } from '../../database/transformers';
import { Sale } from './sale.entity';

// sku/name/price are copied from the product at sale time so old sales
// don't change when the catalogue does
@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'product_sku', length: 64 })
  productSku: string;

  @Column({ name: 'product_name', length: 200 })
  productName: string;

  @Column({ name: 'unit_price_cents', type: 'integer' })
  unitPriceCents: number;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'line_total_cents', type: 'bigint', transformer: bigintToNumber })
  lineTotalCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Sale, (sale) => sale.items, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'sale_id' })
  sale?: Sale;
}
