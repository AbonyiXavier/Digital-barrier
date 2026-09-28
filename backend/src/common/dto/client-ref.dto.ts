import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Base for every create request.
 *
 * The mobile store dispatches optimistically with a temporary id, then swaps in
 * the server's real one. Echoing that temporary id back makes the swap
 * unambiguous, and storing it makes a retried create idempotent instead of
 * duplicating the row — one column solving both problems.
 */
export class ClientRefDto {
  @ApiPropertyOptional({
    description: "The client's optimistic temporary id, echoed back on the created resource.",
    example: 'p_1758901234567',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9_.:-]+$/, { message: 'clientRef may only contain A-Z a-z 0-9 _ . : -' })
  clientRef?: string;
}
