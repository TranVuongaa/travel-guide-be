import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class PlaceCategoryDuplicateException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.PLACE_CATEGORY_DUPLICATE,
      'Category IDs must be unique',
    );
  }
}
