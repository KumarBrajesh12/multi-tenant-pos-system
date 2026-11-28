import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { escapeLike } from '../common/utils/db';
import { ListProductsQuery } from './dto/list-products.query';
import { Product } from './entities/product.entity';

// every method takes merchantId; em comes from TenantDb.run()
@Injectable()
export class ProductsRepository {
  findOne(em: EntityManager, merchantId: string, id: string): Promise<Product | null> {
    return em.getRepository(Product).findOne({ where: { id, merchantId } });
  }

  findMany(em: EntityManager, merchantId: string, ids: string[]): Promise<Product[]> {
    return em.getRepository(Product).find({ where: { merchantId, id: In(ids) } });
  }

  async list(em: EntityManager, merchantId: string, q: ListProductsQuery): Promise<[Product[], number]> {
    const qb = em
      .getRepository(Product)
      .createQueryBuilder('p')
      .where('p.merchantId = :merchantId', { merchantId });

    if (q.search) {
      qb.andWhere('(p.name ILIKE :term OR p.sku ILIKE :term)', { term: `%${escapeLike(q.search)}%` });
    }
    if (q.isActive !== undefined) {
      qb.andWhere('p.isActive = :isActive', { isActive: q.isActive });
    }

    return qb
      .orderBy(`p.${q.sort}`, q.order === 'desc' ? 'DESC' : 'ASC')
      .addOrderBy('p.id', 'ASC') // stable paging
      .skip(q.offset)
      .take(q.limit)
      .getManyAndCount();
  }

  create(em: EntityManager, merchantId: string, data: Partial<Product>): Promise<Product> {
    const repo = em.getRepository(Product);
    return repo.save(repo.create({ ...data, merchantId }));
  }

  save(em: EntityManager, product: Product): Promise<Product> {
    return em.getRepository(Product).save(product);
  }
}
