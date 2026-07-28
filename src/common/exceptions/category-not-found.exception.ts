import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class CategoryNotFoundException extends DomainException {
  constructor(id: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(status, ErrorCode.CATEGORY_NOT_FOUND, `Category ${id} not found`);
  }
}
