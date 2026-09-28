import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class AutoUpdateDto {
  @ApiProperty({
    description:
      'Whether feeds refresh on their own. NOTE: there is no column for this in the ' +
      'schema, so only `true` — the current behaviour — can be acknowledged. `false` ' +
      'answers 501 rather than pretending to have been saved.',
    example: true,
  })
  @IsBoolean()
  autoUpdate!: boolean;
}
