import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ToggleCategoryDto {
  @ApiPropertyOptional({
    description:
      'The state to set. Omit to flip whatever the category is currently on. ' +
      'Sending the desired state makes a retried request idempotent, which a bare ' +
      'flip cannot be.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  on?: boolean;
}
