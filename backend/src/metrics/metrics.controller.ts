import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUserId } from '../common';
import { MetricsService, type BlockWindow } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('blocks')
  @ApiOperation({
    summary: 'Blocked attempts per day, for the last seven days.',
    description:
      'Counts only. There is no domain, hostname, URL or per-site breakdown in ' +
      'this response, and no parameter that could ask for one: the only ' +
      'telemetry stored anywhere is an integer per device per day. ' +
      'Arrays are oldest first, with index 6 = today.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        weeklyBlocks: { type: 'array', items: { type: 'integer' }, minItems: 7, maxItems: 7 },
        blocksToday: { type: 'integer' },
        perDevice: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              deviceId: { type: 'string' },
              weeklyBlocks: { type: 'array', items: { type: 'integer' } },
            },
          },
        },
      },
    },
  })
  blocks(@CurrentUserId() userId: string): Promise<BlockWindow> {
    return this.metrics.blockWindow(userId);
  }
}
