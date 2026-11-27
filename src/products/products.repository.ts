import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { escapeLike } from '../common/utils/db';
import { ListProductsQuery } from './dto/list-products.query';
import { Product } from './entities/product.entity';

// Every method takes the merchantId - there is intentionally no "find by id" without it.
@Injectable()
export class ProductsRepository {
  constructor(@InjectRepository(Product) private readonly repo: Repository<Product>) {}

  findOne(merchantId: string, id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id, merchantId } });
  }

  findMany(merchantId: string, ids: string[], em?: EntityManager): Promise<Product[]> {
    const repo = em ? em.getRepository(Product) : this.repo;
    return repo.find({ where: { merchantId, id: In(ids) } });
  }

  async list(merchantId: string, q: ListProductsQuery): Promise<[Product[], number]> {
    const qb = this.repo.createQueryBuilder('p').where('p.merchantId = :merchantId', { merchantId });

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

  create(merchantId: string, data: Partial<Product>): Promise<Product> {
    return this.repo.save(this.repo.create({ ...data, merchantId }));
  }

  save(product: Product): Promise<Product> {
    return this.repo.save(product);
  }
}
