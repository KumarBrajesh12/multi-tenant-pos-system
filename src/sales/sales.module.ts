import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { CheckoutService } from './checkout.service';
import { SaleReconciler } from './sale-reconciler';
import { SalesController } from './sales.controller';
import { SalesRepository } from './sales.repository';
import { SalesService } from './sales.service';

@Module({
  imports: [ProductsModule, InventoryModule, PaymentsModule, IdempotencyModule],
  controllers: [SalesController],
  providers: [SalesRepository, SalesService, CheckoutService, SaleReconciler],
  exports: [SaleReconciler],
})
export class SalesModule {}
