import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateEnabledDto {
  @ApiProperty({
    description:
      'Turning protection on is always free and immediate. Turning it off is only ' +
      'permitted directly at lock levels 1 and 2; at 3 and 4 the client must raise ' +
      'a disable request.',
    example: false,
  })
  @IsBoolean()
  on: boolean;

  @ApiPropertyOptional({
    description:
      'A grant from POST /protection/pin/verify. Required to turn protection off at ' +
      'lock level 2 when a PIN is set. May be sent in the `x-pin-grant` header instead.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  grant?: string;
}
