import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { hashRequest } from '../common/utils/hash';

// Product list/detail cache. Keys:
//   pos:merchant:{merchantId}:products:version
//   pos:merchant:{merchantId}:products:v{n}:list:{hash}
//   pos:merchant:{merchantId}:products:v{n}:item:{id}
// Writes bump the version instead of deleting keys; old ones expire with the TTL.
// TenantGuard runs before this, so entries can be shared by all users of a merchant.
@Injectable()
export class ProductCache {
  private readonly logger = new Logger(ProductCache.name);

  constructor(private readonly cache: CacheService) {}

  async getOrLoadList<T>(merchantId: string, query: object, load: () => Promise<T>): Promise<T> {
    const version = await this.version(merchantId);
    return this.getOrLoad(`${this.prefix(merchantId)}:v${version}:list:${hashRequest(query)}`, load);
  }

  async getOrLoadItem<T>(merchantId: string, productId: string, load: () => Promise<T>): Promise<T> {
    const version = await this.version(merchantId);
    return this.getOrLoad(`${this.prefix(merchantId)}:v${version}:item:${productId}`, load);
  }

  // call after the DB change is committed
  async invalidate(merchantId: string): Promise<void> {
    const ok = await this.cache.incr(this.versionKey(merchantId));
    if (!ok) {
      this.logger.warn(`could not invalidate product cache for merchant ${merchantId}, entries expire with TTL`);
    }
  }

  private async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await load();
    // round-trip through JSON so a miss returns exactly what a hit would
    const value = JSON.parse(JSON.stringify(fresh)) as T;
    await this.cache.set(key, value);
    return value;
  }

  private async version(merchantId: string): Promise<number> {
    return (await this.cache.get<number>(this.versionKey(merchantId))) ?? 0;
  }

  private prefix(merchantId: string): string {
    return `pos:merchant:${merchantId}:products`;
  }

  private versionKey(merchantId: string): string {
    return `${this.prefix(merchantId)}:version`;
  }
}
