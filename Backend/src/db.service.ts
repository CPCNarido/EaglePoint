import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private client: Client;

  constructor(private config: ConfigService) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    this.client = new Client({ connectionString, ssl: { rejectUnauthorized: false } } as any);
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.end();
  }

  async query(text: string, params?: any[]) {
    return this.client.query(text, params);
  }
}
