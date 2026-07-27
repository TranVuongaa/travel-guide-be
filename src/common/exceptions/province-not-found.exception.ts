import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class ProvinceNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.PROVINCE_NOT_FOUND,
      `Province ${id} not found`,
    );
  }
}
