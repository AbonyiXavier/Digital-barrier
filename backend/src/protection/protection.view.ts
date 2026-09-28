import { ApiProperty } from '@nestjs/swagger';

import type { Protection } from '../../generated/prisma/client';
import { CATEGORY_REFS, categoryIdFor } from './categories';
import { LOCK_LEVELS, type LockLevel } from './lock-levels';

/**
 * What `/protection` returns.
 *
 * `pinHash` has no representation here, and that is the point: the only way for
 * the hash to leak is for someone to add a field to this class, which is a much
 * more visible act than forgetting a `select` somewhere. The API exposes
 * `pinSet` -- whether a PIN exists -- which is all the UI ever needed.
 */
export class ProtectionStateView {
  @ApiProperty({ description: 'Is filtering on. Independent of the lock and accountability.' })
  protectionOn: boolean;

  @ApiProperty({ description: 'Is a human looped in. Not implied by lockLevel 4.' })
  accountabilityOn: boolean;

  @ApiProperty({ description: '1 none | 2 pin | 3 delay | 4 partner.', enum: LOCK_LEVELS })
  lockLevel: LockLevel;

  @ApiProperty({ description: 'Whether a PIN exists. The hash itself is never returned.' })
  pinSet: boolean;

  @ApiProperty({ description: 'Level 3 countdown length. One of 15, 60, 1440, 2880.' })
  waitingPeriodMinutes: number;

  @ApiProperty({
    description:
      'The level 4 approver. Null at level 4 is a valid state the UI flags; it is ' +
      'not rejected here.',
    type: String,
    nullable: true,
  })
  partnerId: string | null;

  @ApiProperty({
    description:
      'The categories currently filtered, as the app\u2019s kebab-case ids. The raw '
      + 'database enum is never exposed: one concept, one shape across the API.',
    isArray: true,
    example: ['adult-websites', 'adult-apps'],
  })
  enabledCategories: string[];

  @ApiProperty()
  updatedAt: Date;
}

export function toProtectionView(row: Protection): ProtectionStateView {
  // Canonical order, so a client can compare two responses without sorting.
  const ordered = CATEGORY_REFS.filter((ref) => row.enabledCategories.includes(ref.key));
  return {
    protectionOn: row.protectionOn,
    accountabilityOn: row.accountabilityOn,
    lockLevel: row.lockLevel as LockLevel,
    pinSet: row.pinHash !== null && row.pinHash !== '',
    waitingPeriodMinutes: row.waitingPeriodMinutes,
    partnerId: row.partnerId,
    enabledCategories: ordered.map((ref) => categoryIdFor(ref.key)),
    updatedAt: row.updatedAt,
  };
}

export class CategoryRefView {
  @ApiProperty({ example: 'adult-search' })
  id: string;

  @ApiProperty({
    description: 'Display title. Deliberately not derived from the id: adult-search is "Safe search".',
    example: 'Safe search',
  })
  title: string;

  @ApiProperty({ example: 'Forces safe search on Google, Bing, DuckDuckGo and YouTube.' })
  description: string;

  @ApiProperty({ description: 'Premium categories are rejected with 402 on the FREE plan.' })
  premium: boolean;
}

export class PinGrantView {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({
    description:
      'Single-use, short-lived. Present it as the `grant` field or the `x-pin-grant` ' +
      'header on PUT /protection/enabled to turn protection off at lock level 2.',
  })
  grant: string;

  @ApiProperty()
  expiresAt: Date;
}
