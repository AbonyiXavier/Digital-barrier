import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DecideQueryDto {
  @ApiProperty({ description: 'The hostname to test.', example: 'www.pornhub.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  domain!: string;
}
