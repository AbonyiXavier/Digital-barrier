import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma';
import { QUEUE } from '../queues';

/**
 * Two probes, because they answer different questions. Liveness asks "is the
 * process wedged, should it be restarted"; readiness asks "can it serve traffic".
 * Conflating them makes a brief database blip restart the process.
 */
@ApiTags('health')
@AllowAnonymous()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process is up. No dependencies checked.' })
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Dependencies reachable: Postgres and Redis.' })
  async ready(): Promise<{ status: 'ok'; checks: Record<string, 'up' | 'down'> }> {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.ping()),
      // getJobCounts round-trips to Redis, which is the thing being checked.
      // BullMQ 6 no longer exposes the raw client off the queue.
      this.check(() => this.queue.getJobCounts()),
    ]);

    const checks = { database, redis };
    if (database === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Dependency down', details: checks });
    }
    return { status: 'ok', checks };
  }

  private async check(probe: () => Promise<unknown>): Promise<'up' | 'down'> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
