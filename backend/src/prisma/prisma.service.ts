import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { AppConfigService } from '../config';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * The Prisma client, as a Nest provider.
 *
 * Prisma 7 no longer reads the connection URL from the schema, so the pool and
 * driver adapter are constructed here from validated config.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(config: AppConfigService) {
    const pool = new Pool({ connectionString: config.databaseUrl });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }

  /** Cheap liveness probe for the readiness endpoint. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
