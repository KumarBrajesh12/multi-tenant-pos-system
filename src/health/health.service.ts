import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  timestamp: string;
  components: Record<string, ComponentStatus>;
}

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthReport> {
    const database = await this.ping();
    return {
      status: database === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      components: { database },
    };
  }

  private async ping(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
