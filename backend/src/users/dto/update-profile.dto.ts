import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Francis Abonyi' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({
    example: 'francis@example.com',
    description: 'Changing this clears `emailVerified`.',
  })
  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  email?: string;
}
