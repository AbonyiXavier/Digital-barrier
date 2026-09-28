import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Header,
  Headers,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';

import { CurrentUserId } from '../common';
import { CompiledBlocklistService } from './compiled.service';
import { FEED_JOB, type RefreshAllJob } from '../feeds/feed-jobs';
import { QUEUE } from '../queues';
import { BlocklistService, type BlocklistView, type PolicyDecision } from './blocklist.service';
import { AutoUpdateDto, CreateRuleDto, DecideQueryDto, type RuleListWire } from './dto';
import type { SafeSearchEntry } from './safesearch';

@ApiTags('blocklist')
@Controller('blocklist')
export class BlocklistController {
  constructor(
    private readonly blocklist: BlocklistService,
    private readonly compiled: CompiledBlocklistService,
    @InjectQueue(QUEUE.FEEDS) private readonly feedsQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: "The feeds in force plus this user's own two lists." })
  async overview(@CurrentUserId() userId: string): Promise<BlocklistView> {
    return this.blocklist.overview(userId);
  }

  @Post('rules')
  @ApiOperation({
    summary: 'Add a domain to the allowlist or the blocklist.',
    description:
      'A domain can be on only one list. Adding one that is already on the other moves it, ' +
      'and the response says so with `moved: true`.',
  })
  @ApiResponse({ status: 201, description: 'The normalised domain and the list it is on.' })
  @ApiResponse({ status: 400, description: 'INVALID_DOMAIN — not a bare hostname.' })
  async addRule(
    @CurrentUserId() userId: string,
    @Body() dto: CreateRuleDto,
  ): Promise<{ domain: string; list: RuleListWire; moved: boolean }> {
    return this.blocklist.addRule(userId, dto);
  }

  @Delete('rules/:domain')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a domain from whichever list it is on.' })
  @ApiParam({ name: 'domain', example: 'medicalnewstoday.com' })
  async removeRule(
    @CurrentUserId() userId: string,
    @Param('domain') domain: string,
  ): Promise<void> {
    await this.blocklist.removeRule(userId, domain);
  }

  @Put('auto-update')
  @ApiOperation({
    summary: 'Whether feeds refresh on their own.',
    description:
      'SCHEMA GAP: no model has a column for this. `true` is acknowledged because it is ' +
      'already the behaviour; `false` answers 501 rather than being silently forgotten.',
  })
  @ApiResponse({ status: 200, description: 'Auto-update is on.' })
  @ApiResponse({ status: 501, description: 'AUTO_UPDATE_NOT_STORABLE — cannot be turned off yet.' })
  setAutoUpdate(@Body() dto: AutoUpdateDto): { autoUpdate: boolean } {
    return this.blocklist.setAutoUpdate(dto.autoUpdate);
  }

  @Post('refresh')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Ask for a feed refresh now.',
    description:
      'Returns as soon as the job is queued: a refresh downloads tens of megabytes and ' +
      'must not be held open on a request.',
  })
  async refresh(): Promise<{ jobId: string; status: 'queued' }> {
    const job = await this.feedsQueue.add(FEED_JOB.REFRESH_ALL, {} satisfies RefreshAllJob);
    return { jobId: job.id ?? FEED_JOB.REFRESH_ALL, status: 'queued' };
  }

  @Get('compiled')
  @ApiOperation({
    summary: 'The blocklist as a compiled binary, for on-device matching.',
    description:
      'Sorted 64-bit FNV-1a hashes of every blocked domain in the categories this ' +
      'account has enabled. ~4.8 MB for 600k domains, versus ~110 MB to hold them as ' +
      'strings — which is what makes on-device filtering possible inside an iOS ' +
      'Network Extension, where the whole process must fit in 50 MiB. ' +
      'The format is documented in src/blocklist/compiled.ts; a client must reject a ' +
      'payload whose magic, version or hash id it does not recognise rather than guess. ' +
      'The caller\'s own block rules are NOT included: they come down with GET /blocklist ' +
      'and are merged client-side, which keeps this artifact identical for every account ' +
      'with the same categories and therefore cacheable.',
  })
  @ApiResponse({ status: 200, description: 'application/octet-stream.' })
  @ApiResponse({ status: 304, description: 'The ETag matched; nothing changed.' })
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async compiledBlocklist(
    @CurrentUserId() userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const protection = await this.blocklist.enabledCategoriesOf(userId);
    const artifact = await this.compiled.forCategories(protection);

    response.setHeader('ETag', artifact.etag);
    response.setHeader('X-Domain-Count', String(artifact.count));
    response.setHeader('X-Categories', artifact.categories.join(','));

    // A device on a metered connection polls this; answering 304 is the whole
    // point of hashing the body into an ETag.
    if (ifNoneMatch !== undefined && ifNoneMatch.split(',').some((t) => t.trim() === artifact.etag)) {
      response.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', String(artifact.body.length));
    response.status(HttpStatus.OK).end(artifact.body);
  }

  @Get('safesearch')
  @ApiOperation({
    summary: 'The forced-safe-search mapping table.',
    description:
      'Lookup is exact, not label-wise: a parent match would send mail.google.com to the ' +
      'search sandbox. That is why every host is enumerated.',
  })
  safeSearch(): { entries: SafeSearchEntry[]; count: number } {
    return this.blocklist.safeSearch();
  }

  @Get('decide')
  @ApiOperation({
    summary: 'What the policy would do with this domain, for support and verification.',
    description:
      'Order: allowlist > blocklist > safesearch > upstream. Nothing is logged or stored — ' +
      'this endpoint exists to explain a decision, not to record one.',
  })
  async decide(
    @CurrentUserId() userId: string,
    @Query() query: DecideQueryDto,
  ): Promise<PolicyDecision> {
    return this.blocklist.decideFor(userId, query.domain);
  }
}
