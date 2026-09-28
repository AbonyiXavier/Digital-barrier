import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma';
import type { ProtectionCategory } from '../../generated/prisma/client';
import { compile } from './compiled';

export interface CompiledArtifact {
  body: Buffer;
  etag: string;
  count: number;
  categories: ProtectionCategory[];
}

/**
 * Builds and caches the compiled blocklist.
 *
 * Cached across users, not per user. The artifact is derived only from the
 * published feeds for a set of categories, so every account with the same
 * categories gets byte-identical bytes — which is what makes an ETag worth
 * having and what would let a CDN in front of this do its job.
 *
 * The user's own block rules are deliberately *not* folded in. They are a
 * handful of domains, they already come down with `GET /blocklist`, and mixing
 * them in would make the artifact per-user and uncacheable to save a client a
 * trivial merge.
 */
@Injectable()
export class CompiledBlocklistService {
  private readonly logger = new Logger(CompiledBlocklistService.name);
  private readonly cache = new Map<string, CompiledArtifact>();

  constructor(private readonly prisma: PrismaService) {}

  async forCategories(categories: readonly ProtectionCategory[]): Promise<CompiledArtifact> {
    const wanted = [...new Set(categories)].sort();
    if (wanted.length === 0) {
      return this.empty(wanted);
    }

    // Latest published version per feed that serves any wanted category.
    const feeds = await this.prisma.feed.findMany({
      where: { enabled: true, categories: { hasSome: [...wanted] } },
      select: {
        id: true,
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: { id: true, sha256: true, artifact: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const published = feeds.flatMap((feed) => feed.versions);
    if (published.length === 0) return this.empty(wanted);

    // The cache key is the exact inputs: which categories, and which feed
    // versions. A refresh publishes a new version and the key changes with it,
    // so a stale artifact cannot be served.
    const key = `${wanted.join(',')}|${published.map((v) => v.sha256).sort().join(',')}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const started = Date.now();
    const domains: string[] = [];
    for (const version of published) {
      const text = gunzipSync(Buffer.from(version.artifact)).toString('utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        // The stored artifact carries a provenance header; skip it and blanks.
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        domains.push(trimmed);
      }
    }

    const body = compile(domains);
    const artifact: CompiledArtifact = {
      body,
      etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
      count: body.readUInt32LE(8),
      categories: wanted,
    };

    // One entry per category-combination in play; there are at most a handful,
    // and an entry is dropped as soon as its feeds are republished.
    this.cache.set(key, artifact);
    this.logger.log(
      `compiled ${artifact.count} domains for [${wanted.join(', ')}] ` +
        `-> ${(body.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - started}ms`,
    );
    return artifact;
  }

  private empty(categories: ProtectionCategory[]): CompiledArtifact {
    const body = compile([]);
    return {
      body,
      etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
      count: 0,
      categories,
    };
  }
}
