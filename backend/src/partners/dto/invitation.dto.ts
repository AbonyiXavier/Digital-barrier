import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


/**
 * Everything a partner is ever told, and nothing else.
 *
 * The product's promise is that a partner sees "a request to turn protection off,
 * and the reason you wrote with it". So: the first name of the person who invited
 * them, the word that person used to describe the relationship, and whether the
 * link still works. No email address, no device list, no rules, no counts, and —
 * since no such column exists anywhere in the schema — no domain.
 */
export class InvitationContextDto {
  @ApiProperty({
    description: 'False for a link that is unknown, already used, or expired.',
    example: true,
  })
  valid: boolean;

  @ApiPropertyOptional({
    description: "The inviting user's name. Their email is never returned.",
    example: 'Francis Abonyi',
  })
  inviterName?: string;

  @ApiPropertyOptional({ description: 'The name the user gave this partner.', example: 'Amara Abonyi' })
  partnerName?: string;

  @ApiPropertyOptional({ description: 'Free text, as the user wrote it.', example: 'Wife' })
  relationship?: string;

  @ApiPropertyOptional({ enum: ['active', 'pending', 'declined'], enumName: 'PartnerStatusId' })
  status?: 'active' | 'pending' | 'declined';

  @ApiPropertyOptional({ description: 'When this link stops working.' })
  expiresAt?: Date;
}

/** The answer to an invitation, echoed back for the confirmation screen. */
export class InvitationResponseDto {
  @ApiProperty({ enum: ['active', 'pending', 'declined'], enumName: 'PartnerStatusId' })
  status: 'active' | 'pending' | 'declined';

  @ApiProperty({ example: 'Francis Abonyi' })
  inviterName: string;

  @ApiProperty({ example: 'Amara Abonyi' })
  partnerName: string;
}
