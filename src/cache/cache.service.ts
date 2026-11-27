import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

/**
 * Thin Redis wrapper. The cache is an optimisation only, so every call fails
 * open: if Redis is down or slow we log and fall back to the database instead
 * of failing the request.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly defaultTtl: number;
  private lastErrorLog = 0;

  constructor(config: ConfigService<AppConfig, true>) {
    const cache = config.get('cache', { infer: true });
    this.defaultTtl = cache.ttlSeconds;

    if (!cache.enabled) {
      this.redis = null;
      this.logger.log('Cache disabled (CACHE_ENABLED=false)');
      return;
    }

    const redis = config.get('redis', { infer: true });
    this.redis = new Redis({
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      // don't queue commands while disconnected and don't wait long - just skip the cache
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 500,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.redis.on('error', (err) => this.logError('connection', err));
  }

  get enabled(): boolean {
    return this.redis !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.logError('get', err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = this.defaultTtl): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logError('set', err);
    }
  }

  // returns false when Redis couldn't be reached so callers can log it
  async incr(key: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      await this.redis.incr(key);
      return true;
    } catch (err) {
      this.logError('incr', err);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  // avoid flooding the logs when Redis is down for a while
  private logError(op: string, err: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLog > 10_000) {
      this.lastErrorLog = now;
      const e = err as Error & { code?: string };
      this.logger.warn(`Redis ${op} failed, serving without cache: ${e.message || e.code || 'unknown error'}`);
    }
  }
}
