import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


/**
 * A partner as the *user* sees them. The partner's own view is
 * `InvitationContextDto`, which is a much smaller thing.
 */
export class PartnerDto {
  @ApiProperty({ example: 'clx8yq0s10000u8v0h2a1b2c3' })
  id: string;

  @ApiProperty({ example: 'Amara Abonyi' })
  name: string;

  @ApiProperty({ example: 'Wife' })
  relationship: string;

  @ApiProperty({ example: 'amara@example.com' })
  email: string;

  @ApiProperty({ enum: ['active', 'pending', 'declined'], enumName: 'PartnerStatusId' })
  status: 'active' | 'pending' | 'declined';

  @ApiProperty({
    description:
      'First letters of the first two words of the name, uppercased. Computed, ' +
      'not stored — it is a rendering of the name, and a column would let the two drift.',
    example: 'AA',
  })
  initials: string;

  @ApiProperty({
    description: 'True if this partner is the approver for lock level 4.',
    example: true,
  })
  isApprover: boolean;

  @ApiProperty()
  invitedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  respondedAt: Date | null;

  @ApiPropertyOptional({
    description: 'When a PENDING invitation stops working. Null once answered.',
    nullable: true,
  })
  inviteExpiresAt: Date | null;

  @ApiPropertyOptional({
    description: "Echo of the client's optimistic id, when one was supplied.",
    nullable: true,
  })
  clientRef: string | null;
}

export class RemovePartnerResultDto {
  @ApiProperty({ example: 'clx8yq0s10000u8v0h2a1b2c3' })
  id: string;

  @ApiProperty({ example: true })
  removed: boolean;

  @ApiProperty({
    description:
      'True if this partner was the level-4 approver and the lock now has none. ' +
      'The lock level is deliberately left alone: weakening it as a side effect of ' +
      'a removal is exactly the loophole the lock exists to close.',
    example: false,
  })
  approverCleared: boolean;
}
