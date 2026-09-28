import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccountabilityDto {
  @ApiProperty({
    description:
      'Independent of both protectionOn and lockLevel. Turning it off also clears ' +
      'the approver on the protection row; it does not change the lock, and the ' +
      'partner records themselves are retained.',
    example: true,
  })
  @IsBoolean()
  on: boolean;
}
