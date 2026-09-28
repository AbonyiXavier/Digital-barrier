import { ApiProperty } from '@nestjs/swagger';

import type { DisableRequest } from '../../generated/prisma/client';
import { toRequestMethodId, toRequestStatusId } from '../users/api-mappers';
import { intentToClient, type ClientIntent } from './request-codes';

/** The owner's view of their own request. */
export class RequestView {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: ['delay', 'partner'],
    description: 'Derived from the lock level when the request was raised.',
  })
  method: 'delay' | 'partner';

  @ApiProperty({ enum: ['disable', 'lower-level'] })
  intent: ClientIntent;

  @ApiProperty({ description: 'Set iff intent is lower-level.', type: Number, nullable: true })
  targetLevel: number | null;

  @ApiProperty({ enum: ['pending', 'approved', 'declined', 'expired', 'cancelled'] })
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled';

  @ApiProperty({ description: 'Empty string when none was given.' })
  reason: string;

  @ApiProperty()
  requestedAt: Date;

  @ApiProperty({
    description:
      'When this request resolves: the end of the countdown for a delay, or when ' +
      'it lapses for a partner request. Stored as two columns because they mean ' +
      'different things; exposed as one because a client only asks when.',
    type: Date,
    nullable: true,
  })
  resolvesAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  partnerId: string | null;

  @ApiProperty({ type: Date, nullable: true })
  decidedAt: Date | null;

  @ApiProperty({
    description: 'True for a DELAY request whose countdown has run out.',
  })
  ready: boolean;

  @ApiProperty({ type: String, nullable: true })
  clientRef: string | null;
}

export function toRequestView(row: DisableRequest, now: Date = new Date()): RequestView {
  return {
    id: row.id,
    method: toRequestMethodId(row.method),
    intent: intentToClient(row.intent),
    targetLevel: row.targetLevel,
    status: toRequestStatusId(row.status),
    reason: row.reason,
    requestedAt: row.requestedAt,
    resolvesAt: row.readyAt ?? row.expiresAt,
    partnerId: row.partnerId,
    decidedAt: row.decidedAt,
    ready: row.readyAt !== null && row.readyAt.getTime() <= now.getTime(),
    clientRef: row.clientRef,
  };
}

/**
 * What a partner sees, and the whole of it.
 *
 * The product promises a partner sees only "a request to turn protection off, and
 * the reason you wrote with it". So: the reason verbatim, when it was raised, when
 * it expires, and who is asking. No domains, no devices, no history, no request
 * id, not even the lock level -- every field here had to be justified, and the
 * shape is the enforcement.
 */
export class PartnerRequestView {
  @ApiProperty({ description: 'The name on the requesting account.' })
  requesterName: string;

  @ApiProperty({ description: "The requester's own words, unedited." })
  reason: string;

  @ApiProperty()
  requestedAt: Date;

  @ApiProperty()
  expiresAt: Date;
}

/** The outcome of a partner decision. Deliberately says nothing about the account. */
export class PartnerDecisionView {
  @ApiProperty({ enum: ['approved', 'declined'] })
  decision: 'approved' | 'declined';

  @ApiProperty()
  decidedAt: Date;
}
