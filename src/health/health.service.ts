import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';

export type ComponentStatus = 'up' | 'down' | 'disabled';

export interface HealthReport {
  // degraded = API works, but without the cache
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  components: Record<string, ComponentStatus>;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.pingDatabase(), this.pingRedis()]);
    return {
      status: database === 'down' ? 'error' : redis === 'down' ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      components: { database, redis },
    };
  }

  private async pingDatabase(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<ComponentStatus> {
    if (!this.cache.enabled) return 'disabled';
    return (await this.cache.ping()) ? 'up' : 'down';
  }
}
