import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantContext } from '../access/tenant-context';
import { paginate } from '../common/dto/pagination.dto';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { TenantDb } from '../database/tenant-db';
import { ListSalesQuery } from './dto/list-sales.query';
import { Sale } from './entities/sale.entity';
import { toPaymentView, toSaleSummary, toSaleView } from './sale.view';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sales: SalesRepository,
  ) {}

  async list(tenant: TenantContext, query: ListSalesQuery) {
    const [rows, total] = await this.tenantDb.run(tenant.merchantId, (em) =>
      this.sales.list(em, tenant.merchantId, tenant.storeId!, query),
    );
    return paginate(rows.map(toSaleSummary), total, query);
  }

  get(tenant: TenantContext, saleId: string) {
    return this.tenantDb.run(tenant.merchantId, async (em) => toSaleView(await this.getOrFail(em, tenant, saleId)));
  }

  getPayment(tenant: TenantContext, saleId: string) {
    return this.tenantDb.run(tenant.merchantId, async (em) => {
      const sale = await this.getOrFail(em, tenant, saleId);
      if (!sale.payment) throw new ResourceNotFoundException('Payment');
      return { saleId: sale.id, ...toPaymentView(sale.payment) };
    });
  }

  private async getOrFail(em: EntityManager, tenant: TenantContext, saleId: string): Promise<Sale> {
    const sale = await this.sales.findForStore(em, tenant.merchantId, tenant.storeId!, saleId);
    if (!sale) throw new ResourceNotFoundException('Sale');
    return sale;
  }
}
