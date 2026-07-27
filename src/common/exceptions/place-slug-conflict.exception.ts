import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class PlaceSlugConflictException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.PLACE_SLUG_CONFLICT,
      `Could not create a unique slug for place "${name}"`,
    );
  }
}
