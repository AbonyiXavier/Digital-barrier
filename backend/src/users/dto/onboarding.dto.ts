import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn } from 'class-validator';

import { CATEGORY_IDS, type CategoryId } from '../api-mappers';

export class OnboardingDto {
  @ApiProperty({
    description:
      "The categories to filter, as the app's kebab-case ids. Converted to the " +
      'database enum server-side.',
    enum: CATEGORY_IDS,
    isArray: true,
    example: ['adult-websites', 'adult-apps'],
  })
  @IsArray()
  // At least one, matching the app: the Continue button is disabled on an empty
  // selection, and "protected" with nothing filtered is not a state to accept.
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(CATEGORY_IDS as readonly string[], { each: true })
  categories!: CategoryId[];
}
