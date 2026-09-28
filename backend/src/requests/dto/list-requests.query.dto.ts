import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

import { STATUS_FILTERS, type StatusFilter } from '../request-codes';

export class ListRequestsQueryDto {
  @ApiPropertyOptional({
    description:
      "'pending' is the single open request; 'resolved' is everything else, including " +
      'declined and expired. Omit for the full history.',
    enum: STATUS_FILTERS,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;
}
