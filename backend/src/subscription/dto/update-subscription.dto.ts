import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const PLAN_IDS = ['free', 'premium'] as const;
const PERIODS = ['monthly', 'yearly'] as const;

export class UpdateSubscriptionDto {
  @ApiProperty({ enum: PLAN_IDS })
  @IsIn(PLAN_IDS as readonly string[])
  plan!: (typeof PLAN_IDS)[number];

  @ApiProperty({
    enum: PERIODS,
    description:
      'Billing period. Kept even when dropping to free, so re-subscribing ' +
      'remembers the choice.',
  })
  @IsIn(PERIODS as readonly string[])
  period!: (typeof PERIODS)[number];
}

/**
 * `renewsAt` is deliberately not accepted. It is computed from `now` and the
 * period on the server: a client that could name its own renewal date could name
 * one ten years out, and a premium plan is exactly the thing a motivated user
 * has a reason to forge.
 */
