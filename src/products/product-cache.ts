import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { hashRequest } from '../common/utils/hash';

/**
 * Cache for the product catalogue (list + detail), the most read data in the POS.
 *
 * Keys always contain the merchant id, so one tenant can never be served another
 * tenant's entries:
 *   pos:merchant:{merchantId}:products:version            -> counter
 *   pos:merchant:{merchantId}:products:v{n}:list:{hash}   -> list page
 *   pos:merchant:{merchantId}:products:v{n}:item:{id}     -> single product
 *
 * Invalidation bumps the merchant's version, so every cached page/item of that merchant
 * is skipped at once (no SCAN/DEL). Old keys simply expire with their TTL.
 *
 * Access is checked by TenantGuard before we get here, so the cached data doesn't
 * depend on who is asking - cashier and admin of the same merchant share entries.
 */
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
