import { Injectable } from '@nestjs/common';
import { TenantContext } from '../access/tenant-context';
import { paginate } from '../common/dto/pagination.dto';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { ListSalesQuery } from './dto/list-sales.query';
import { Sale } from './entities/sale.entity';
import { toPaymentView, toSaleSummary, toSaleView } from './sale.view';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
  constructor(private readonly sales: SalesRepository) {}

  async list(tenant: TenantContext, query: ListSalesQuery) {
    const [rows, total] = await this.sales.list(tenant.merchantId, tenant.storeId!, query);
    return paginate(rows.map(toSaleSummary), total, query);
  }

  async get(tenant: TenantContext, saleId: string) {
    return toSaleView(await this.getOrFail(tenant, saleId));
  }

  async getPayment(tenant: TenantContext, saleId: string) {
    const sale = await this.getOrFail(tenant, saleId);
    if (!sale.payment) throw new ResourceNotFoundException('Payment');
    return { saleId: sale.id, ...toPaymentView(sale.payment) };
  }

  private async getOrFail(tenant: TenantContext, saleId: string): Promise<Sale> {
    const sale = await this.sales.findForStore(tenant.merchantId, tenant.storeId!, saleId);
    if (!sale) throw new ResourceNotFoundException('Sale');
    return sale;
  }
}
