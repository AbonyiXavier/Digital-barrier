import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, ValidateIf } from 'class-validator';

export class UpdatePartnerDto {
  @ApiProperty({
    description:
      'The partner who approves level 4 requests, or null to clear. Only a partner ' +
      'whose status is ACTIVE may be set: one who has accepted their invitation.',
    type: String,
    nullable: true,
    example: 'clx0partner0id',
  })
  @ValidateIf((o: UpdatePartnerDto) => o.partnerId !== null)
  @IsString()
  @Length(1, 64)
  partnerId: string | null;
}
