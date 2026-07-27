import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class PlaceNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.PLACE_NOT_FOUND,
      `Place ${id} not found`,
    );
  }
}
