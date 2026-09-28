import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

/**
 * PRIVACY BOUNDARY. A count and a date. Nothing else.
 *
 * The app's privacy screen promises blocked activity is "a number, never a name",
 * and the schema keeps that promise structurally: `BlockCount` has no column for a
 * domain, a URL or a category, so there is nowhere for one to go even if a client
 * sent it.
 *
 * This DTO is the second half of that guarantee. The global ValidationPipe runs
 * with `forbidNonWhitelisted: true`, so a body carrying `domain` or `url` is
 * rejected with 400 rather than quietly ignored — a silent drop would let a
 * client believe it was sending telemetry that the server was accepting, and the
 * next person to add a column would find the field already arriving. Do not relax
 * that flag, and do not add a field here.
 */
export class RecordBlocksDto {
  @ApiProperty({
    description: 'The day these blocks happened, UTC, as YYYY-MM-DD.',
    example: '2026-09-26',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day must be YYYY-MM-DD.' })
  day!: string;

  @ApiProperty({
    description: 'How many requests were blocked that day on this device. A count only.',
    example: 11,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  // A day's worth of DNS from one device cannot plausibly exceed this; a larger
  // number is a broken client, and clamping it silently would corrupt the chart.
  @Max(1_000_000)
  count!: number;
}
